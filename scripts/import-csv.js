#!/usr/bin/env node
/**
 * DEX CSV → Supabase importieren
 * Aufruf: node scripts/import-csv.js ./dexcollection.csv
 */

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fehler: SUPABASE_URL und SUPABASE_SERVICE_KEY müssen gesetzt sein.')
  console.error('Kopiere .env.local.example zu .env.local und fülle die Werte aus.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Aufruf: node scripts/import-csv.js ./dexcollection.csv')
  process.exit(1)
}

function slugify(name) {
  return (name || '')
    .replace(/&/g, 'and')
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[ûü]/g, 'u').replace(/[ö]/g, 'o').replace(/[ä]/g, 'a')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

async function fetchImageUrl(cardId) {
  try {
    const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    const d = await r.json()
    return d.image ? `${d.image}/low.webp` : null
  } catch { return null }
}

async function main() {
  // CSV lesen (UTF-16)
  const raw = fs.readFileSync(csvPath)
  // BOM entfernen & dekodieren
  let text
  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    text = raw.slice(2).swap16 ? raw.slice(2).toString('utf16le') : raw.toString('utf16le')
  } else {
    text = raw.toString('utf8')
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const hdr   = lines[0].split(';').map(h => h.trim().toLowerCase())
  const col   = k => hdr.indexOf(k)

  const C = {
    cat:     col('category'),
    locale:  col('locale'),
    series:  col('series'),
    set:     col('set'),
    id:      col('id'),
    name:    col('name'),
    variant: col('variant'),
    rarity:  col('rarity'),
    qty:     col('quantity'),
    price:   col('price'),
  }

  const cards = []
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(';')
    if (p.length < 6) continue
    const g = idx => (idx >= 0 && idx < p.length) ? p[idx].trim() : ''

    const rawId   = g(C.id)
    const variant = g(C.variant) || 'Normal'
    const uid     = `${rawId}|${variant}`   // Unique ID inkl. Variante

    const priceStr = g(C.price).replace(/[€\u00A0\s]/g, '').replace(',', '.')
    const dexPrice = isNaN(parseFloat(priceStr)) ? null : parseFloat(priceStr)

    const setName  = g(C.set)
    const cardName = g(C.name)
    const cmUrl    = `https://www.cardmarket.com/de/Pokemon/Products/Singles/${slugify(setName)}/${slugify(cardName)}`

    cards.push({
      id:        uid,
      card_id:   rawId,
      name:      cardName,
      set_name:  setName,
      series:    g(C.series),
      card_number: rawId.split('-')[1] || '',
      variant,
      rarity:    g(C.rarity),
      quantity:  parseInt(g(C.qty)) || 0,
      category:  g(C.cat),
      dex_price: dexPrice,
      image_url: null,   // wird unten befüllt
      cm_url:    cmUrl,
    })
  }

  console.log(`${cards.length} Karten aus CSV gelesen`)

  // Bilder per TCGdex laden (optional, im Hintergrund)
  const uniqueIds = [...new Set(cards.map(c => c.card_id))]
  console.log(`Lade ${uniqueIds.length} Kartenbilder von TCGdex…`)

  const imgMap = {}
  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i]
    imgMap[id] = await fetchImageUrl(id)
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${uniqueIds.length} Bilder geladen`)
    await new Promise(r => setTimeout(r, 80))
  }

  // Bilder zuweisen
  cards.forEach(c => { c.image_url = imgMap[c.card_id] || null })

  // In Supabase speichern (Batches à 100)
  console.log('Speichere in Supabase…')
  const BATCH = 100
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH)
    const { error } = await supabase
      .from('cards')
      .upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error(`Fehler bei Batch ${i}–${i + BATCH}:`, error.message)
    } else {
      console.log(`  ✓ ${Math.min(i + BATCH, cards.length)}/${cards.length} importiert`)
    }
  }

  console.log('Import abgeschlossen!')
}

main().catch(err => {
  console.error('Fehler:', err)
  process.exit(1)
})
