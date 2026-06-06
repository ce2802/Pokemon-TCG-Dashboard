import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service-Client nur serverseitig (für Scraper / API Routes)
export function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!
  return createClient(supabaseUrl, serviceKey)
}

export type Card = {
  id: string
  name: string
  set_name: string
  series: string
  card_number: string
  variant: string
  rarity: string
  quantity: number
  category: string
  dex_price: number | null
  image_url: string | null
  cm_url: string | null
}

export type PriceRecord = {
  id: number
  card_id: string
  scraped_at: string
  language: string
  condition: string
  price_low: number | null
  price_trend: number | null
  price_avg: number | null
}
