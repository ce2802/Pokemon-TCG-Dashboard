'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import PriceChart from '@/components/PriceChart'
import StatsBar from '@/components/StatsBar'
import FilterBar from '@/components/FilterBar'
import UploadCsv from '@/components/UploadCsv'

// ── Types ────────────────────────────────────────────────────
type Card = {
  id: string
  card_id: string
  name: string
  set_name: string
  series: string
  variant: string
  rarity: string
  quantity: number
  category: string
  dex_price: number | null
  image_url: string | null
  cm_url: string | null
  price_live: {
    price_low: number | null
    price_trend: number | null
    price_avg: number | null
    offers_count: number | null
    scraped_at: string | null
  } | null
}

type SortKey = 'name' | 'set_name' | 'rarity' | 'quantity' | 'dex_price' | 'price_low' | 'price_trend' | 'diff'
type SortDir = 'asc' | 'desc'

// ── Constants ─────────────────────────────────────────────────
const LANGUAGES = [
  { value: 'D',  label: '🇩🇪 Deutsch' },
  { value: 'GB', label: '🇬🇧 Englisch' },
  { value: 'F',  label: '🇫🇷 Französisch' },
  { value: 'I',  label: '🇮🇹 Italienisch' },
  { value: 'E',  label: '🇪🇸 Spanisch' },
  { value: 'PT', label: '🇵🇹 Portugiesisch' },
  { value: 'JP', label: '🇯🇵 Japanisch' },
  { value: 'KO', label: '🇰🇷 Koreanisch' },
]

const CONDITIONS = [
  { value: 'MT', label: 'Mint' },
  { value: 'NM', label: 'Near Mint' },
  { value: 'EX', label: 'Excellent' },
  { value: 'GD', label: 'Good' },
  { value: 'LP', label: 'Light Played' },
  { value: 'PL', label: 'Played' },
  { value: 'PO', label: 'Poor' },
]

// ── Helpers ───────────────────────────────────────────────────
function fmt(v: number | null | undefined): string {
  if (v == null) return '–'
  return v.toFixed(2).replace('.', ',') + ' €'
}

function rarityClass(r: string): string {
  const n = (r || '').toLowerCase().replace(/\s+/g, '')
  if (n.includes('uncommon'))  return 'rarity-u'
  if (n.includes('common'))    return 'rarity-c'
  if (n.includes('holo'))      return 'rarity-h'
  if (n.includes('ultra') || n.includes('double') || n.includes('illustration') || n.includes('shiny')) return 'rarity-x'
  if (n.includes('rare'))      return 'rarity-r'
  if (n.includes('promo'))     return 'rarity-p'
  return 'rarity-s'
}

// ── Main Component ────────────────────────────────────────────
export default function Dashboard() {
  const [cards, setCards]           = useState<Card[]>([])
  const [loading, setLoading]       = useState(false)
  const [lang, setLang]             = useState('D')
  const [cond, setCond]             = useState('NM')
  const [search, setSearch]         = useState('')
  const [seriesFilter, setSeriesFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [viewFilter, setViewFilter] = useState('all')
  const [sortKey, setSortKey]       = useState<SortKey>('name')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ lang, cond })
      if (seriesFilter) params.set('series', seriesFilter)
      if (catFilter)    params.set('category', catFilter)

      const res  = await fetch(`/api/cards?${params}`)
      const data = await res.json()
      if (data.cards) {
        setCards(data.cards)
        // Letztes Scraping-Datum
        const dates = data.cards
          .map((c: Card) => c.price_live?.scraped_at)
          .filter(Boolean)
          .sort()
        if (dates.length) setLastUpdated(dates[dates.length - 1])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [lang, cond, seriesFilter, catFilter])

  useEffect(() => { fetchCards() }, [fetchCards])

  // Sortierung
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Filter + Sort
  const filtered = cards
    .filter(c => {
      if (viewFilter === 'owned'      && c.quantity <= 0) return false
      if (viewFilter === 'collection' && c.category !== 'Meine Sammlung') return false
      if (viewFilter === 'wishlist'   && c.category !== 'Wishlist') return false
      if (rarityFilter && c.rarity !== rarityFilter) return false
      if (search) {
        const h = `${c.name} ${c.set_name} ${c.variant} ${c.rarity} ${c.card_id}`.toLowerCase()
        if (!h.includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'price_low')   { av = a.price_live?.price_low;   bv = b.price_live?.price_low }
      else if (sortKey === 'price_trend') { av = a.price_live?.price_trend; bv = b.price_live?.price_trend }
      else if (sortKey === 'diff') {
        av = (a.price_live?.price_low != null && a.dex_price != null) ? a.price_live.price_low - a.dex_price : null
        bv = (b.price_live?.price_low != null && b.dex_price != null) ? b.price_live.price_low - b.dex_price : null
      }
      else av = (a as any)[sortKey], bv = (b as any)[sortKey]

      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })

  // Statistiken
  const owned   = filtered.filter(c => c.quantity > 0)
  const liveVal = owned.filter(c => c.price_live?.price_low != null)
                       .reduce((s, c) => s + (c.price_live!.price_low! * c.quantity), 0)
  const dexVal  = owned.filter(c => c.dex_price != null)
                       .reduce((s, c) => s + (c.dex_price! * c.quantity), 0)

  // Unique-Werte für Filter-Dropdowns
  const allSeries   = [...new Set(cards.map(c => c.series))].filter(Boolean).sort()
  const allRarities = [...new Set(cards.map(c => c.rarity))].filter(Boolean).sort()

  // Sort-Icon
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-yellow-400" />
      : <ChevronDown className="w-3 h-3 text-yellow-400" />
  }

  const condLabel = CONDITIONS.find(c => c.value === cond)?.label || cond
  const langLabel = LANGUAGES.find(l => l.value === lang)?.label || lang

  return (
    <div className="min-h-screen bg-[#0d0d14] text-[#f0f0f8]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header ── */}
      <header className="border-b border-white/5 bg-gradient-to-b from-red-950/20 to-transparent">
        <div className="max-w-[1500px] mx-auto px-8 py-5 flex items-center gap-6">
          <div className="w-12 h-12 flex-shrink-0">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_12px_rgba(255,61,61,0.5)]">
              <circle cx="50" cy="50" r="47" fill="#1a1a2a" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
              <path d="M3 50 Q3 3 50 3 Q97 3 97 50Z" fill="#ff3d3d"/>
              <rect x="3" y="46" width="94" height="8" fill="#0d0d14"/>
              <circle cx="50" cy="50" r="13" fill="#1a1a2a" stroke="rgba(255,255,255,0.12)" strokeWidth="2"/>
              <circle cx="50" cy="50" r="5.5" fill="rgba(255,255,255,0.12)"/>
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-wide text-white">PokéDex Preise</h1>
            <p className="text-xs text-white/40 tracking-widest uppercase mt-1">
              Cardmarket · {langLabel} · {condLabel}
              {lastUpdated && ` · Stand: ${new Date(lastUpdated).toLocaleDateString('de-DE')}`}
            </p>
          </div>
          <div className="ml-auto flex gap-4">
            {[
              { val: cards.length,   lbl: 'Karten' },
              { val: owned.length,   lbl: 'Im Besitz' },
              { val: liveVal > 0 ? fmt(liveVal) : '–', lbl: `Live ${condLabel}` },
              { val: dexVal  > 0 ? fmt(dexVal)  : '–', lbl: 'DEX-Wert' },
            ].map(({ val, lbl }) => (
              <div key={lbl} className="bg-white/5 border border-white/8 rounded-full px-4 py-2 text-center">
                <div className="text-lg font-black text-yellow-400 leading-none">{val}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider mt-1">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Controls ── */}
      <div className="max-w-[1500px] mx-auto px-8 mt-6">
        <div className="bg-[#13131f] border border-white/7 rounded-xl p-5">
          <div className="flex flex-wrap gap-3 items-end">

            <UploadCsv onImported={fetchCards} />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Sprache</label>
              <select value={lang} onChange={e => setLang(e.target.value)}
                className="bg-[#1a1a2a] border border-white/8 rounded-lg text-sm px-3 py-2 min-w-[155px] text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50">
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Zustand</label>
              <select value={cond} onChange={e => setCond(e.target.value)}
                className="bg-[#1a1a2a] border border-white/8 rounded-lg text-sm px-3 py-2 min-w-[155px] text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50">
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label} ({c.value})</option>)}
              </select>
            </div>

            <div className="w-px bg-white/8 self-stretch mx-1" />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Ansicht</label>
              <select value={viewFilter} onChange={e => setViewFilter(e.target.value)}
                className="bg-[#1a1a2a] border border-white/8 rounded-lg text-sm px-3 py-2 min-w-[155px] text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50">
                <option value="all">Alle Karten</option>
                <option value="owned">Nur im Besitz</option>
                <option value="collection">Nur Sammlung</option>
                <option value="wishlist">Nur Wishlist</option>
              </select>
            </div>

            <div className="w-px bg-white/8 self-stretch mx-1" />

            <button onClick={fetchCards} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-red-600 to-red-800 text-white font-bold text-sm rounded-lg shadow-lg shadow-red-900/30 hover:-translate-y-0.5 hover:shadow-red-900/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Lädt…' : 'Aktualisieren'}
            </button>

          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="max-w-[1500px] mx-auto px-8 mt-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Name, Set, Variante, ID …"
              className="w-full bg-[#13131f] border border-white/7 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40"
            />
          </div>

          {[
            { value: seriesFilter, set: setSeriesFilter, options: allSeries, placeholder: 'Alle Serien' },
            { value: rarityFilter, set: setRarityFilter, options: allRarities, placeholder: 'Alle Seltenheiten' },
          ].map(({ value, set, options, placeholder }) => (
            <select key={placeholder} value={value} onChange={e => set(e.target.value)}
              className="bg-[#13131f] border border-white/7 rounded-lg text-sm px-3 py-2 text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500/40">
              <option value="">{placeholder}</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}

          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="bg-[#13131f] border border-white/7 rounded-lg text-sm px-3 py-2 text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500/40">
            <option value="">Alle Kategorien</option>
            <option value="Meine Sammlung">Meine Sammlung</option>
            <option value="Wishlist">Wishlist</option>
          </select>

          <span className="ml-auto text-xs text-white/20 font-mono">{filtered.length} / {cards.length}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="max-w-[1500px] mx-auto px-8 mt-4 pb-20">
        {cards.length === 0 && !loading ? (
          <div className="text-center py-24 text-white/20">
            <div className="text-6xl mb-4">🎴</div>
            <div className="text-xl font-bold text-white/30 mb-2">Keine Karten geladen</div>
            <div className="text-sm">CSV importieren oder Karten über das Formular hochladen</div>
          </div>
        ) : (
          <div className="bg-[#13131f] border border-white/7 rounded-xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1a1a2a] border-b border-white/7">
                  <th className="w-14 p-3"></th>
                  {([
                    { key: 'name',        label: 'Karte' },
                    { key: 'set_name',    label: 'Set' },
                    { key: 'rarity',      label: 'Seltenheit' },
                    { key: 'quantity',    label: 'Qty' },
                    { key: 'dex_price',   label: 'DEX' },
                    { key: 'price_low',   label: `Ab (${cond})` },
                    { key: 'price_trend', label: 'Trend' },
                    { key: 'diff',        label: 'Differenz' },
                  ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                    <th key={key}
                      onClick={() => toggleSort(key)}
                      className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/30 cursor-pointer hover:text-white/50 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {label} <SortIcon k={key} />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/30">Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => {
                  const live  = card.price_live
                  const pLow  = live?.price_low
                  const pTrend = live?.price_trend
                  const diff  = pLow != null && card.dex_price != null ? pLow - card.dex_price : null

                  return (
                    <tr key={card.id}
                      onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                      className="border-b border-white/[0.03] hover:bg-white/[0.025] cursor-pointer transition-colors">

                      {/* Bild */}
                      <td className="p-2 pl-3">
                        {card.image_url
                          ? <img src={card.image_url} alt={card.name}
                              className="w-10 h-14 object-cover rounded-[4px] border border-white/10"
                              loading="lazy" onError={e => (e.currentTarget.style.display = 'none')} />
                          : <div className="w-10 h-14 bg-white/5 rounded-[4px] border border-white/10 flex items-center justify-center text-lg">🃏</div>
                        }
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-sm text-white">{card.name}</div>
                        <div className="text-xs text-white/30 mt-0.5">{card.series}</div>
                        <div className="text-[10px] font-mono text-white/20 mt-0.5">{card.card_id} · {card.variant}</div>
                      </td>

                      {/* Set */}
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-white/50">{card.set_name}</div>
                      </td>

                      {/* Seltenheit */}
                      <td className="px-3 py-2.5">
                        <span className={`rarity-badge ${rarityClass(card.rarity)}`}>{card.rarity}</span>
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-2.5">
                        <span className={`qty-badge ${card.quantity > 0 ? 'qty-owned' : 'qty-zero'}`}>
                          {card.quantity}
                        </span>
                      </td>

                      {/* DEX Preis */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-mono text-white/30">{fmt(card.dex_price)}</span>
                      </td>

                      {/* Live Preis (Ab) */}
                      <td className="px-3 py-2.5">
                        {live === null
                          ? <span className="text-xs text-white/20">–</span>
                          : pLow != null
                            ? <span className="text-sm font-bold font-mono text-emerald-400">{fmt(pLow)}</span>
                            : <span className="text-xs text-white/20">n/a</span>
                        }
                        {live?.offers_count != null && (
                          <div className="text-[10px] text-white/20 mt-0.5">{live.offers_count} Angebote</div>
                        )}
                      </td>

                      {/* Price Trend */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-mono text-white/40">{fmt(pTrend)}</span>
                      </td>

                      {/* Differenz */}
                      <td className="px-3 py-2.5">
                        {diff != null ? (
                          <div className={`diff-badge ${diff > 0.01 ? 'diff-up' : diff < -0.01 ? 'diff-down' : 'diff-neutral'}`}>
                            {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {diff >= 0 ? '+' : ''}{fmt(diff)}
                          </div>
                        ) : <span className="text-white/20">–</span>}
                      </td>

                      {/* CM Link */}
                      <td className="px-3 py-2.5">
                        {card.cm_url && (
                          <a href={card.cm_url} target="_blank" rel="noopener"
                            onClick={e => e.stopPropagation()}
                            className="text-blue-400/60 hover:text-blue-400 text-xs flex items-center gap-1 transition-colors">
                            CM <ExternalLink className="w-3 h-3" />
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

        {/* ── Preis-Chart (bei ausgewählter Karte) ── */}
        {selectedCard && (
          <div className="mt-4">
            <PriceChart card={selectedCard} lang={lang} cond={cond} condLabel={condLabel} langLabel={langLabel} />
          </div>
        )}
      </div>

      <style jsx global>{`
        .rarity-badge { font-size:10px; font-weight:700; border-radius:99px; padding:3px 10px; display:inline-block; white-space:nowrap; letter-spacing:.4px; }
        .rarity-c { background:rgba(100,100,120,.18); color:#777; border:1px solid rgba(100,100,120,.3); }
        .rarity-u { background:rgba(78,158,255,.12); color:#4e9eff; border:1px solid rgba(78,158,255,.25); }
        .rarity-r { background:rgba(255,212,38,.12); color:#ffd426; border:1px solid rgba(255,212,38,.25); }
        .rarity-h { background:rgba(255,212,38,.2); color:#ffe566; border:1px solid rgba(255,212,38,.35); }
        .rarity-x { background:rgba(255,61,61,.15); color:#ff7a5c; border:1px solid rgba(255,61,61,.3); }
        .rarity-p { background:rgba(41,224,134,.12); color:#29e086; border:1px solid rgba(41,224,134,.25); }
        .rarity-s { background:rgba(180,123,255,.15); color:#b47bff; border:1px solid rgba(180,123,255,.3); }
        .qty-badge { width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; }
        .qty-zero  { background:rgba(255,61,61,.1); color:#ff6666; }
        .qty-owned { background:rgba(41,224,134,.12); color:#29e086; }
        .diff-badge { font-size:11px; font-weight:600; border-radius:6px; padding:3px 8px; display:inline-flex; align-items:center; gap:4px; font-family:monospace; }
        .diff-up      { background:rgba(41,224,134,.12); color:#29e086; }
        .diff-down    { background:rgba(255,61,61,.1); color:#ff6666; }
        .diff-neutral { background:rgba(255,255,255,.05); color:#555; }
        select option { background: #1a1a2a; }
      `}</style>
    </div>
  )
}
