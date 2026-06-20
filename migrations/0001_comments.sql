CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  book_key   TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_comments_book_key ON comments (book_key);
