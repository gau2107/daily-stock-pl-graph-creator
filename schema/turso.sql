PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sector (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS instrument (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sector_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (sector_id) REFERENCES sector(id)
);

CREATE TABLE IF NOT EXISTS daily_pl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  daily_pl REAL,
  total_pl REAL,
  current_value REAL,
  nifty_50 REAL
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  instrument_id INTEGER NOT NULL,
  qty REAL,
  avg_cost REAL,
  ltp REAL,
  invested REAL,
  cur_val REAL,
  p_l REAL,
  net_chg REAL,
  day_chg REAL,
  FOREIGN KEY (instrument_id) REFERENCES instrument(id)
);

CREATE TABLE IF NOT EXISTS investment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS investment_scheme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  investment_type_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (investment_type_id) REFERENCES investment_types(id)
);

CREATE TABLE IF NOT EXISTS cumulative_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  scheme_id INTEGER NOT NULL,
  invested_value REAL,
  current_value REAL,
  p_l REAL,
  FOREIGN KEY (scheme_id) REFERENCES investment_scheme(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_pl_date ON daily_pl(date);
CREATE INDEX IF NOT EXISTS idx_holdings_instrument_date ON holdings(instrument_id, date);
CREATE INDEX IF NOT EXISTS idx_cumulative_holdings_scheme_date ON cumulative_holdings(scheme_id, date);
