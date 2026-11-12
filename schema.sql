-- Listening progress, one row per episode.
--   updated: device clock when the listener last changed it (last write wins)
--   srv:     server clock when the row was written (used for incremental pulls)
CREATE TABLE IF NOT EXISTS progress (
  id      TEXT PRIMARY KEY,
  pos     REAL NOT NULL DEFAULT 0,
  dur     REAL,
  done    INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  srv     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS progress_srv ON progress (srv);

-- Favorites, kept apart from progress so each has its own last-write-wins clock.
CREATE TABLE IF NOT EXISTS favorites (
  id      TEXT PRIMARY KEY,
  fav     INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  srv     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS favorites_srv ON favorites (srv);

-- k = 'episodes' (the catalog JSON) or 'status' (result of the last check).
CREATE TABLE IF NOT EXISTS catalog (
  k       TEXT PRIMARY KEY,
  v       TEXT NOT NULL,
  updated INTEGER NOT NULL
);
