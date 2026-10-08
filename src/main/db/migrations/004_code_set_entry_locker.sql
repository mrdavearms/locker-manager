-- Migration 004: an index for finding a locker's waiting code.
-- Giving out lockers looks up each locker's entry in this year's code set by locker and
-- status. Without this index it read through the entries of every past year, which grew
-- slower each year at a large school (docs/audits/2026-10-09-large-school.md, item 4).
CREATE INDEX code_set_entry_locker ON code_set_entry (locker_id, status);
