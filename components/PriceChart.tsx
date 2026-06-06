'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { X } from 'lucide-react'

type HistoryEntry = {
  scraped_at: string
  price_low: number | null
  price_trend: number | null
  price_avg: number | null
}

type Props = {
  card: { id: string; name: string; set_name: string; variant: string; image_url: string | null }
  lang: string
  cond: string
  langLabel: string
  condLabel: string
}

export default function PriceChart({ card, lang, cond, langLabel, condLabel }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/prices?id=${encodeURIComponent(card.id)}&lang=${lang}&cond=${cond}`)
      .then(r => r.json())
      .then(d => setHistory(d.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [card.id, lang, cond])

  const chartData = history.map(h => ({
    date: new Date(h.scraped_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    'Ab-Preis': h.price_low,
    'Trend':    h.price_trend,
    'Ø Preis':  h.price_avg,
  }))

  return (
    <div className="bg-[#13131f] border border-white/10 rounded-xl p-6">
      <div className="flex items-start gap-4 mb-6">
        {card.image_url && (
          <img src={card.image_url} alt={card.name}
            className="w-16 h-22 object-cover rounded-lg border border-white/10 flex-shrink-0" />
        )}
        <div>
          <h3 className="text-lg font-bold text-white">{card.name}</h3>
          <p className="text-sm text-white/40">{card.set_name} · {card.variant}</p>
          <p className="text-xs text-white/25 mt-1 uppercase tracking-wider">
            {langLabel} · {condLabel} · 30-Tage-Verlauf
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-white/30 text-sm">
          Lade Preishistorie…
        </div>
      ) : history.length < 2 ? (
        <div className="h-48 flex flex-col items-center justify-center text-white/30 text-sm gap-2">
          <span className="text-3xl">📊</span>
          <span>Noch nicht genug Daten für einen Verlauf</span>
          <span className="text-xs text-white/20">Wird täglich automatisch befüllt</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${v.toFixed(0)}€`} width={40} />
            <Tooltip
              contentStyle={{ background: '#1a1a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}
              formatter={(v: number) => [`${v.toFixed(2).replace('.', ',')} €`]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }} />
            <Line type="monotone" dataKey="Ab-Preis" stroke="#29e086" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="Trend"    stroke="#ffd426" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="Ø Preis"  stroke="#4e9eff" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} strokeOpacity={0.6} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
