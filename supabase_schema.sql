-- ═══════════════════════════════════════════════
--  PokéDex Preise – Supabase Schema (korrigiert)
--  Einmalig im Supabase SQL Editor ausführen
-- ═══════════════════════════════════════════════

-- Alte Tabellen löschen falls vorhanden (sauber neu starten)
DROP VIEW  IF EXISTS price_history_30d CASCADE;
DROP VIEW  IF EXISTS latest_prices     CASCADE;
DROP TABLE IF EXISTS prices            CASCADE;
DROP TABLE IF EXISTS cards             CASCADE;

-- ── Karten-Tabelle ────────────────────────────
CREATE TABLE cards (
  id            TEXT PRIMARY KEY,        -- z.B. "dp1-36|Reverse Holo"
  card_id       TEXT NOT NULL,           -- originale DEX ID z.B. "dp1-36"
  name          TEXT NOT NULL,
  set_name      TEXT NOT NULL,
  series        TEXT,
  card_number   TEXT,
  variant       TEXT DEFAULT 'Normal',
  rarity        TEXT,
  quantity      INTEGER DEFAULT 0,
  category      TEXT DEFAULT 'Meine Sammlung',
  dex_price     NUMERIC(10,2),
  image_url     TEXT,
  cm_url        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Preishistorie-Tabelle ─────────────────────
CREATE TABLE prices (
  id            BIGSERIAL PRIMARY KEY,
  card_id       TEXT NOT NULL,
  scraped_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  language      TEXT NOT NULL DEFAULT 'D',
  condition     TEXT NOT NULL DEFAULT 'NM',
  price_low     NUMERIC(10,2),
  price_trend   NUMERIC(10,2),
  price_avg     NUMERIC(10,2),
  offers_count  INTEGER,
  CONSTRAINT fk_card
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  UNIQUE(card_id, scraped_at, language, condition)
);

-- ── Indizes ───────────────────────────────────
CREATE INDEX idx_prices_card_id    ON prices(card_id);
CREATE INDEX idx_prices_scraped_at ON prices(scraped_at);
CREATE INDEX idx_prices_lang_cond  ON prices(language, condition);

-- ── View: neuester Preis pro Karte ────────────
CREATE VIEW latest_prices AS
SELECT DISTINCT ON (p.card_id, p.language, p.condition)
  p.id,
  p.card_id,
  p.scraped_at,
  p.language,
  p.condition,
  p.price_low,
  p.price_trend,
  p.price_avg,
  p.offers_count,
  c.name,
  c.set_name,
  c.series,
  c.variant,
  c.rarity,
  c.quantity,
  c.category,
  c.dex_price,
  c.image_url,
  c.cm_url
FROM prices p
JOIN cards c ON c.id = p.card_id
ORDER BY p.card_id, p.language, p.condition, p.scraped_at DESC;

-- ── View: 30-Tage-Verlauf ─────────────────────
CREATE VIEW price_history_30d AS
SELECT
  p.card_id,
  p.language,
  p.condition,
  p.scraped_at,
  p.price_low,
  p.price_trend,
  p.price_avg,
  c.name,
  c.set_name,
  c.variant
FROM prices p
JOIN cards c ON c.id = p.card_id
WHERE p.scraped_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY p.card_id, p.language, p.condition, p.scraped_at ASC;

-- ── Row Level Security ────────────────────────
ALTER TABLE cards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Jeder darf lesen (Dashboard ist öffentlich)
CREATE POLICY "Public read cards"
  ON cards FOR SELECT USING (true);

CREATE POLICY "Public read prices"
  ON prices FOR SELECT USING (true);

-- Nur der Service-Key darf schreiben (Scraper + Import)
CREATE POLICY "Service write cards"
  ON cards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service write prices"
  ON prices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
