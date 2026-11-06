CREATE TABLE IF NOT EXISTS columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  column_id INTEGER NOT NULL REFERENCES columns(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'mid', 'high')),
  position INTEGER NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('sumi', 'shu', 'ai', 'moegi', 'yamabuki', 'fuji'))
);

CREATE TABLE IF NOT EXISTS card_labels (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE INDEX IF NOT EXISTS cards_column_idx ON cards (column_id, archived_at, position);
