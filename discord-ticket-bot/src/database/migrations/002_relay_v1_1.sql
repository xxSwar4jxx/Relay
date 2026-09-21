-- Relay V1.1: no destructive schema changes required.
-- Existing columns (claimed_by, position, style, staff_role_ids, etc.) already present.
-- This migration is a no-op marker so future changes can build on it.
SELECT 1;
