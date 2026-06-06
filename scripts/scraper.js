#!/usr/bin/env node
/**
 * PokéDex Preise – Cardmarket Scraper
 * Läuft täglich via GitHub Actions mit Playwright (echter Chromium)
 * Liest Karten aus Supabase, scrapt Cardmarket, speichert Preise zurück
 */

const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_KEY
const LANG              = process.env.SCRAPE_LANG || 'D'
const CONDITION         = process.env.SCRAPE_COND || 'NM'
const DELAY_MS          = 2500   // Pause zwischen Requests (höflich)
const RETRY_MAX         = 2      // Anzahl Wiederholungsversuche

// Cardmarket Sprach-IDs
const LANG_IDS = { D:5, GB:1, F:2, I:3, E:4, PT:7, JP:8, KO:10, NL:6, RU:9 }
// Cardmarket Zustands-IDs (minCondition = mindestens dieser Zustand)
const COND_IDS = { MT:1, NM:2, EX:3, GD:4, LP:5, PL:6, PO:7 }

// ── Supabase ─────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────
function slugify(name) {
  return (name || '')
    .replace(/&/g, 'and')
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[ûü]/g, 'u').replace(/[ö]/g, 'o').replace(/[ä]/g, 'a')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

// ── Preis aus Seite extrahieren ───────────────────────────────
function extractPrices(html) {
  const result = { price_low: null, price_trend: null, price_avg: null, offers_count: null }

  // Methode 1: articleRow JSON (Cardmarket embedded data)
  const jsonMatch = html.match(/window\.App\.articleRows\s*=\s*(\[[\s\S]*?\]);/)
  if (jsonMatch) {
    try {
      const articles = JSON.parse(jsonMatch[1])
      const prices = articles
        .filter(a => a.price && parseFloat(a.price) > 0)
        .map(a => parseFloat(a.price))
        .sort((a, b) => a - b)

      if (prices.length > 0) {
        result.price_low     = prices[0]
        result.price_avg     = prices.reduce((s, p) => s + p, 0) / prices.length
        result.offers_count  = prices.length
      }
    } catch (e) { /* weiter */ }
  }

  // Methode 2: Price Guide Werte aus HTML
  // "Price Trend" Wert
  const trendMatch = html.match(/Price Trend[\s\S]{0,200}?([\d]+[,.][\d]+)\s*€/i)
  if (trendMatch) {
    result.price_trend = parseFloat(trendMatch[1].replace(',', '.'))
  }

  // "From" Preis (günstigstes Angebot)
  const fromMatch = html.match(/class="[^"]*color-primary[^"]*"[^>]*>\s*([\d]+[,.][\d]+)\s*€/)
  if (fromMatch && !result.price_low) {
    result.price_low = parseFloat(fromMatch[1].replace(',', '.'))
  }

  // Fallback: erste Preis-Zahl auf der Seite
  if (!result.price_low && !result.price_trend) {
    const anyPrice = html.match(/([\d]+[,.][\d]{2})\s*€/)
    if (anyPrice) {
      const val = parseFloat(anyPrice[1].replace(',', '.'))
      if (val > 0.01 && val < 50000) result.price_low = val
    }
  }

  return result
}

// ── Cardmarket Seite scrapen ──────────────────────────────────
async function scrapePage(page, card, langId, condId) {
  const setSlug  = slugify(card.set_name)
  const nameSlug = slugify(card.name)
  const langParam = `language=${langId}`
  const condParam = `minCondition=${condId}`

  // Direkte URL zuerst
  const directUrl = `https://www.cardmarket.com/de/Pokemon/Products/Singles/${setSlug}/${nameSlug}?${langParam}&${condParam}`

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await sleep(1500)

      const currentUrl = page.url()
      let html = await page.content()

      // Falls auf Suche umgeleitet → ersten Treffer nehmen
      if (currentUrl.includes('/Search') || html.includes('Keine Ergebnisse')) {
        const searchUrl = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&idCategory=1&${langParam}&${condParam}`
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await sleep(1500)
        html = await page.content()

        // Ersten Singles-Link finden
        const linkMatch = html.match(/href="(\/de\/Pokemon\/Products\/Singles\/[^"?#]+)"/)
        if (!linkMatch) {
          log(`  ⚠ Nicht gefunden: ${card.name} (${card.set_name})`)
          return null
        }

        const productUrl = `https://www.cardmarket.com${linkMatch[1]}?${langParam}&${condParam}`
        await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await sleep(1500)
        html = await page.content()
      }

      const prices = extractPrices(html)
      const finalUrl = page.url().split('?')[0]

      // Cardmarket URL in cards updaten
      await supabase
        .from('cards')
        .update({ cm_url: finalUrl })
        .eq('id', card.id)

      return prices

    } catch (err) {
      log(`  ⚠ Versuch ${attempt}/${RETRY_MAX} fehlgeschlagen: ${err.message}`)
      if (attempt < RETRY_MAX) await sleep(3000)
    }
  }
  return null
}

// ── Hauptfunktion ─────────────────────────────────────────────
async function main() {
  log(`=== Cardmarket Scraper gestartet ===`)
  log(`Sprache: ${LANG} | Zustand: ${CONDITION}`)

  const langId = LANG_IDS[LANG] || 1
  const condId = COND_IDS[CONDITION] || 2

  // Karten aus Supabase laden
  const { data: cards, error } = await supabase
    .from('cards')
    .select('*')
    .order('name')

  if (error) { log(`FEHLER beim Laden der Karten: ${error.message}`); process.exit(1) }
  if (!cards?.length) { log('Keine Karten in der Datenbank. Bitte zuerst CSV importieren.'); process.exit(0) }

  log(`${cards.length} Karten geladen`)

  // Dedupliziere nach Name + Set (verschiedene Varianten = gleicher CM-Preis)
  const seen = new Set()
  const uniqueCards = cards.filter(c => {
    const key = `${c.name}||${c.set_name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  log(`${uniqueCards.length} unique Name+Set Kombinationen zu scrapen`)

  // Playwright starten
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=de-DE']
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'de-DE',
    extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' }
  })

  // Bot-Detection umgehen
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()

  // Cardmarket-Cookie erst setzen (Cookie-Banner akzeptieren)
  log('Öffne Cardmarket & akzeptiere Cookies…')
  await page.goto('https://www.cardmarket.com/de/Pokemon', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)

  try {
    const cookieBtn = page.locator('button:has-text("Akzeptieren"), button:has-text("Accept"), #cookieBanner button').first()
    if (await cookieBtn.isVisible({ timeout: 3000 })) {
      await cookieBtn.click()
      await sleep(1000)
    }
  } catch { /* kein Cookie-Banner */ }

  // Scraping-Loop
  let success = 0, failed = 0
  const today = new Date().toISOString().split('T')[0]

  for (let i = 0; i < uniqueCards.length; i++) {
    const card = uniqueCards[i]
    log(`(${i + 1}/${uniqueCards.length}) ${card.name} | ${card.set_name}`)

    const prices = await scrapePage(page, card, langId, condId)

    if (!prices || (!prices.price_low && !prices.price_trend && !prices.price_avg)) {
      log(`  ✗ Kein Preis gefunden`)
      failed++
    } else {
      // Alle Varianten mit gleichem Name+Set bekommen den gleichen Preis
      const sameCards = cards.filter(c => c.name === card.name && c.set_name === card.set_name)

      const rows = sameCards.map(c => ({
        card_id:      c.id,
        scraped_at:   today,
        language:     LANG,
        condition:    CONDITION,
        price_low:    prices.price_low,
        price_trend:  prices.price_trend,
        price_avg:    prices.price_avg,
        offers_count: prices.offers_count,
      }))

      const { error: insertError } = await supabase
        .from('prices')
        .upsert(rows, { onConflict: 'card_id,scraped_at,language,condition' })

      if (insertError) {
        log(`  ✗ DB Fehler: ${insertError.message}`)
        failed++
      } else {
        const p = prices.price_low || prices.price_trend || prices.price_avg
        log(`  ✓ ${p?.toFixed(2)} € (${prices.offers_count || '?'} Angebote)`)
        success++
      }
    }

    // Pause zwischen Requests
    await sleep(DELAY_MS + Math.random() * 500)
  }

  await browser.close()

  log(`=== Fertig: ${success} erfolgreich, ${failed} fehlgeschlagen ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err)
  process.exit(1)
})
