-- Migration 003 (M6, v0.6.0): letters.
-- Pictures a school uploads for its letters, such as the lock maker's instructions
-- (SPEC.md 5.2). The app ships no third-party pictures.
CREATE TABLE image (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/svg+xml')),
  data       BLOB NOT NULL,
  -- Pixel size, so pages can keep the picture's shape without loading it.
  width      INTEGER NOT NULL CHECK (width > 0),
  height     INTEGER NOT NULL CHECK (height > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
