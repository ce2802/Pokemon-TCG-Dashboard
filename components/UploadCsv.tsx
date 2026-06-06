'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle } from 'lucide-react'

type Props = { onImported: () => void }

const slugify = (n: string) => (n || '').replace(/&/g, 'and').replace(/[éèê]/g, 'e')
  .replace(/[àâ]/g, 'a').replace(/[ûü]/g, 'u').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')

export default function UploadCsv({ onImported }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setState('loading'); setMsg('Lese CSV...')
    const reader = new FileReader()
    reader.onload = async ev => {
      let text = ev.target?.result as string
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      await importCards(text)
    }
    reader.readAsText(file, 'UTF-16')
  }

  async function importCards(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const hdr = lines[0].split(';').map(h => h.trim().toLowerCase())
    const col = (k: string) => hdr.indexOf(k)
    const C = {
      cat: col('category'), series: col('series'), set: col('set'), id: col('id'),
      name: col('name'), variant: col('variant'), rarity: col('rarity'),
      qty: col('quantity'), price: col('price')
    }
    const cards = []
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(';')
      if (p.length < 6) continue
      const g = (idx: number) => (idx >= 0 && idx < p.length) ? p[idx].trim() : ''
      const rawId = g(C.id)
      const variant = g(C.variant) || 'Normal'
      const uid = `${rawId}|${variant}`
      const pr = g(C.price).replace(/[€\u00A0\s]/g, '').replace(',', '.')
      const setName = g(C.set)
      const cardName = g(C.name)
      cards.push({
        id: uid, card_id: rawId, name: cardName, set_name: setName,
        series: g(C.series), card_number: rawId.split('-')[1] || '',
        variant, rarity: g(C.rarity), quantity: parseInt(g(C.qty)) || 0,
        category: g(C.cat), dex_price: isNaN(parseFloat(pr)) ? null : parseFloat(pr),
        cm_url: `https://www.cardmarket.com/de/Pokemon/Products/Singles/${slugify(setName)}/${slugify(cardName)}`,
        image_url: null,
      })
    }
    setMsg(`${cards.length} Karten gefunden, sende...`)
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setState('done'); setMsg(`${data.imported} Karten importiert!`)
      onImported()
      setTimeout(() => { setState('idle'); setMsg('') }, 5000)
    } catch (err: any) {
      setState('error'); setMsg(err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#55556a' }}>CSV Export</label>
      <button onClick={() => inputRef.current?.click()} disabled={state === 'loading'} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px',
        borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        background: state === 'done' ? 'rgba(41,224,134,0.12)' : state === 'error' ? 'rgba(255,61,61,0.12)' : 'rgba(78,158,255,0.12)',
        border: `1px solid ${state === 'done' ? 'rgba(41,224,134,0.3)' : state === 'error' ? 'rgba(255,61,61,0.3)' : 'rgba(78,158,255,0.3)'}`,
        color: state === 'done' ? '#29e086' : state === 'error' ? '#ff6666' : '#4e9eff',
        fontFamily: 'inherit',
      }}>
        {state === 'loading'
          ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid rgba(255,255,255,0.7)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          : state === 'done' ? <CheckCircle size={14} /> : <Upload size={14} />}
        {state === 'idle' ? 'DEX CSV laden' : msg}
      </button>
      <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}
