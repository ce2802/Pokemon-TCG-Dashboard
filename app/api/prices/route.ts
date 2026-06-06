import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cardId = searchParams.get('id')
  const lang   = searchParams.get('lang') || 'D'
  const cond   = searchParams.get('cond') || 'NM'

  if (!cardId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('price_history_30d')
    .select('scraped_at, price_low, price_trend, price_avg')
    .eq('card_id', cardId)
    .eq('language', lang)
    .eq('condition', cond)
    .order('scraped_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ history: data || [] })
}
