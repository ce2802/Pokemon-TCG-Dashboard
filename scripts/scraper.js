#!/usr/bin/env node
/**
 * PokéDex Preise – Cardmarket Scraper v2
 * Nutzt Playwright mit realistischem Browser-Profil
 */

const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY
const LANG          = process.env.SCRAPE_LANG || 'D'
const CONDITION     = process.env.SCRAPE_COND || 'NM'

const LANG_IDS = { D:5, GB:1, F:2, I:3, E:4, PT:7, JP:8, KO:10 }
const COND_IDS = { MT:1, NM:2, EX:3, GD:4, LP:5, PL:6, PO:7 }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { enabled: false }
})

function slugify(name) {
  return (name || '')
    .replace(/&/g, 'and')
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[ûü]/g, 'u').replace(/[ö]/g, 'o').replace(/[ä]/g, 'a')
    .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`) }

function extractPrices(html) {
  const result = { price_low: null, price_trend: null, price_avg: null, offers_count: null }

  // Methode 1: JSON-Daten im Script-Tag (window.__NEXT_DATA__ oder ähnlich)
  const jsonMatches = html.matchAll(/"price"\s*:\s*"?([\d.]+)"?/g)
  const prices = []
  for (const m of jsonMatches) {
    const v = parseFloat(m[1])
    if (v > 0.01 && v < 50000) prices.push(v)
  }
  if (prices.length > 0) {
    prices.sort((a,b) => a-b)
    result.price_low = prices[0]
    result.offers_count = prices.length
  }

  // Methode 2: Price Trend aus HTML
  const trendPatterns = [
    /Price Trend[\s\S]{0,300}?([\d]+[,.][\d]+)\s*€/i,
    /Trend[\s\S]{0,100}?([\d]+[,.][\d]+)\s*€/i,
    /"trend"\s*:\s*"?([\d.]+)"?/i,
  ]
  for (const pat of trendPatterns) {
    const m = html.match(pat)
    if (m) {
      result.price_trend = parseFloat(m[1].replace(',', '.'))
      break
    }
  }

  // Methode 3: "Von X €" - günstigstes Angebot
  const fromPatterns = [
    /Von\s*<[^>]*>\s*([\d,]+)\s*€/i,
    /from\s*<[^>]*>\s*([\d.]+)\s*€/i,
    /Ab\s*([\d,]+)\s*€/i,
    /"low"\s*:\s*"?([\d.]+)"?/i,
  ]
  for (const pat of fromPatterns) {
    const m = html.match(pat)
    if (m && !result.price_low) {
      result.price_low = parseFloat(m[1].replace(',', '.'))
      break
    }
  }

  return result
}

async function scrapePage(page, card, langId, condId) {
  const setSlug  = slugify(card.set_name)
  const nameSlug = slugify(card.name)
  const params   = `language=${langId}&minCondition=${condId}`

  // Versuche direkte URL
  const directUrl = `https://www.cardmarket.com/de/Pokemon/Products/Singles/${setSlug}/${nameSlug}?${params}`

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(directUrl, { waitUntil: 'networkidle', timeout: 25000 })
      await sleep(2000 + Math.random() * 1000)

      const url  = page.url()
      let html   = await page.content()

      // Falls auf Suchseite weitergeleitet
      if (url.includes('/Search') || url.includes('searchString')) {
        const searchUrl = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&idCategory=1&${params}`
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 })
        await sleep(1500)
        html = await page.content()

        // Ersten Produktlink finden
        const linkMatch = html.match(/href="(\/de\/Pokemon\/Products\/Singles\/[^"?#]+)"/)
        if (!linkMatch) {
          log(`  ⚠ Nicht auf Cardmarket gefunden: ${card.name}`)
          return null
        }

        const productUrl = `https://www.cardmarket.com${linkMatch[1]}?${params}`
        await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 20000 })
        await sleep(2000)
        html = await page.content()
      }

      // URL für späteres Speichern
      const finalUrl = page.url().split('?')[0]
      await supabase.from('cards').update({ cm_url: finalUrl }).eq('id', card.id)

      const prices = extractPrices(html)

      // Debug: zeige was gefunden wurde
      if (prices.price_low || prices.price_trend) {
        return prices
      }

      // Falls nichts gefunden: Screenshot für Debugging
      log(`  ℹ Seite geladen aber kein Preis extrahierbar für ${card.name}`)

      if (attempt < 2) {
        log(`  ↻ Wiederhole...`)
        await sleep(3000)
      }
    } catch (err) {
      log(`  ⚠ Versuch ${attempt} fehlgeschlagen: ${err.message?.substring(0, 80)}`)
      if (attempt < 2) await sleep(3000)
    }
  }
  return null
}

async function main() {
  log(`=== Cardmarket Scraper v2 ===`)
  log(`Sprache: ${LANG} | Zustand: ${CONDITION}`)

  const langId = LANG_IDS[LANG] || 1
  const condId = COND_IDS[CONDITION] || 2

  const { data: cards, error } = await supabase.from('cards').select('*').order('name')
  if (error) { log(`FEHLER: ${error.message}`); process.exit(1) }
  if (!cards?.length) { log('Keine Karten in DB'); process.exit(0) }

  log(`${cards.length} Karten geladen`)

  const seen = new Set()
  const unique = cards.filter(c => {
    const key = `${c.name}||${c.set_name}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  log(`${unique.length} unique Karten zu scrapen`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--lang=de-DE,de',
    ]
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'de-DE',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' }
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] })
  })

  const page = await context.newPage()

  // Erst Startseite laden und Cookies akzeptieren
  log('Lade Cardmarket Startseite...')
  await page.goto('https://www.cardmarket.com/de/Pokemon', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)

  try {
    await page.click('button:has-text("Akzeptieren")', { timeout: 3000 })
    log('Cookies akzeptiert')
    await sleep(1000)
  } catch { log('Kein Cookie-Banner') }

  // Teste ob Cardmarket erreichbar
  const testHtml = await page.content()
  if (testHtml.length < 1000) {
    log('FEHLER: Cardmarket nicht erreichbar oder blockiert')
    await browser.close()
    process.exit(1)
  }
  log(`Cardmarket erreichbar (${testHtml.length} Zeichen)`)

  let success = 0, failed = 0
  const today = new Date().toISOString().split('T')[0]

  for (let i = 0; i < unique.length; i++) {
    const card = unique[i]
    log(`(${i+1}/${unique.length}) ${card.name} | ${card.set_name}`)

    const prices = await scrapePage(page, card, langId, condId)

    if (!prices || (!prices.price_low && !prices.price_trend && !prices.price_avg)) {
      log(`  ✗ Kein Preis gefunden`)
      failed++
    } else {
      const sameCards = cards.filter(c => c.name === card.name && c.set_name === card.set_name)
      const rows = sameCards.map(c => ({
        card_id: c.id, scraped_at: today,
        language: LANG, condition: CONDITION,
        price_low: prices.price_low, price_trend: prices.price_trend,
        price_avg: prices.price_avg, offers_count: prices.offers_count,
      }))

      const { error: insertError } = await supabase
        .from('prices')
        .upsert(rows, { onConflict: 'card_id,scraped_at,language,condition' })

      if (insertError) {
        log(`  ✗ DB: ${insertError.message}`)
        failed++
      } else {
        const p = prices.price_low || prices.price_trend
        log(`  ✓ ${p?.toFixed(2)} € (${prices.offers_count || '?'} Angebote)`)
        success++
      }
    }

    await sleep(2000 + Math.random() * 1000)
  }

  await browser.close()
  log(`=== Fertig: ${success} erfolgreich, ${failed} fehlgeschlagen ===`)
  process.exit(failed > success ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(1) })
