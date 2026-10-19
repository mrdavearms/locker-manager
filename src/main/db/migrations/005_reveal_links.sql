-- Migration 005: reveal lines that point at nothing.
-- Undo in 0.11.4 and earlier copied code reveal lines into an older copy of the file
-- without checking that their student and locker were in it. A line could then point
-- at a student or locker that did not exist, and the link check after any later
-- migration refused the whole file (docs/audits/2026-10-20-stability-audit.md, 1).
-- The line itself is kept (who, when, where it was shown); only the link to nothing
-- is cleared. The reveal log is append-only, so its guard is lifted for this repair
-- and put back exactly as migration 001 made it.
DROP TRIGGER code_reveal_log_no_update;
UPDATE code_reveal_log SET student_id = NULL
  WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM student);
UPDATE code_reveal_log SET locker_id = NULL
  WHERE locker_id IS NOT NULL AND locker_id NOT IN (SELECT id FROM locker);
CREATE TRIGGER code_reveal_log_no_update BEFORE UPDATE ON code_reveal_log
BEGIN SELECT RAISE(ABORT, 'The code reveal log cannot be changed.'); END;
