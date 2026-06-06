# 🎴 PokéDex Preise Dashboard

Echte Cardmarket-Preise nach **Sprache + Zustand** für deine Pokémon-Sammlung.  
Automatisch täglich aktualisiert per GitHub Actions · Hosted auf Vercel · Daten in Supabase.

---

## 🏗 Architektur

```
GitHub Actions (täglich 08:00 Uhr)
  → Playwright scrapt Cardmarket (DE/NM + EN/NM)
  → Speichert Preise in Supabase

Vercel (Next.js Dashboard)
  → Liest Karten + Preise aus Supabase
  → Zeigt 30-Tage-Verlauf als Chart
```

---

## ⚙️ Setup (einmalig, ~15 Minuten)

### 1. Supabase Schema erstellen

1. Gehe zu deinem Supabase-Projekt → **SQL Editor**
2. Füge den Inhalt von `supabase_schema.sql` ein und klicke **Run**

### 2. Supabase Keys holen

Unter **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL` → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon/public key
- `SUPABASE_SERVICE_KEY` → service_role key (geheim!)

### 3. Vercel deployen

```bash
# Repo klonen
git clone https://github.com/ce2802/Pokemon-TCG-Dashboard
cd Pokemon-TCG-Dashboard

# Auf Vercel deployen
npx vercel
```

Dann in **Vercel → Settings → Environment Variables** eintragen:
```
NEXT_PUBLIC_SUPABASE_URL     = https://kdukgonkpwszghyncajm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon key>
SUPABASE_SERVICE_KEY          = <service role key>
```

### 4. GitHub Actions Secrets setzen

GitHub → Repository → **Settings → Secrets → Actions → New secret**:
```
SUPABASE_URL         = https://kdukgonkpwszghyncajm.supabase.co
SUPABASE_SERVICE_KEY = <service role key>
```

### 5. Karten importieren

Im Dashboard auf **„DEX CSV laden"** klicken und die Dex-App Export-Datei auswählen.  
Die Karten werden in Supabase gespeichert, Bilder werden automatisch von TCGdex geladen.

### 6. Ersten Scrape starten

GitHub → **Actions → „Cardmarket Preise scrapen" → Run workflow**

---

## 🔄 Automatischer Ablauf

- **Täglich 08:00 Uhr**: GitHub Actions scrapt alle Karten auf Cardmarket
- **Sprachen**: Deutsch (Standard) + Englisch
- **Zustand**: Near Mint (Standard)
- **Manuell**: Über GitHub Actions → Run workflow mit eigener Sprache/Zustand

---

## 📊 Features

- ✅ Echte Cardmarket-Preise nach Sprache + Zustand
- ✅ Ab-Preis, Price Trend, Durchschnitt
- ✅ 30-Tage-Preisverlauf als Chart (nach genug Tagen)
- ✅ Kartenbilder via TCGdex
- ✅ Filter: Sprache, Zustand, Serie, Seltenheit, Kategorie
- ✅ Sortierung nach allen Spalten
- ✅ Differenz DEX-Preis vs. Live-Preis
- ✅ Direktlink zu jeder Karte auf Cardmarket

---

## 🛠 Lokale Entwicklung

```bash
npm install
cp .env.local.example .env.local
# .env.local mit deinen Keys befüllen
npm run dev
# → http://localhost:3000
```

Scraper lokal testen:
```bash
npm install playwright
npx playwright install chromium
SCRAPE_LANG=D SCRAPE_COND=NM node scripts/scraper.js
```
