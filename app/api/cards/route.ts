import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getDB() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error(`Missing env: url=${url} key=${key ? 'ok' : 'missing'}`)
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const lang     = searchParams.get('lang') || 'D'
    const cond     = searchParams.get('cond') || 'NM'
    const category = searchParams.get('category') || ''
    const series   = searchParams.get('series') || ''
    const db = getDB()

    let q = db.from('cards').select('*').order('name')
    if (category) q = q.eq('category', category)
    if (series)   q = q.eq('series', series)

    const { data: cards, error: cardError } = await q
    if (cardError) return NextResponse.json({ error: cardError.message }, { status: 500 })

    const { data: prices } = await db
      .from('latest_prices')
      .select('card_id, scraped_at, price_low, price_trend, price_avg, offers_count')
      .eq('language', lang)
      .eq('condition', cond)

    const priceMap = new Map(prices?.map(p => [p.card_id, p]) || [])
    const result = cards?.map(card => ({ ...card, price_live: priceMap.get(card.id) || null }))
    return NextResponse.json({ cards: result, lang, cond })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { cards } = await req.json()
    if (!cards?.length) return NextResponse.json({ error: 'Keine Karten' }, { status: 400 })

    const db = getDB()
    const BATCH = 100
    let imported = 0

    for (let i = 0; i < cards.length; i += BATCH) {
      const batch = cards.slice(i, i + BATCH)
      const { error } = await db.from('cards').upsert(batch, { onConflict: 'id' })
      if (error) return NextResponse.json({ error: `Batch ${i}: ${error.message}` }, { status: 500 })
      imported += batch.length
    }

    loadImages(cards.map((c: any) => c.card_id), db)
    return NextResponse.json({ imported })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function loadImages(cardIds: string[], db: any) {
  const unique = Array.from(new Set(cardIds)) as string[]
  for (const id of unique) {
    try {
      const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) continue
      const d = await r.json()
      const imgUrl = d.image ? `${d.image}/low.webp` : null
      if (imgUrl) await db.from('cards').update({ image_url: imgUrl }).like('id', `${id}|%`)
    } catch { }
    await new Promise(r => setTimeout(r, 80))
  }
}
