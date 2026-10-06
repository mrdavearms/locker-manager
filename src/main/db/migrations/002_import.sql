-- Migration 002 (M3, v0.3.0): imports.
-- not_in_import_since: the date of the first import that covered this student's year
-- level but did not include them. Such students are "possible leavers" until an operator
-- confirms they left (SPEC.md 4.2). Cleared when they appear in an import again.
ALTER TABLE student ADD COLUMN not_in_import_since TEXT;
-- Names flagged for a human check (two-word or particle surnames, ambiguous Mac),
-- as a JSON array of short codes. Cleared when an operator confirms the spelling.
ALTER TABLE student ADD COLUMN name_check TEXT NOT NULL DEFAULT '[]';
CREATE INDEX student_group ON student (year_level, group_code);
