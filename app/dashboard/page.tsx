'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, TrendingUp, TrendingDown, Minus, ExternalLink,
  ChevronUp, ChevronDown, ChevronsUpDown, Upload, CheckCircle,
  X, ZoomIn, Save, Trash2, RefreshCw
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
type PriceLive = {
  price_low: number|null; price_trend: number|null
  price_avg: number|null; avg7: number|null; avg30: number|null
  idProduct: number|null
}
type ManualPrice = {
  id?: number; card_id: string; entered_at: string
  language: string; condition: string; price: number; note: string
}
type Card = {
  id: string; card_id: string; name: string; set_name: string
  series: string; variant: string; rarity: string; quantity: number
  category: string; dex_price: number|null; image_url: string|null
  cm_url: string|null; price_live: PriceLive|null
}
type SortKey = 'name'|'set_name'|'rarity'|'quantity'|'dex_price'|'price_trend'|'diff'|'manualDiff'
type SortDir = 'asc'|'desc'
type CMProduct = { idProduct: number; name: string; idExpansion: number }
type CMPrice = {
  idProduct: number; avg: number|null; low: number|null; trend: number|null
  avg7: number|null; avg30: number|null
  'avg-holo': number|null; 'low-holo': number|null; 'trend-holo': number|null
  'avg7-holo': number|null; 'avg30-holo': number|null
}

// ── Constants ─────────────────────────────────────────────────
const LANGUAGES = [
  {v:'D',l:'🇩🇪 Deutsch'},{v:'GB',l:'🇬🇧 Englisch'},{v:'F',l:'🇫🇷 Französisch'},
  {v:'I',l:'🇮🇹 Italienisch'},{v:'E',l:'🇪🇸 Spanisch'},{v:'JP',l:'🇯🇵 Japanisch'},
  {v:'KO',l:'🇰🇷 Koreanisch'},{v:'PT',l:'🇵🇹 Portugiesisch'},
]
const CONDITIONS = [
  {v:'MT',l:'Mint'},{v:'NM',l:'Near Mint'},{v:'EX',l:'Excellent'},
  {v:'GD',l:'Good'},{v:'LP',l:'Light Played'},{v:'PL',l:'Played'},{v:'PO',l:'Poor'},
]

// ── Helpers ───────────────────────────────────────────────────
const fmt = (v: number|null|undefined) =>
  v == null ? '–' : v.toFixed(2).replace('.', ',') + ' €'
const slugify = (n: string) =>
  (n||'').replace(/&/g,'and').replace(/[éèê]/g,'e').replace(/[àâ]/g,'a')
    .replace(/[ûü]/g,'u').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-')

function rarityClass(r: string) {
  const n = (r||'').toLowerCase().replace(/\s+/g,'')
  if (n.includes('uncommon')) return 'rb-u'
  if (n.includes('common'))   return 'rb-c'
  if (n.includes('holo'))     return 'rb-h'
  if (n.includes('ultra')||n.includes('double')||n.includes('illustration')||n.includes('shiny')) return 'rb-x'
  if (n.includes('rare'))     return 'rb-r'
  if (n.includes('promo'))    return 'rb-p'
  return 'rb-s'
}

// ── CSV Parser ────────────────────────────────────────────────
function parseCSV(text: string): Omit<Card,'price_live'>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const hdr = lines[0].split(';').map(h => h.trim().toLowerCase())
  const col = (k: string) => hdr.indexOf(k)
  const C = {
    cat:col('category'), series:col('series'), set:col('set'), id:col('id'),
    name:col('name'), variant:col('variant'), rarity:col('rarity'),
    qty:col('quantity'), price:col('price')
  }
  const raw = lines.slice(1).filter(l => l.split(';').length >= 6).map(line => {
    const p = line.split(';')
    const g = (i: number) => (i>=0&&i<p.length) ? p[i].trim() : ''
    const rawId = g(C.id), variant = g(C.variant)||'Normal'
    const pr = g(C.price).replace(/[€\u00A0\s]/g,'').replace(',','.')
    return {
      id:`${rawId}|${variant}`, card_id:rawId, name:g(C.name),
      set_name:g(C.set), series:g(C.series), variant, rarity:g(C.rarity),
      quantity:parseInt(g(C.qty))||0, category:g(C.cat),
      dex_price:isNaN(parseFloat(pr))?null:parseFloat(pr),
      cm_url:null, image_url:null,
    }
  })
  // Merge duplicates (same id = same card+variant, sum quantity)
  const merged = new Map<string, Omit<Card,'price_live'>>()
  for (const card of raw) {
    if (merged.has(card.id)) {
      merged.get(card.id)!.quantity += card.quantity
    } else {
      merged.set(card.id, {...card})
    }
  }
  return Array.from(merged.values())
}

// ── Price Matcher ─────────────────────────────────────────────
function matchPrices(cards: Omit<Card,'price_live'>[], products: CMProduct[], priceGuides: CMPrice[]): Card[] {
  const priceMap = new Map<number,CMPrice>(priceGuides.map(p => [p.idProduct,p]))
  const nameIdx = new Map<string,CMProduct[]>()
  for (const p of products) {
    const base = p.name.split('[')[0].split(' Lv.')[0].trim()
    if (!nameIdx.has(base)) nameIdx.set(base,[])
    nameIdx.get(base)!.push(p)
  }
  return cards.map(card => {
    const isHolo = /holo|reverse/i.test(card.variant)
    const matches = nameIdx.get(card.name)||[]
    let best: CMProduct|null=null, bestP: CMPrice|null=null
    for (const m of matches) {
      const p = priceMap.get(m.idProduct)
      if (p&&(p.trend!=null||p.low!=null)){best=m;bestP=p;break}
    }
    if (!best||!bestP) return {...card, price_live:null}
    const get = (k: string): number|null => {
      const hv = isHolo ? (bestP as any)[`${k}-holo`] : null
      return hv ?? (bestP as any)[k] ?? null
    }
    return {
      ...card,
      cm_url:`https://www.cardmarket.com/de/Pokemon/Products/Singles/-/${best.idProduct}`,
      price_live:{
        price_low:get('low'), price_trend:get('trend'), price_avg:get('avg'),
        avg7:get('avg7'), avg30:get('avg30'), idProduct:best.idProduct,
      }
    }
  })
}

// ── Image Cache ───────────────────────────────────────────────
const imgCache = new Map<string,string|null>()
const imgQueue: string[] = []
let imgRunning = false

async function processQueue() {
  if (imgRunning) return
  imgRunning = true
  while (imgQueue.length > 0) {
    const id = imgQueue.shift()!
    if (imgCache.has(id)) continue
    try {
      const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`)
      const d = r.ok ? await r.json() : null
      imgCache.set(id, d?.image ? `${d.image}/high.webp` : null)
    } catch { imgCache.set(id, null) }
    await new Promise(r => setTimeout(r, 60))
  }
  imgRunning = false
}

const imgListeners = new Map<string, Set<()=>void>>()

function requestImage(cardId: string, cb: ()=>void) {
  if (!imgListeners.has(cardId)) imgListeners.set(cardId, new Set())
  imgListeners.get(cardId)!.add(cb)
  if (!imgCache.has(cardId) && !imgQueue.includes(cardId)) {
    imgQueue.push(cardId)
    processQueue().then(() => {
      imgListeners.get(cardId)?.forEach(fn => fn())
    })
  }
}

function useCardImage(cardId: string) {
  const [url,setUrl] = useState<string|null>(imgCache.get(cardId)??null)
  useEffect(() => {
    if (imgCache.has(cardId)){setUrl(imgCache.get(cardId)??null);return}
    const cb = () => setUrl(imgCache.get(cardId)??null)
    requestImage(cardId, cb)
    return () => imgListeners.get(cardId)?.delete(cb)
  },[cardId])
  return url
}

// ── Card Thumbnail ────────────────────────────────────────────
function CardThumb({cardId,name}:{cardId:string;name:string}) {
  const url = useCardImage(cardId)
  const [lb,setLb] = useState(false)
  return (
    <>
      <div
        onClick={url?e=>{e.stopPropagation();setLb(true)}:undefined}
        style={{width:40,height:56,cursor:url?'zoom-in':'default',position:'relative',borderRadius:4,overflow:'hidden',border:'1px solid var(--border)',background:'var(--bg-elevated)',flexShrink:0}}>
        {url
          ? <img src={url} alt={name} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>(e.currentTarget.style.display='none')}/>
          : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:'var(--text-4)'}}>🃏</div>
        }
        {url&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'all .15s'}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.4)';(e.currentTarget as HTMLElement).style.opacity='1'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,0)';(e.currentTarget as HTMLElement).style.opacity='0'}}>
          <ZoomIn size={14} color="white"/>
        </div>}
      </div>
      {lb&&url&&(
        <div onClick={()=>setLb(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.92)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',cursor:'zoom-out'}}>
          <button onClick={()=>setLb(false)} style={{position:'absolute',top:20,right:20,background:'rgba(255,255,255,.1)',border:'1px solid var(--border-md)',borderRadius:'50%',width:40,height:40,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text)'}}>
            <X size={18}/>
          </button>
          <img src={url} alt={name} style={{maxWidth:'88vw',maxHeight:'88vh',borderRadius:16,boxShadow:'0 24px 80px rgba(0,0,0,.9)',objectFit:'contain'}}/>
        </div>
      )}
    </>
  )
}

// ── File Upload Button ────────────────────────────────────────
function FileBtn({label,sub,loaded,onFile,accept='.json,.csv'}:{label:string;sub?:string;loaded:boolean;onFile:(f:File)=>void;accept?:string}) {
  return (
    <label style={{display:'flex',flexDirection:'column',gap:4,cursor:'pointer'}}>
      <span style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text-3)'}}>
        {label}
      </span>
      <span style={{
        display:'inline-flex',alignItems:'center',gap:8,padding:'8px 14px',
        borderRadius:'var(--radius-sm)',fontWeight:600,fontSize:12,whiteSpace:'nowrap',
        background:loaded?'var(--green-dim)':'var(--bg-input)',
        border:`1px solid ${loaded?'rgba(0,166,81,.3)':'var(--border-md)'}`,
        color:loaded?'var(--green)':'var(--text-2)',
        transition:'all .2s',
      }}>
        {loaded?<CheckCircle size={13}/>:<Upload size={13}/>}
        {loaded?'Geladen ✓':sub||'Laden'}
      </span>
      <input type="file" accept={accept} style={{display:'none'}} onChange={e=>e.target.files?.[0]&&onFile(e.target.files[0])}/>
    </label>
  )
}

// ── Manual Price Panel ────────────────────────────────────────
function ManualPanel({cardId,existing,onSaved}:{cardId:string;existing:ManualPrice[];onSaved:()=>void}) {
  const [lang,setLang]   = useState('D')
  const [cond,setCond]   = useState('NM')
  const [price,setPrice] = useState('')
  const [date,setDate]   = useState(new Date().toISOString().split('T')[0])
  const [note,setNote]   = useState('')
  const [saving,setSaving] = useState(false)

  const inputStyle: React.CSSProperties = {
    background:'var(--bg)',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',
    color:'var(--text)',padding:'7px 10px',fontSize:12,fontFamily:'var(--font)',width:'100%'
  }
  const selStyle: React.CSSProperties = {
    ...inputStyle, cursor:'pointer', appearance:'none',
    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' fill='none'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%2355556a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center',paddingRight:24,
  }

  async function save() {
    const p = parseFloat(price.replace(',','.'))
    if (isNaN(p)||p<=0){alert('Bitte gültigen Preis eingeben');return}
    setSaving(true)
    try {
      const {createClient} = await import('@supabase/supabase-js')
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const {error} = await db.from('manual_prices').insert({card_id:cardId,entered_at:date,language:lang,condition:cond,price:p,note})
      if (error) throw error
      setPrice('');setNote('');onSaved()
    } catch(e:any){alert('Fehler: '+e.message)}
    finally{setSaving(false)}
  }

  async function del(id:number) {
    const {createClient} = await import('@supabase/supabase-js')
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    await db.from('manual_prices').delete().eq('id',id)
    onSaved()
  }

  return (
    <div>
      {existing.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text-3)',marginBottom:8}}>Gespeicherte Preise</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {existing.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'7px 12px',border:'1px solid var(--border)'}}>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text-3)'}}>{e.entered_at}</span>
                <span style={{fontSize:11,background:'var(--blue-dim)',color:'var(--blue-light)',borderRadius:4,padding:'1px 7px',border:'1px solid rgba(59,143,232,.2)'}}>{e.language}</span>
                <span style={{fontSize:11,background:'var(--yellow-dim)',color:'var(--yellow)',borderRadius:4,padding:'1px 7px',border:'1px solid rgba(255,215,0,.2)'}}>{e.condition}</span>
                <span style={{fontFamily:'var(--mono)',fontWeight:600,fontSize:13,color:'var(--green)',flex:1}}>{fmt(e.price)}</span>
                {e.note&&<span style={{fontSize:11,color:'var(--text-3)'}}>{e.note}</span>}
                <button onClick={()=>e.id&&del(e.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:2}} title="Löschen">
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text-3)',marginBottom:10}}>Neuen Preis eintragen</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'flex-end'}}>
        {[
          {l:'Datum',el:<input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inputStyle,width:130}}/>},
          {l:'Sprache',el:<select value={lang} onChange={e=>setLang(e.target.value)} style={{...selStyle,width:130}}>{LANGUAGES.map(l=><option key={l.v} value={l.v}>{l.l}</option>)}</select>},
          {l:'Zustand',el:<select value={cond} onChange={e=>setCond(e.target.value)} style={{...selStyle,width:150}}>{CONDITIONS.map(c=><option key={c.v} value={c.v}>{c.l} ({c.v})</option>)}</select>},
          {l:'Preis (€)',el:<input type="text" value={price} onChange={e=>setPrice(e.target.value)} placeholder="3,50" style={{...inputStyle,width:90}}/>},
          {l:'Notiz',el:<input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="optional" style={{...inputStyle,width:160}}/>},
        ].map(({l,el})=>(
          <div key={l} style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:10,color:'var(--text-3)'}}>{l}</label>
            {el}
          </div>
        ))}
        <button onClick={save} disabled={saving} style={{
          display:'inline-flex',alignItems:'center',gap:6,padding:'7px 16px',
          background:'var(--red)',color:'#fff',border:'none',borderRadius:'var(--radius-sm)',
          fontWeight:600,fontSize:12,cursor:saving?'not-allowed':'pointer',
          opacity:saving?.6:1,fontFamily:'var(--font)',boxShadow:'var(--shadow-red)',
          alignSelf:'flex-end',
        }}>
          <Save size={12}/>{saving?'…':'Speichern'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [cards,setCards]           = useState<Card[]>([])
  const [rawCards,setRawCards]     = useState<Omit<Card,'price_live'>[]>([])
  const [cmProducts,setCmProducts] = useState<CMProduct[]>([])
  const [cmPrices,setCmPrices]     = useState<CMPrice[]>([])
  const [search,setSearch]         = useState('')
  const [seriesFilter,setSeriesFilter] = useState('')
  const [rarityFilter,setRarityFilter] = useState('')
  const [catFilter,setCatFilter]   = useState('')
  const [viewFilter,setViewFilter] = useState('all')
  const [sortKey,setSortKey]       = useState<SortKey>('name')
  const [sortDir,setSortDir]       = useState<SortDir>('asc')
  const [selected,setSelected]     = useState<Card|null>(null)
  const [pricesDate,setPricesDate] = useState<string|null>(null)
  const [manualPrices,setManualPrices] = useState<ManualPrice[]>([])
  const [hiddenCards,setHiddenCards]   = useState<Set<string>>(new Set())

  function toggleHide(cardId: string) {
    setHiddenCards(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  useEffect(()=>{
    if (rawCards.length&&cmProducts.length&&cmPrices.length)
      setCards(matchPrices(rawCards,cmProducts,cmPrices))
  },[rawCards,cmProducts,cmPrices])

  const loadManual = useCallback(async()=>{
    try {
      const {createClient} = await import('@supabase/supabase-js')
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const {data} = await db.from('manual_prices').select('*').order('entered_at',{ascending:false})
      if (data) setManualPrices(data)
    } catch {}
  },[])

  useEffect(()=>{loadManual()},[loadManual])

  function handleCSV(file:File){
    const r=new FileReader()
    r.onload=ev=>{
      let t=ev.target?.result as string
      if (t.charCodeAt(0)===0xFEFF) t=t.slice(1)
      setRawCards(parseCSV(t))
    }
    r.readAsText(file,'UTF-16')
  }
  function handleProducts(file:File){
    const r=new FileReader()
    r.onload=ev=>{try{const d=JSON.parse(ev.target?.result as string);setCmProducts(d.products||[])}catch{alert('Fehler Produktkatalog')}}
    r.readAsText(file)
  }
  function handlePrices(file:File){
    const r=new FileReader()
    r.onload=ev=>{
      try{
        const d=JSON.parse(ev.target?.result as string)
        setCmPrices(d.priceGuides||[])
        if (d.createdAt) setPricesDate(d.createdAt.split('T')[0])
      }catch{alert('Fehler Preisverzeichnis')}
    }
    r.readAsText(file)
  }

  function toggleSort(k:SortKey){
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc')
    else{setSortKey(k);setSortDir('asc')}
  }

  // ── Filter & Sort ─────────────────────────────────────────
  const filtered = cards.filter(c=>{
    if (hiddenCards.has(c.id)) return false
    if (viewFilter==='owned'&&c.quantity<=0) return false
    if (viewFilter==='collection'&&c.category!=='Meine Sammlung') return false
    if (viewFilter==='wishlist'&&c.category!=='Wishlist') return false
    if (rarityFilter&&c.rarity!==rarityFilter) return false
    if (seriesFilter&&c.series!==seriesFilter) return false
    if (catFilter&&c.category!==catFilter) return false
    if (search&&!`${c.name} ${c.set_name} ${c.variant} ${c.rarity} ${c.card_id}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a,b)=>{
    const getManual = (c:Card)=>manualPrices.find(m=>m.card_id===c.id)?.price??null
    const getManualDiff = (c:Card)=>{
      const all=manualPrices.filter(m=>m.card_id===c.id)
      return all.length>=2?all[0].price-all[1].price:null
    }
    let av:any,bv:any
    if (sortKey==='price_trend'){av=a.price_live?.price_trend;bv=b.price_live?.price_trend}
    else if (sortKey==='diff'){
      av=a.price_live?.price_trend!=null&&a.dex_price!=null?a.price_live.price_trend-a.dex_price:null
      bv=b.price_live?.price_trend!=null&&b.dex_price!=null?b.price_live.price_trend-b.dex_price:null
    }
    else if (sortKey==='manualDiff'){av=getManualDiff(a);bv=getManualDiff(b)}
    else{av=(a as any)[sortKey];bv=(b as any)[sortKey]}
    if (av==null) return 1;if (bv==null) return -1
    if (typeof av==='string') av=av.toLowerCase()
    if (typeof bv==='string') bv=bv.toLowerCase()
    return sortDir==='asc'?(av>bv?1:-1):(av<bv?1:-1)
  })

  const owned     = filtered.filter(c=>c.quantity>0)
  const manualVal = owned.reduce((s,c)=>{
    const m=manualPrices.find(p=>p.card_id===c.id)
    return m?s+m.price*c.quantity:s
  },0)
  const dexVal = owned.filter(c=>c.dex_price!=null).reduce((s,c)=>s+c.dex_price!*c.quantity,0)
  const allSeries   = Array.from(new Set(cards.map(c=>c.series))).filter(Boolean).sort()
  const allRarities = Array.from(new Set(cards.map(c=>c.rarity))).filter(Boolean).sort()

  // ── Sort Icon ─────────────────────────────────────────────
  function SI({k}:{k:SortKey}) {
    if (sortKey!==k) return <ChevronsUpDown size={10} style={{opacity:.3}}/>
    return sortDir==='asc'?<ChevronUp size={10} style={{color:'var(--yellow)'}}/>:<ChevronDown size={10} style={{color:'var(--yellow)'}}/>
  }

  // ── Select Helper ─────────────────────────────────────────
  const Sel = ({value,onChange,children,w=140}:{value:string;onChange:(v:string)=>void;children:React.ReactNode;w?:number}) => (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{
      background:'var(--bg-input)',border:'1px solid var(--border-md)',borderRadius:'var(--radius-sm)',
      color:'var(--text)',padding:'8px 28px 8px 11px',fontFamily:'var(--font)',fontSize:12,
      minWidth:w,cursor:'pointer',appearance:'none',
      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5' fill='none'%3E%3Cpath d='M1 1l3.5 3.5L8 1' stroke='%2355556a' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:'no-repeat',backgroundPosition:'right 9px center',
    }}>{children}</select>
  )

  // ── Th Helper ─────────────────────────────────────────────
  const Th = ({k,children}:{k:SortKey;children:React.ReactNode}) => (
    <th onClick={()=>toggleSort(k)} style={{
      padding:'11px 14px',textAlign:'left',fontSize:10,fontWeight:700,
      textTransform:'uppercase',letterSpacing:'1px',
      color:sortKey===k?'var(--yellow)':'var(--text-3)',
      cursor:'pointer',whiteSpace:'nowrap',userSelect:'none',
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{children}<SI k={k}/></span>
    </th>
  )

  // ══════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--font)'}}>

      {/* ── Subtle background glow ── */}
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,
        background:'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(204,0,0,0.07) 0%, transparent 60%)'}}/>

      {/* ══════════ HEADER ══════════ */}
      <header style={{
        position:'relative',zIndex:20,
        background:'var(--bg-card)',
        borderBottom:'1px solid var(--border)',
        padding:'0 32px',
      }}>
        {/* Red top accent line */}
        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,var(--red) 0%,var(--red-light) 50%,transparent 100%)'}}/>

        <div style={{maxWidth:1440,margin:'0 auto',display:'flex',alignItems:'center',gap:20,padding:'16px 0'}}>
          {/* Logo */}
          <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            <div style={{position:'relative',width:44,height:44}}>
              <svg viewBox="0 0 100 100" style={{width:44,height:44,filter:'drop-shadow(0 2px 8px rgba(204,0,0,0.4))'}}>
                <circle cx="50" cy="50" r="47" fill="var(--bg-elevated)" stroke="var(--border-md)" strokeWidth="2"/>
                <path d="M3 50 Q3 3 50 3 Q97 3 97 50Z" fill="var(--red)"/>
                <rect x="3" y="46" width="94" height="8" fill="var(--bg)"/>
                <circle cx="50" cy="50" r="13" fill="var(--bg-elevated)" stroke="var(--border-md)" strokeWidth="2"/>
                <circle cx="50" cy="50" r="5" fill="rgba(255,255,255,0.15)"/>
              </svg>
            </div>
            <div>
              <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.3px',color:'var(--text)',lineHeight:1}}>
                PokéDex <span style={{color:'var(--red)'}}>Preise</span>
              </div>
              <div style={{fontSize:10,color:'var(--text-3)',marginTop:3,letterSpacing:'0.5px'}}>
                CARDMARKET PRICE TRACKER
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div style={{flex:1}}/>

          {/* Stats pills */}
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {[
              {val:cards.length,lbl:'Karten',color:'var(--blue-light)'},
              {val:owned.length,lbl:'Im Besitz',color:'var(--green)'},
              {val:manualVal>0?fmt(manualVal):'–',lbl:'Manueller Wert',color:'var(--yellow)'},
              {val:dexVal>0?fmt(dexVal):'–',lbl:'DEX-Wert',color:'var(--text-2)'},
            ].map(({val,lbl,color})=>(
              <div key={lbl} style={{
                background:'var(--bg-elevated)',border:'1px solid var(--border)',
                borderRadius:'var(--radius)',padding:'8px 16px',textAlign:'center',
                minWidth:100,
              }}>
                <div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:600,color,lineHeight:1}}>{val}</div>
                <div style={{fontSize:9,color:'var(--text-3)',marginTop:4,textTransform:'uppercase',letterSpacing:'0.8px'}}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ══════════ TOOLBAR ══════════ */}
      <div style={{position:'relative',zIndex:10,background:'var(--bg-card)',borderBottom:'1px solid var(--border)',padding:'12px 32px'}}>
        <div style={{maxWidth:1440,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:12,alignItems:'flex-end'}}>

          {/* File uploads */}
          <FileBtn label="1. DEX Export" sub="CSV laden" loaded={rawCards.length>0} onFile={handleCSV} accept=".csv"/>
          <div style={{width:1,background:'var(--border)',alignSelf:'stretch',margin:'0 2px'}}/>
          <FileBtn label="2. Produktkatalog" sub="products_singles_6.json" loaded={cmProducts.length>0} onFile={handleProducts}/>
          <FileBtn label="3. Preisverzeichnis" sub="price_guide_6.json" loaded={cmPrices.length>0} onFile={handlePrices}/>
          <div style={{width:1,background:'var(--border)',alignSelf:'stretch',margin:'0 2px'}}/>

          {/* View filter */}
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text-3)'}}>Ansicht</label>
            <Sel value={viewFilter} onChange={setViewFilter} w={150}>
              <option value="all">Alle Karten</option>
              <option value="owned">Nur im Besitz</option>
              <option value="collection">Nur Sammlung</option>
              <option value="wishlist">Nur Wishlist</option>
            </Sel>
          </div>

          {/* Spacer */}
          <div style={{flex:1}}/>

          {/* CM Download links */}
          {pricesDate&&<div style={{fontSize:11,color:'var(--text-3)',textAlign:'right'}}>
            <div style={{color:'var(--text-2)',fontWeight:600,marginBottom:2}}>Stand: {pricesDate}</div>
            <a href="https://www.cardmarket.com/de/Pokemon/Data/Price-Guide" target="_blank" style={{color:'var(--blue-light)',fontSize:10}}>Preise aktualisieren ↗</a>
          </div>}
        </div>
      </div>

      {/* ══════════ CONTENT ══════════ */}
      <main style={{position:'relative',zIndex:10,maxWidth:1440,margin:'24px auto 60px',padding:'0 32px'}}>

        {/* Summary Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          {[
            {val:filtered.length,lbl:'Gefilterte Einträge',acc:'var(--blue)',icon:'📋'},
            {val:owned.length,lbl:'Im Besitz',acc:'var(--green)',icon:'✓'},
            {val:manualVal>0?fmt(manualVal):'–',lbl:'Manueller Gesamtwert',acc:'var(--yellow)',icon:'💰'},
            {val:dexVal>0?fmt(dexVal):'–',lbl:'DEX Gesamtwert',acc:'var(--text-3)',icon:'📱'},
          ].map(({val,lbl,acc,icon})=>(
            <div key={lbl} style={{
              background:'var(--bg-card)',border:'1px solid var(--border)',
              borderRadius:'var(--radius-lg)',padding:'16px 20px',
              position:'relative',overflow:'hidden',
            }}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:acc,opacity:.8}}/>
              <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                <span>{icon}</span>{lbl}
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:'var(--text)',lineHeight:1}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:16}}>
          <div style={{position:'relative',flex:1,minWidth:240}}>
            <Search size={14} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-3)'}}/>
            <input
              type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Suche nach Name, Set, ID …"
              style={{
                width:'100%',background:'var(--bg-card)',border:'1px solid var(--border-md)',
                borderRadius:'var(--radius)',color:'var(--text)',
                padding:'9px 14px 9px 34px',fontFamily:'var(--font)',fontSize:13,
              }}
            />
          </div>
          <Sel value={seriesFilter} onChange={setSeriesFilter} w={170}>
            <option value="">Alle Serien</option>
            {allSeries.map(s=><option key={s} value={s}>{s}</option>)}
          </Sel>
          <Sel value={rarityFilter} onChange={setRarityFilter} w={160}>
            <option value="">Alle Seltenheiten</option>
            {allRarities.map(r=><option key={r} value={r}>{r}</option>)}
          </Sel>
          <Sel value={catFilter} onChange={setCatFilter} w={160}>
            <option value="">Alle Kategorien</option>
            <option value="Meine Sammlung">Meine Sammlung</option>
            <option value="Wishlist">Wishlist</option>
          </Sel>
          <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text-3)',marginLeft:'auto'}}>
            {filtered.length} / {cards.length} Karten
          </span>
        </div>

        {/* Table or Empty */}
        {cards.length===0?(
          <div style={{
            textAlign:'center',padding:'80px 20px',
            background:'var(--bg-card)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',
          }}>
            <div style={{fontSize:56,marginBottom:16,opacity:.4}}>🎴</div>
            <div style={{fontSize:18,fontWeight:700,color:'var(--text-2)',marginBottom:8}}>Lade deine Dateien um loszulegen</div>
            <div style={{fontSize:13,color:'var(--text-3)',lineHeight:1.7}}>
              DEX CSV · Produktkatalog · Preisverzeichnis<br/>
              <a href="https://www.cardmarket.com/de/Pokemon/Data/Price-Guide" target="_blank" style={{color:'var(--blue-light)'}}>
                Dateien bei Cardmarket herunterladen ↗
              </a>
            </div>
          </div>
        ):(
          <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--bg-elevated)',borderBottom:'1px solid var(--border)'}}>
                  <th style={{width:56,padding:'11px 8px 11px 14px'}}/>
                  <Th k="name">Karte</Th>
                  <Th k="set_name">Set</Th>
                  <Th k="rarity">Seltenheit</Th>
                  <Th k="quantity">Qty</Th>
                  <Th k="dex_price">DEX</Th>
                  <Th k="price_trend">CM Trend</Th>
                  <Th k="diff">Differenz</Th>
                  <Th k="manualDiff">Preisentw.</Th>
                  <th style={{padding:'11px 14px',textAlign:'left',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text-3)',whiteSpace:'nowrap'}}>Manuell / Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card=>{
                  const live        = card.price_live
                  const pTrend      = live?.price_trend
                  const diff        = pTrend!=null&&card.dex_price!=null?pTrend-card.dex_price:null
                  const cardManual  = manualPrices.filter(m=>m.card_id===card.id)
                  const latestM     = cardManual[0]
                  const prevM       = cardManual[1]
                  const manualDiff  = latestM&&prevM?latestM.price-prevM.price:null
                  const isSel       = selected?.id===card.id

                  const diffBadge = (v:number|null, noDataEl:React.ReactNode) => {
                    if (v==null) return noDataEl
                    const up=v>0.01, dn=v<-0.01
                    return (
                      <span style={{
                        fontFamily:'var(--mono)',fontSize:11,fontWeight:600,
                        borderRadius:'var(--radius-sm)',padding:'3px 8px',
                        display:'inline-flex',alignItems:'center',gap:3,
                        background:up?'var(--green-dim)':dn?'var(--red-dim)':'rgba(255,255,255,.04)',
                        color:up?'var(--green)':dn?'#FF6B6B':'var(--text-3)',
                        border:`1px solid ${up?'rgba(0,166,81,.2)':dn?'var(--red-border)':'var(--border)'}`,
                      }}>
                        {up?<TrendingUp size={10}/>:dn?<TrendingDown size={10}/>:<Minus size={10}/>}
                        {v>=0?'+':''}{v.toFixed(2).replace('.',',')} €
                      </span>
                    )
                  }

                  return (
                    <>
                      <tr
                        key={card.id}
                        onClick={()=>setSelected(isSel?null:card)}
                        style={{
                          borderBottom:isSel?'none':'1px solid var(--border)',
                          cursor:'pointer',
                          background:isSel?'rgba(30,111,204,0.06)':'transparent',
                          transition:'background .12s',
                        }}
                        onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.025)'}}
                        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isSel?'rgba(30,111,204,0.06)':'transparent'}}
                      >
                        {/* Image */}
                        <td style={{padding:'8px 6px 8px 14px'}} onClick={e=>e.stopPropagation()}>
                          <CardThumb cardId={card.card_id} name={card.name}/>
                        </td>

                        {/* Name */}
                        <td style={{padding:'10px 14px'}}>
                          <div style={{fontWeight:700,fontSize:13,color:'var(--text)',lineHeight:1.3}}>{card.name}</div>
                          <div style={{fontSize:10,color:'var(--text-3)',marginTop:3}}>{card.series}</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--text-4)',marginTop:2,background:'var(--bg-elevated)',borderRadius:3,padding:'1px 5px',display:'inline-block',border:'1px solid var(--border)'}}>
                            {card.card_id} · {card.variant}
                          </div>
                        </td>

                        {/* Set */}
                        <td style={{padding:'10px 14px',fontSize:11,color:'var(--text-2)',maxWidth:140}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{card.set_name}</div>
                        </td>

                        {/* Rarity */}
                        <td style={{padding:'10px 14px'}}>
                          <span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span>
                        </td>

                        {/* Qty */}
                        <td style={{padding:'10px 14px'}}>
                          <span style={{
                            width:26,height:26,borderRadius:'50%',
                            display:'inline-flex',alignItems:'center',justifyContent:'center',
                            fontWeight:700,fontSize:12,
                            background:card.quantity>0?'var(--green-dim)':'var(--red-dim)',
                            color:card.quantity>0?'var(--green)':'#FF6B6B',
                            border:`1px solid ${card.quantity>0?'rgba(0,166,81,.2)':'var(--red-border)'}`,
                          }}>{card.quantity}</span>
                        </td>

                        {/* DEX Price */}
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontSize:12,color:'var(--text-3)'}}>{fmt(card.dex_price)}</td>

                        {/* CM Trend */}
                        <td style={{padding:'10px 14px'}}>
                          {pTrend!=null
                            ?<span style={{fontFamily:'var(--mono)',fontWeight:600,fontSize:13,color:'var(--green)'}}>{fmt(pTrend)}</span>
                            :<span style={{color:'var(--text-4)'}}>–</span>
                          }
                        </td>

                        {/* CM vs DEX Diff */}
                        <td style={{padding:'10px 14px'}}>
                          {diffBadge(diff,<span style={{color:'var(--text-4)'}}>–</span>)}
                        </td>

                        {/* Manual Price Development */}
                        <td style={{padding:'10px 14px'}}>
                          {manualDiff!=null
                            ? diffBadge(manualDiff,null)
                            : latestM
                              ? <span style={{fontSize:10,color:'var(--text-3)'}}>1. Eintrag</span>
                              : <span style={{color:'var(--text-4)'}}>–</span>
                          }
                        </td>

                        {/* Manual + Link */}
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                            {latestM&&(
                              <span style={{
                                fontSize:11,fontFamily:'var(--mono)',color:'#A855F7',
                                background:'var(--purple-dim)',borderRadius:4,
                                padding:'2px 8px',border:'1px solid rgba(168,85,247,.2)',
                                whiteSpace:'nowrap',
                              }}>
                                {fmt(latestM.price)} {latestM.language}/{latestM.condition}
                              </span>
                            )}
                            <span style={{fontSize:10,color:isSel?'var(--blue-light)':'var(--text-3)',display:'flex',alignItems:'center',gap:2}}>
                              {isSel?'▲ Einklappen':'▼ Eintragen'}
                            </span>
                            {card.cm_url&&(
                              <a href={card.cm_url} target="_blank" rel="noopener"
                                onClick={e=>e.stopPropagation()}
                                style={{color:'var(--blue-light)',fontSize:11,display:'inline-flex',alignItems:'center',gap:2,opacity:.8}}>
                                CM<ExternalLink size={9}/>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Detail Panel ── */}
                      {isSel&&(
                        <tr key={`${card.id}-detail`} style={{background:'rgba(30,111,204,.04)',borderBottom:'1px solid var(--border)'}}>
                          <td colSpan={10} style={{padding:'20px 20px 20px 74px'}}>
                            <div style={{display:'flex',gap:24,alignItems:'flex-start'}}>

                              {/* Large card image */}
                              <CardImageLarge cardId={card.card_id} name={card.name}/>

                              <div style={{flex:1}}>
                                {/* Card info */}
                                <div style={{marginBottom:16}}>
                                  <div style={{fontSize:17,fontWeight:800,marginBottom:4}}>{card.name}</div>
                                  <div style={{fontSize:12,color:'var(--text-2)'}}>{card.set_name} · {card.variant} · {card.rarity}</div>
                                </div>

                                {/* CM Price Grid */}
                                {live&&(
                                  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:20}}>
                                    {[
                                      {l:'Ab-Preis',v:live.price_low,icon:'🏷'},
                                      {l:'Trend',v:live.price_trend,icon:'📈'},
                                      {l:'Aktueller Ø',v:live.price_avg,icon:'〜'},
                                      {l:'7-Tage Ø',v:live.avg7,icon:'7d'},
                                      {l:'30-Tage Ø',v:live.avg30,icon:'30d'},
                                    ].map(({l,v,icon})=>(
                                      <div key={l} style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:'10px 12px',border:'1px solid var(--border)'}}>
                                        <div style={{fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
                                          <span>{icon}</span>{l}
                                        </div>
                                        <div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:600,color:v!=null?'var(--green)':'var(--text-4)'}}>{fmt(v)}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Manual price form */}
                                <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
                                  <ManualPanel cardId={card.id} existing={cardManual} onSaved={loadManual}/>
                                </div>
                                {/* Hide button */}
                                <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                                  <button onClick={e=>{e.stopPropagation();toggleHide(card.id);setSelected(null)}} style={{
                                    display:'inline-flex',alignItems:'center',gap:6,padding:'6px 14px',
                                    background:'rgba(255,107,107,.08)',border:'1px solid rgba(255,107,107,.2)',
                                    borderRadius:'var(--radius-sm)',color:'#FF6B6B',fontSize:11,fontWeight:600,
                                    cursor:'pointer',fontFamily:'var(--font)',
                                  }}>
                                    <X size={11}/> Karte ausblenden
                                  </button>
                                  {hiddenCards.size>0&&<button onClick={()=>setHiddenCards(new Set())} style={{
                                    display:'inline-flex',alignItems:'center',gap:6,padding:'6px 14px',
                                    background:'transparent',border:'1px solid var(--border-md)',
                                    borderRadius:'var(--radius-sm)',color:'var(--text-3)',fontSize:11,fontWeight:600,
                                    cursor:'pointer',fontFamily:'var(--font)',
                                  }}>
                                    Alle einblenden ({hiddenCards.size})
                                  </button>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <style>{`
        select option { background: var(--bg-elevated); }
        tr { transition: background .12s; }
      `}</style>
    </div>
  )
}

// ── Large card image for detail panel ─────────────────────────
function CardImageLarge({cardId,name}:{cardId:string;name:string}) {
  const url = useCardImage(cardId)
  return url
    ? <img src={url} alt={name} style={{width:120,height:168,objectFit:'cover',borderRadius:10,border:'1px solid var(--border-md)',boxShadow:'var(--shadow-lg)',flexShrink:0}}/>
    : <div style={{width:120,height:168,background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,flexShrink:0,color:'var(--text-4)'}}>🃏</div>
}
