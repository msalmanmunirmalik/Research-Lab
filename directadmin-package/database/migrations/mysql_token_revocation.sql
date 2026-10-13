-- Sprint 5: logout and password change invalidate JWTs issued before this timestamp.
-- Nullable. Existing rows stay NULL, so current tokens keep working until the next logout or password change.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens_invalid_before DATETIME NULL;
