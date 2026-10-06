-- Migration 001: the whole data model from SPEC.md section 3.
-- Never edit this file once it has shipped in a release. Add 002_*.sql instead.
--
-- Conventions
--   id          UUID text
--   *_at        ISO 8601 UTC text
--   updated_by  operator display name
--   booleans    INTEGER 0 or 1
--   JSON        TEXT holding JSON
--   *_cipher    BLOB, AES-256-GCM encrypted (encryption arrives in M4)
-- Students, lockers and assignments are never hard-deleted through the app; they
-- carry archived_at instead.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE school (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  short_name     TEXT,
  logo           BLOB,
  logo_type      TEXT,
  logo_mono      BLOB,
  logo_mono_type TEXT,
  colour_primary TEXT,
  colour_accent  TEXT,
  colour_stripes TEXT NOT NULL DEFAULT '[]',
  address        TEXT,
  timezone       TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  locale         TEXT NOT NULL DEFAULT 'en-AU',
  terminology    TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE school_year (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('planning', 'active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
-- Exactly one active year at a time.
CREATE UNIQUE INDEX school_year_one_active ON school_year (status) WHERE status = 'active';

CREATE TABLE area (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  colour              TEXT,
  default_year_levels TEXT NOT NULL DEFAULT '[]',
  archived_at         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  updated_by          TEXT NOT NULL
);

CREATE TABLE bank (
  id             TEXT PRIMARY KEY,
  area_id        TEXT NOT NULL REFERENCES area (id),
  name           TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  layout_rows    INTEGER,
  layout_columns INTEGER,
  notes          TEXT,
  archived_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE TABLE locker (
  id                    TEXT PRIMARY KEY,
  number                TEXT NOT NULL,
  sort_key              TEXT NOT NULL,
  bank_id               TEXT NOT NULL REFERENCES bank (id),
  position_row          INTEGER,
  position_column       INTEGER,
  tier                  TEXT CHECK (tier IN ('top', 'middle', 'bottom')),
  capacity              INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  accessible            INTEGER NOT NULL DEFAULT 0 CHECK (accessible IN (0, 1)),
  status                TEXT NOT NULL DEFAULT 'in_service'
                          CHECK (status IN ('in_service', 'out_of_service', 'reserved')),
  out_of_service_reason TEXT,
  out_of_service_date   TEXT,
  notes                 TEXT,
  qr_id                 TEXT NOT NULL UNIQUE,
  archived_at           TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  updated_by            TEXT NOT NULL
);
-- A locker number is unique among lockers in use (SPEC.md section 15, item 1).
CREATE UNIQUE INDEX locker_number_unique ON locker (number) WHERE archived_at IS NULL;
CREATE INDEX locker_bank ON locker (bank_id);

CREATE TABLE lock (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL CHECK (type IN (
                         'combination_builtin', 'combination_padlock_settable',
                         'combination_padlock_fixed', 'keyed_padlock', 'keyed_builtin',
                         'electronic', 'none')),
  serial_number        TEXT,
  manufacturer         TEXT,
  model                TEXT,
  dials                INTEGER,
  positions_per_dial   INTEGER,
  owned_by             TEXT NOT NULL DEFAULT 'school' CHECK (owned_by IN ('school', 'student')),
  locker_id            TEXT REFERENCES locker (id),
  code_cipher          BLOB,
  -- 'reset_no_code' is "the lock is on 0 0 0 0 and has no code yet": a real state,
  -- never a fake code (SPEC.md section 15, item 3).
  code_status          TEXT NOT NULL DEFAULT 'not_applicable' CHECK (code_status IN (
                         'not_applicable', 'set', 'reset_no_code', 'needs_new_code',
                         'awaiting_physical_reset')),
  key_number           TEXT,
  master_code_cipher   BLOB,
  status               TEXT NOT NULL DEFAULT 'in_use'
                         CHECK (status IN ('in_use', 'spare', 'lost', 'broken', 'retired')),
  notes                TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  updated_by           TEXT NOT NULL
);
CREATE INDEX lock_locker ON lock (locker_id);

CREATE TABLE code_history (
  id          TEXT PRIMARY KEY,
  lock_id     TEXT NOT NULL REFERENCES lock (id),
  code_cipher BLOB,
  from_date   TEXT NOT NULL,
  to_date     TEXT,
  reason      TEXT NOT NULL CHECK (reason IN (
                'issued', 'reset', 'compromised', 'forgotten', 'year_rollover', 'imported')),
  changed_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);
CREATE INDEX code_history_lock ON code_history (lock_id);

CREATE TABLE import_batch (
  id             TEXT PRIMARY KEY,
  school_year_id TEXT REFERENCES school_year (id),
  files          TEXT NOT NULL DEFAULT '[]',
  profile        TEXT,
  summary        TEXT NOT NULL DEFAULT '{}',
  applied_at     TEXT,
  applied_by     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE TABLE student (
  id                 TEXT PRIMARY KEY,
  external_id        TEXT NOT NULL UNIQUE,
  first_name_raw     TEXT NOT NULL,
  last_name_raw      TEXT NOT NULL,
  preferred_name_raw TEXT,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  preferred_name     TEXT,
  -- 1 when an operator has corrected the display name; imports never replace it.
  name_override      INTEGER NOT NULL DEFAULT 0 CHECK (name_override IN (0, 1)),
  year_level         TEXT,
  group_code         TEXT,
  house              TEXT,
  gender             TEXT,
  needs_accessible   INTEGER NOT NULL DEFAULT 0 CHECK (needs_accessible IN (0, 1)),
  email              TEXT,
  custom             TEXT NOT NULL DEFAULT '{}',
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  source_import_id   TEXT REFERENCES import_batch (id),
  first_seen         TEXT,
  last_seen          TEXT,
  left_at            TEXT,
  archived_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  updated_by         TEXT NOT NULL
);

CREATE TABLE key_event (
  id           TEXT PRIMARY KEY,
  lock_id      TEXT NOT NULL REFERENCES lock (id),
  event        TEXT NOT NULL CHECK (event IN ('issued', 'returned', 'lost', 'replaced', 'charged')),
  event_date   TEXT NOT NULL,
  student_id   TEXT REFERENCES student (id),
  notes        TEXT,
  amount_cents INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL
);

CREATE TABLE assignment (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES student (id),
  locker_id      TEXT NOT NULL REFERENCES locker (id),
  school_year_id TEXT NOT NULL REFERENCES school_year (id),
  start_date     TEXT NOT NULL,
  end_date       TEXT,
  status         TEXT NOT NULL CHECK (status IN ('current', 'ended', 'pending')),
  end_reason     TEXT CHECK (end_reason IN (
                   'left_school', 'moved_locker', 'year_rollover', 'swap', 'released_by_operator')),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);
CREATE INDEX assignment_student ON assignment (student_id, status);
CREATE INDEX assignment_locker ON assignment (locker_id, status);

CREATE TABLE exclusion (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('student', 'group', 'year_level')),
  value      TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (kind, value)
);

CREATE TABLE code_set (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  school_year_id TEXT REFERENCES school_year (id),
  purpose        TEXT NOT NULL CHECK (purpose IN ('year', 'spares')),
  rules          TEXT NOT NULL DEFAULT '{}',
  seed           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE TABLE code_set_entry (
  id          TEXT PRIMARY KEY,
  code_set_id TEXT NOT NULL REFERENCES code_set (id),
  code_cipher BLOB NOT NULL,
  code_length INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'assigned', 'used', 'void')),
  lock_id     TEXT REFERENCES lock (id),
  locker_id   TEXT REFERENCES locker (id),
  assigned_at TEXT,
  assigned_by TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);
CREATE INDEX code_set_entry_set ON code_set_entry (code_set_id, status);

CREATE TABLE label_template (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  definition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE letter_template (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  definition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE report_template (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  definition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE print_job (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('labels', 'letters', 'report', 'calibration')),
  template_id TEXT,
  records     TEXT NOT NULL DEFAULT '[]',
  printed_at  TEXT NOT NULL,
  printed_by  TEXT NOT NULL,
  machine     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);

CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  operator   TEXT NOT NULL,
  machine    TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  before     TEXT,
  after      TEXT,
  reason     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_entity ON audit_log (entity, entity_id);

CREATE TABLE code_reveal_log (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  operator   TEXT NOT NULL,
  machine    TEXT NOT NULL,
  student_id TEXT REFERENCES student (id),
  locker_id  TEXT REFERENCES locker (id),
  revealed_in TEXT NOT NULL CHECK (revealed_in IN ('screen', 'letter', 'export', 'report')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- History is append-only (SPEC.md 3.10).
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The history cannot be changed.'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The history cannot be deleted.'); END;
CREATE TRIGGER code_reveal_log_no_update BEFORE UPDATE ON code_reveal_log
BEGIN SELECT RAISE(ABORT, 'The code reveal log cannot be changed.'); END;
CREATE TRIGGER code_reveal_log_no_delete BEFORE DELETE ON code_reveal_log
BEGIN SELECT RAISE(ABORT, 'The code reveal log cannot be deleted.'); END;

-- Assignment rules, enforced here as well as in the app (SPEC.md 3.6).
CREATE TRIGGER assignment_capacity BEFORE INSERT ON assignment
WHEN NEW.status = 'current'
  AND (SELECT COUNT(*) FROM assignment a WHERE a.locker_id = NEW.locker_id AND a.status = 'current')
      >= (SELECT capacity FROM locker WHERE id = NEW.locker_id)
BEGIN SELECT RAISE(ABORT, 'That locker is already full.'); END;

CREATE TRIGGER assignment_capacity_update BEFORE UPDATE OF status, locker_id ON assignment
WHEN NEW.status = 'current'
  AND (SELECT COUNT(*) FROM assignment a
        WHERE a.locker_id = NEW.locker_id AND a.status = 'current' AND a.id <> NEW.id)
      >= (SELECT capacity FROM locker WHERE id = NEW.locker_id)
BEGIN SELECT RAISE(ABORT, 'That locker is already full.'); END;

CREATE TRIGGER assignment_one_per_student BEFORE INSERT ON assignment
WHEN NEW.status = 'current'
  AND COALESCE((SELECT json_extract(value, '$') FROM settings
                 WHERE key = 'assignments.allowMoreThanOnePerStudent'), 0) = 0
  AND EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = NEW.student_id AND a.status = 'current')
BEGIN SELECT RAISE(ABORT, 'That student already has a locker.'); END;

CREATE TRIGGER assignment_one_per_student_update BEFORE UPDATE OF status, student_id ON assignment
WHEN NEW.status = 'current'
  AND COALESCE((SELECT json_extract(value, '$') FROM settings
                 WHERE key = 'assignments.allowMoreThanOnePerStudent'), 0) = 0
  AND EXISTS (SELECT 1 FROM assignment a
               WHERE a.student_id = NEW.student_id AND a.status = 'current' AND a.id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'That student already has a locker.'); END;

CREATE TRIGGER assignment_in_service BEFORE INSERT ON assignment
WHEN NEW.status = 'current'
  AND (SELECT status FROM locker WHERE id = NEW.locker_id) <> 'in_service'
BEGIN SELECT RAISE(ABORT, 'That locker is out of service or reserved.'); END;

CREATE TRIGGER assignment_in_service_update BEFORE UPDATE OF status, locker_id ON assignment
WHEN NEW.status = 'current' AND (OLD.status <> 'current' OR OLD.locker_id <> NEW.locker_id)
  AND (SELECT status FROM locker WHERE id = NEW.locker_id) <> 'in_service'
BEGIN SELECT RAISE(ABORT, 'That locker is out of service or reserved.'); END;

-- The locker number cannot change in normal use; only the deliberate Renumber tool
-- (which sets meta 'renumber_in_progress' = '1' for its own transaction) may do it.
-- SPEC.md section 15, item 1.
CREATE TRIGGER locker_number_fixed BEFORE UPDATE OF number ON locker
WHEN OLD.number <> NEW.number
  AND COALESCE((SELECT value FROM meta WHERE key = 'renumber_in_progress'), '0') <> '1'
BEGIN SELECT RAISE(ABORT, 'Locker numbers cannot be changed here. Use Renumber lockers.'); END;
