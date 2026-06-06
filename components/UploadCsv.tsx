'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle } from 'lucide-react'

type Props = { onImported: () => void }

export default function UploadCsv({ onImported }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [msg, setMsg]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setState('loading')
    setMsg('Lese CSV…')

    try {
      const reader = new FileReader()
      reader.onload = async ev => {
        let text = ev.target?.result as string
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
        await importToSupabase(text, file.name)
      }
      reader.readAsText(file, 'UTF-16')
    } catch (e: any) {
      setState('error')
      setMsg(e.message)
    }
  }

  async function importToSupabase(text: string, fname: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const hdr   = lines[0].split(';').map(h => h.trim().toLowerCase())
    const col   = (k: string) => hdr.indexOf(k)
    const C = {
      cat: col('category'), locale: col('locale'), series: col('series'),
      set: col('set'), id: col('id'), name: col('name'),
      variant: col('variant'), rarity: col('rarity'), qty: col('quantity'), price: col('price')
    }

    const cards = []
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(';')
      if (p.length < 6) continue
      const g = (idx: number) => (idx >= 0 && idx < p.length) ? p[idx].trim() : ''
      const rawId  = g(C.id)
      const variant = g(C.variant) || 'Normal'
      const uid    = `${rawId}|${variant}`
      const pr     = g(C.price).replace(/[€\u00A0\s]/g, '').replace(',', '.')
      const setName  = g(C.set)
      const cardName = g(C.name)

      function slug(n: string) {
        return n.replace(/&/g,'and').replace(/[éèê]/g,'e').replace(/[àâ]/g,'a')
          .replace(/[ûü]/g,'u').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-')
      }

      cards.push({
        id: uid, card_id: rawId, name: cardName,
        set_name: setName, series: g(C.series),
        card_number: rawId.split('-')[1] || '',
        variant, rarity: g(C.rarity),
        quantity: parseInt(g(C.qty)) || 0,
        category: g(C.cat),
        dex_price: isNaN(parseFloat(pr)) ? null : parseFloat(pr),
        cm_url: `https://www.cardmarket.com/de/Pokemon/Products/Singles/${slug(setName)}/${slug(cardName)}`,
        image_url: null,
      })
    }

    setMsg(`${cards.length} Karten gefunden, sende an Server…`)

    const res  = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards }),
    })

    if (!res.ok) throw new Error(`Server-Fehler: ${res.status}`)

    setState('done')
    setMsg(`${cards.length} Karten importiert`)
    onImported()
    setTimeout(() => { setState('idle'); setMsg('') }, 4000)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">CSV Export</label>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={state === 'loading'}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border
          ${state === 'done'    ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400' :
            state === 'error'   ? 'bg-red-900/30 border-red-500/30 text-red-400' :
            state === 'loading' ? 'bg-[#1a1a2a] border-white/8 text-white/40 cursor-not-allowed' :
            'bg-blue-900/20 border-blue-500/25 text-blue-400 hover:bg-blue-900/30 hover:border-blue-500/40'}`}>
        {state === 'done'
          ? <><CheckCircle className="w-4 h-4" /> {msg}</>
          : state === 'loading'
          ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> {msg}</>
          : <><Upload className="w-4 h-4" /> DEX CSV laden</>
        }
      </button>
      <input ref={inputRef} type="file" accept=".csv" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}
