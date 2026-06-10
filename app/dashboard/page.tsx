'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, Upload, CheckCircle, FileJson } from 'lucide-react'
import PriceChart from '@/components/PriceChart'

// ── Types ─────────────────────────────────────────────────────
type PriceLive = {
  price_low: number | null
  price_trend: number | null
  price_avg: number | null
  avg7: number | null
  avg30: number | null
  scraped_at: string | null
}
type Card = {
  id: string; card_id: string; name: string; set_name: string
  series: string; variant: string; rarity: string; quantity: number
  category: string; dex_price: number | null; image_url: string | null
  cm_url: string | null; price_live: PriceLive | null
}
type SortKey = 'name' | 'set_name' | 'rarity' | 'quantity' | 'dex_price' | 'price_low' | 'price_trend' | 'diff'
type SortDir = 'asc' | 'desc'

// ── Cardmarket JSON Types ─────────────────────────────────────
type CMProduct = { idProduct: number; name: string; idExpansion: number; idMetacard: number }
type CMPrice   = { idProduct: number; avg: number | null; low: number | null; trend: number | null; avg7: number | null; avg30: number | null; 'avg-holo': number | null; 'low-holo': number | null; 'trend-holo': number | null; 'avg7-holo': number | null; 'avg30-holo': number | null }

const CONDITIONS = [
  { value: 'MT', label: 'Mint' }, { value: 'NM', label: 'Near Mint' },
  { value: 'EX', label: 'Excellent' }, { value: 'GD', label: 'Good' },
  { value: 'LP', label: 'Light Played' }, { value: 'PL', label: 'Played' },
  { value: 'PO', label: 'Poor' },
]

const fmt = (v: number | null | undefined) => v == null ? '–' : (v / 100 < 0.01 ? v : v).toFixed(2).replace('.', ',') + ' €'
const fmtPrice = (v: number | null | undefined) => v == null ? '–' : v.toFixed(2).replace('.', ',') + ' €'

function rarityClass(r: string) {
  const n = (r || '').toLowerCase().replace(/\s+/g, '')
  if (n.includes('uncommon'))  return 'rb-u'
  if (n.includes('common'))    return 'rb-c'
  if (n.includes('holo'))      return 'rb-h'
  if (n.includes('ultra') || n.includes('double') || n.includes('illustration') || n.includes('shiny')) return 'rb-x'
  if (n.includes('rare'))      return 'rb-r'
  if (n.includes('promo'))     return 'rb-p'
  return 'rb-s'
}

function slugify(name: string) {
  return (name || '').replace(/&/g, 'and').replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
    .replace(/[ûü]/g, 'u').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

// ── CSV Parser ────────────────────────────────────────────────
function parseCSV(text: string): Omit<Card, 'price_live'>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const hdr = lines[0].split(';').map(h => h.trim().toLowerCase())
  const col = (k: string) => hdr.indexOf(k)
  const C = {
    cat: col('category'), series: col('series'), set: col('set'), id: col('id'),
    name: col('name'), variant: col('variant'), rarity: col('rarity'),
    qty: col('quantity'), price: col('price')
  }
  const cards: Omit<Card, 'price_live'>[] = []
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(';')
    if (p.length < 6) continue
    const g = (idx: number) => (idx >= 0 && idx < p.length) ? p[idx].trim() : ''
    const rawId = g(C.id), variant = g(C.variant) || 'Normal'
    const pr = g(C.price).replace(/[€\u00A0\s]/g, '').replace(',', '.')
    const setName = g(C.set), cardName = g(C.name)
    cards.push({
      id: `${rawId}|${variant}`, card_id: rawId, name: cardName,
      set_name: setName, series: g(C.series),
      variant, rarity: g(C.rarity), quantity: parseInt(g(C.qty)) || 0,
      category: g(C.cat), dex_price: isNaN(parseFloat(pr)) ? null : parseFloat(pr),
      cm_url: `https://www.cardmarket.com/de/Pokemon/Products/Singles/${slugify(setName)}/${slugify(cardName)}`,
      image_url: null,
    })
  }
  return cards
}

// ── Cardmarket Price Matcher ──────────────────────────────────
function buildNameIndex(products: CMProduct[]): Map<string, CMProduct[]> {
  const idx = new Map<string, CMProduct[]>()
  for (const p of products) {
    const base = p.name.split('[')[0].split(' Lv.')[0].trim()
    if (!idx.has(base)) idx.set(base, [])
    idx.get(base)!.push(p)
  }
  return idx
}

function matchPrices(
  cards: Omit<Card, 'price_live'>[],
  products: CMProduct[],
  priceGuides: CMPrice[],
  priceType: string
): Card[] {
  const priceMap = new Map<number, CMPrice>(priceGuides.map(p => [p.idProduct, p]))
  const nameIdx  = buildNameIndex(products)
  const today    = new Date().toISOString().split('T')[0]

  return cards.map(card => {
    const isHolo = /holo|reverse/i.test(card.variant)
    const matches = nameIdx.get(card.name) || []

    let bestPrice: CMPrice | null = null
    for (const m of matches) {
      const price = priceMap.get(m.idProduct)
      if (price && (price.trend != null || price.low != null)) {
        bestPrice = price
        break
      }
    }

    if (!bestPrice) return { ...card, price_live: null }

    const get = (key: string) => {
      const v = (bestPrice as any)[isHolo ? `${key}-holo` : key]
      return v != null ? v : (bestPrice as any)[key]
    }

    const price_low   = get('low')
    const price_trend = get('trend')
    const price_avg   = get('avg')
    const avg7        = get('avg7')
    const avg30       = get('avg30')

    // CM URL verbessern
    const firstMatch = matches.find(m => priceMap.get(m.idProduct)?.trend != null)
    const cmUrl = firstMatch
      ? `https://www.cardmarket.com/de/Pokemon/Products/Singles/-/${firstMatch.idProduct}`
      : card.cm_url

    return {
      ...card,
      cm_url: cmUrl,
      price_live: { price_low, price_trend, price_avg, avg7, avg30, scraped_at: today }
    }
  })
}

// ── Upload Buttons ────────────────────────────────────────────
function FileUploadBtn({ label, icon, loaded, onFile }: {
  label: string; icon: React.ReactNode; loaded: boolean; onFile: (f: File) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#55556a' }}>
        {label}
      </label>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '9px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12,
        cursor: 'pointer', whiteSpace: 'nowrap',
        background: loaded ? 'rgba(41,224,134,0.12)' : 'rgba(78,158,255,0.08)',
        border: `1px solid ${loaded ? 'rgba(41,224,134,0.3)' : 'rgba(78,158,255,0.2)'}`,
        color: loaded ? '#29e086' : '#4e9eff', fontFamily: 'inherit',
      }}>
        {loaded ? <CheckCircle size={13} /> : icon}
        {loaded ? 'Geladen ✓' : 'Laden'}
        <input type="file" accept=".json,.csv" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const [cards, setCards]           = useState<Card[]>([])
  const [rawCards, setRawCards]     = useState<Omit<Card, 'price_live'>[]>([])
  const [cmProducts, setCmProducts] = useState<CMProduct[]>([])
  const [cmPrices, setCmPrices]     = useState<CMPrice[]>([])
  const [priceType, setPriceType]   = useState('trend')
  const [search, setSearch]         = useState('')
  const [seriesFilter, setSeriesFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [viewFilter, setViewFilter] = useState('all')
  const [sortKey, setSortKey]       = useState<SortKey>('name')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [pricesDate, setPricesDate] = useState<string | null>(null)

  // Wenn alle 3 Quellen geladen → Preise matchen
  useEffect(() => {
    if (rawCards.length && cmProducts.length && cmPrices.length) {
      const matched = matchPrices(rawCards, cmProducts, cmPrices, priceType)
      setCards(matched)
    }
  }, [rawCards, cmProducts, cmPrices, priceType])

  // CSV laden
  function handleCSV(file: File) {
    const r = new FileReader()
    r.onload = ev => {
      let text = ev.target?.result as string
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      setRawCards(parseCSV(text))
    }
    r.readAsText(file, 'UTF-16')
  }

  // Produktkatalog laden
  function handleProducts(file: File) {
    const r = new FileReader()
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        const products: CMProduct[] = data.products || []
        setCmProducts(products)
      } catch (e) { alert('Fehler beim Laden des Produktkatalogs') }
    }
    r.readAsText(file)
  }

  // Preisverzeichnis laden
  function handlePrices(file: File) {
    const r = new FileReader()
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setCmPrices(data.priceGuides || [])
        if (data.createdAt) setPricesDate(data.createdAt.split('T')[0])
      } catch (e) { alert('Fehler beim Laden des Preisverzeichnisses') }
    }
    r.readAsText(file)
  }

  // Filter + Sort
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = cards.filter(c => {
    if (viewFilter === 'owned'      && c.quantity <= 0) return false
    if (viewFilter === 'collection' && c.category !== 'Meine Sammlung') return false
    if (viewFilter === 'wishlist'   && c.category !== 'Wishlist') return false
    if (rarityFilter && c.rarity !== rarityFilter) return false
    if (seriesFilter && c.series !== seriesFilter) return false
    if (catFilter    && c.category !== catFilter)  return false
    if (search) {
      const h = `${c.name} ${c.set_name} ${c.variant} ${c.rarity} ${c.card_id}`.toLowerCase()
      if (!h.includes(search.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => {
    let av: any, bv: any
    if (sortKey === 'price_low')   { av = a.price_live?.price_low;   bv = b.price_live?.price_low }
    else if (sortKey === 'price_trend') { av = a.price_live?.price_trend; bv = b.price_live?.price_trend }
    else if (sortKey === 'diff') {
      av = (a.price_live?.price_trend != null && a.dex_price != null) ? a.price_live.price_trend - a.dex_price : null
      bv = (b.price_live?.price_trend != null && b.dex_price != null) ? b.price_live.price_trend - b.dex_price : null
    } else { av = (a as any)[sortKey]; bv = (b as any)[sortKey] }
    if (av == null) return 1; if (bv == null) return -1
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const owned   = filtered.filter(c => c.quantity > 0)
  const liveVal = owned.filter(c => c.price_live?.price_trend != null)
                       .reduce((s, c) => s + c.price_live!.price_trend! * c.quantity, 0)
  const dexVal  = owned.filter(c => c.dex_price != null)
                       .reduce((s, c) => s + c.dex_price! * c.quantity, 0)
  const allSeries   = Array.from(new Set(cards.map(c => c.series))).filter(Boolean).sort()
  const allRarities = Array.from(new Set(cards.map(c => c.rarity))).filter(Boolean).sort()

  function SI({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={11} style={{ opacity: 0.25 }} />
    return sortDir === 'asc' ? <ChevronUp size={11} style={{ color: '#ffd426' }} /> : <ChevronDown size={11} style={{ color: '#ffd426' }} />
  }

  const sel = (value: string, onChange: (v: string) => void, children: React.ReactNode, minW = 145) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: '#1a1a2a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
      color: '#f0f0f8', padding: '9px 28px 9px 12px', fontFamily: 'inherit',
      fontSize: 13, minWidth: minW, cursor: 'pointer', appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2355556a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
    }}>{children}</select>
  )

  const allLoaded = rawCards.length > 0 && cmProducts.length > 0 && cmPrices.length > 0

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d14', color: '#f0f0f8', fontFamily: "'DM Sans', 'Nunito', sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 10% 10%, rgba(255,61,61,0.06) 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 90% 90%, rgba(78,158,255,0.05) 0%, transparent 70%)' }} />

      {/* HEADER */}
      <header style={{ position: 'relative', zIndex: 20, borderBottom: '1px solid rgba(255,61,61,0.12)', background: 'linear-gradient(180deg, rgba(255,61,61,0.1) 0%, transparent 100%)', padding: '0 40px' }}>
        <div style={{ maxWidth: 1500, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24, padding: '18px 0' }}>
          <svg width="52" height="52" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 0 12px rgba(255,61,61,0.5))', flexShrink: 0 }}>
            <circle cx="50" cy="50" r="47" fill="#1a1a2a" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
            <path d="M3 50 Q3 3 50 3 Q97 3 97 50Z" fill="#ff3d3d"/>
            <rect x="3" y="46" width="94" height="8" fill="#0d0d14"/>
            <circle cx="50" cy="50" r="13" fill="#1a1a2a" stroke="rgba(255,255,255,0.12)" strokeWidth="2"/>
            <circle cx="50" cy="50" r="5.5" fill="rgba(255,255,255,0.12)"/>
          </svg>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2, color: '#fff', lineHeight: 1 }}>PokéDex Preise</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1px', marginTop: 4, textTransform: 'uppercase' }}>
              Cardmarket Official Data{pricesDate ? ` · Stand: ${pricesDate}` : ''}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            {[
              { val: cards.length,   lbl: 'Karten' },
              { val: owned.length,   lbl: 'Im Besitz' },
              { val: liveVal > 0 ? fmtPrice(liveVal) : '–', lbl: 'CM-Wert (Trend)' },
              { val: dexVal  > 0 ? fmtPrice(dexVal)  : '–', lbl: 'DEX-Wert' },
            ].map(({ val, lbl }) => (
              <div key={lbl} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 99, padding: '8px 18px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 900, color: '#ffd426', lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* STEP GUIDE wenn nicht alle Dateien geladen */}
      {!allLoaded && (
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 1500, margin: '24px auto 0', padding: '0 40px' }}>
          <div style={{ background: 'rgba(78,158,255,0.06)', border: '1px solid rgba(78,158,255,0.2)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4e9eff', marginBottom: 12 }}>📥 Lade diese 3 Dateien um loszulegen:</div>
            <div style={{ fontSize: 12, color: '#8888aa', lineHeight: 1.8 }}>
              <div>1. <strong style={{ color: '#f0f0f8' }}>DEX CSV</strong> — Export aus der Dex-App (deine Sammlung)</div>
              <div>2. <strong style={{ color: '#f0f0f8' }}>Produktkatalog</strong> — Von <a href="https://www.cardmarket.com/de/Pokemon/Data/Product-List" target="_blank" style={{ color: '#4e9eff' }}>cardmarket.com/de/Pokemon/Data/Product-List</a> → <code style={{ background: '#1a1a2a', padding: '1px 5px', borderRadius: 4 }}>products_singles_6.json</code></div>
              <div>3. <strong style={{ color: '#f0f0f8' }}>Preisverzeichnis</strong> — Von <a href="https://www.cardmarket.com/de/Pokemon/Data/Price-Guide" target="_blank" style={{ color: '#4e9eff' }}>cardmarket.com/de/Pokemon/Data/Price-Guide</a> → <code style={{ background: '#1a1a2a', padding: '1px 5px', borderRadius: 4 }}>price_guide_6.json</code></div>
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1500, margin: '16px auto 0', padding: '0 40px' }}>
        <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 22px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>

            <FileUploadBtn label="1. DEX CSV" icon={<Upload size={13} />}
              loaded={rawCards.length > 0} onFile={handleCSV} />

            <FileUploadBtn label="2. Produktkatalog (products_singles_6.json)" icon={<FileJson size={13} />}
              loaded={cmProducts.length > 0} onFile={handleProducts} />

            <FileUploadBtn label="3. Preisverzeichnis (price_guide_6.json)" icon={<FileJson size={13} />}
              loaded={cmPrices.length > 0} onFile={handlePrices} />

            <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', margin: '0 4px' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#55556a' }}>Preis-Typ</label>
              {sel(priceType, setPriceType, <>
                <option value="trend">Price Trend</option>
                <option value="avg">Aktueller Ø</option>
                <option value="low">Ab-Preis</option>
                <option value="avg7">7-Tage Ø</option>
                <option value="avg30">30-Tage Ø</option>
              </>)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#55556a' }}>Ansicht</label>
              {sel(viewFilter, setViewFilter, <>
                <option value="all">Alle Karten</option>
                <option value="owned">Nur im Besitz</option>
                <option value="collection">Nur Sammlung</option>
                <option value="wishlist">Nur Wishlist</option>
              </>)}
            </div>

          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1500, margin: '20px auto 60px', padding: '0 40px' }}>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { val: filtered.length, lbl: 'Einträge gefiltert', acc: '#4e9eff' },
            { val: owned.length, lbl: 'Im Besitz', acc: '#29e086' },
            { val: liveVal > 0 ? fmtPrice(liveVal) : '–', lbl: 'CM-Wert Trend (Besitz)', acc: '#ffd426' },
            { val: dexVal > 0 ? fmtPrice(dexVal) : '–', lbl: 'DEX-Wert (Besitz)', acc: '#55556a' },
          ].map(({ val, lbl, acc }) => (
            <div key={lbl} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '15px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: acc }} />
              <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: '#f0f0f8', lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 10, color: '#55556a', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#55556a' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, Set, Variante, ID …"
              style={{ width: '100%', background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: '#f0f0f8', padding: '9px 14px 9px 34px', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
          </div>
          {sel(seriesFilter, setSeriesFilter, <><option value="">Alle Serien</option>{allSeries.map(s => <option key={s} value={s}>{s}</option>)}</>, 160)}
          {sel(rarityFilter, setRarityFilter, <><option value="">Alle Seltenheiten</option>{allRarities.map(r => <option key={r} value={r}>{r}</option>)}</>, 160)}
          {sel(catFilter, setCatFilter, <><option value="">Alle Kategorien</option><option value="Meine Sammlung">Meine Sammlung</option><option value="Wishlist">Wishlist</option></>, 160)}
          <span style={{ fontSize: 11, color: '#55556a', marginLeft: 'auto', fontFamily: 'monospace' }}>{filtered.length} / {cards.length}</span>
        </div>

        {/* Table */}
        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#55556a' }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🎴</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#8888aa', marginBottom: 8 }}>Lade die 3 Dateien um loszulegen</div>
            <div style={{ fontSize: 13 }}>DEX CSV + Produktkatalog + Preisverzeichnis von Cardmarket</div>
          </div>
        ) : (
          <div style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1a1a2a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th style={{ width: 56, padding: '10px 14px' }}></th>
                  {([
                    { k: 'name',        l: 'Karte' },
                    { k: 'set_name',    l: 'Set' },
                    { k: 'rarity',      l: 'Seltenheit' },
                    { k: 'quantity',    l: 'Qty' },
                    { k: 'dex_price',   l: 'DEX' },
                    { k: 'price_low',   l: 'Ab-Preis' },
                    { k: 'price_trend', l: 'Trend' },
                    { k: 'diff',        l: 'Differenz' },
                  ] as { k: SortKey; l: string }[]).map(({ k, l }) => (
                    <th key={k} onClick={() => toggleSort(k)} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: sortKey === k ? '#ffd426' : '#55556a', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{l} <SI k={k} /></span>
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#55556a' }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => {
                  const live   = card.price_live
                  const pLow   = live?.price_low
                  const pTrend = live?.price_trend
                  const diff   = pTrend != null && card.dex_price != null ? pTrend - card.dex_price : null
                  const isSelected = selectedCard?.id === card.id

                  return (
                    <tr key={card.id} onClick={() => setSelectedCard(isSelected ? null : card)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', background: isSelected ? 'rgba(78,158,255,0.06)' : 'transparent', transition: 'background .15s' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(78,158,255,0.06)' : 'transparent' }}>

                      <td style={{ padding: '8px 8px 8px 14px' }}>
                        {card.image_url
                          ? <img src={card.image_url} alt={card.name} style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', display: 'block' }} loading="lazy" onError={e => (e.currentTarget.style.display = 'none')} />
                          : <div style={{ width: 40, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🃏</div>
                        }
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#f0f0f8' }}>{card.name}</div>
                        <div style={{ fontSize: 11, color: '#55556a', marginTop: 1 }}>{card.series}</div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#404055', marginTop: 2, background: '#1a1a2a', borderRadius: 4, padding: '1px 5px', display: 'inline-block' }}>{card.card_id} · {card.variant}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#8888aa' }}>{card.set_name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, background: card.quantity > 0 ? 'rgba(41,224,134,0.12)' : 'rgba(255,61,61,0.1)', color: card.quantity > 0 ? '#29e086' : '#ff6666' }}>
                          {card.quantity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#55556a' }}>{card.dex_price != null ? fmtPrice(card.dex_price) : '–'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {pLow != null ? <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#8888aa' }}>{fmtPrice(pLow)}</span> : <span style={{ color: '#404055' }}>–</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {pTrend != null ? <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#29e086' }}>{fmtPrice(pTrend)}</span> : <span style={{ color: '#404055' }}>–</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {diff != null ? (
                          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, background: diff > 0.01 ? 'rgba(41,224,134,0.12)' : diff < -0.01 ? 'rgba(255,61,61,0.1)' : 'rgba(255,255,255,0.05)', color: diff > 0.01 ? '#29e086' : diff < -0.01 ? '#ff6666' : '#55556a' }}>
                            {diff > 0.01 ? <TrendingUp size={11} /> : diff < -0.01 ? <TrendingDown size={11} /> : <Minus size={11} />}
                            {diff >= 0 ? '+' : ''}{fmtPrice(diff)}
                          </span>
                        ) : <span style={{ color: '#404055' }}>–</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {card.cm_url && (
                          <a href={card.cm_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                            style={{ color: '#4e9eff', fontSize: 11, textDecoration: 'none', opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            CM <ExternalLink size={10} />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedCard && (
          <div style={{ marginTop: 16 }}>
            <PriceChart card={selectedCard} lang="D" cond="NM" condLabel="Near Mint" langLabel="Deutsch" />
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { outline: none; }
        select option { background: #1a1a2a; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #0d0d14; }
        ::-webkit-scrollbar-thumb { background: #212135; border-radius: 99px; }
        .rb { font-size: 10px; font-weight: 700; border-radius: 99px; padding: 2px 9px; display: inline-block; white-space: nowrap; letter-spacing: .4px; }
        .rb-c { background: rgba(100,100,120,.18); color: #777; border: 1px solid rgba(100,100,120,.3); }
        .rb-u { background: rgba(78,158,255,.12); color: #4e9eff; border: 1px solid rgba(78,158,255,.25); }
        .rb-r { background: rgba(255,212,38,.12); color: #ffd426; border: 1px solid rgba(255,212,38,.25); }
        .rb-h { background: rgba(255,212,38,.2); color: #ffe566; border: 1px solid rgba(255,212,38,.35); }
        .rb-x { background: rgba(255,61,61,.15); color: #ff7a5c; border: 1px solid rgba(255,61,61,.3); }
        .rb-p { background: rgba(41,224,134,.12); color: #29e086; border: 1px solid rgba(41,224,134,.25); }
        .rb-s { background: rgba(180,123,255,.15); color: #b47bff; border: 1px solid rgba(180,123,255,.3); }
      `}</style>
    </div>
  )
}
