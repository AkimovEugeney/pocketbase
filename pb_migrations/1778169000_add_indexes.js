migrate((app) => {
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_ledger_student_created ON student_ledger (student, created)").execute();
  app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_idempotency ON student_ledger (idempotency_key)").execute();

  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_lessons_student_starts ON lessons (student, starts_at)").execute();
  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_lessons_session ON lessons (session_id)").execute();

  app.db().newQuery("CREATE INDEX IF NOT EXISTS idx_plans_student_status_exp ON student_plans (student, status, expires_at)").execute();
}, (app) => {
  app.db().newQuery("DROP INDEX IF EXISTS idx_ledger_student_created").execute();
  app.db().newQuery("DROP INDEX IF EXISTS ux_ledger_idempotency").execute();
  app.db().newQuery("DROP INDEX IF EXISTS idx_lessons_student_starts").execute();
  app.db().newQuery("DROP INDEX IF EXISTS idx_lessons_session").execute();
  app.db().newQuery("DROP INDEX IF EXISTS idx_plans_student_status_exp").execute();
});
