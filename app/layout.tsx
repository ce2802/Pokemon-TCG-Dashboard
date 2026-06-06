import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PokéDex Preise',
  description: 'Cardmarket Preise für deine Pokémon-Sammlung',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
