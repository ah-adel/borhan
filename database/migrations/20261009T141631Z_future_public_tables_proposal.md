# Future Public Tables Proposal

This is a proposal only; it is not applied by the lockdown migration.

Production has `DATABASE_AUTO_INIT=false`. Public tables are currently defined in `database/schema.sql` and versioned `database/migrations/` SQL files; there is no runtime schema initializer in the FastAPI startup path. The lockdown migration revokes future-object defaults for `postgres` and, if permitted, `supabase_admin`. PostgreSQL has no default-RLS setting, so each new table still needs RLS enabled.

Production verification confirmed the `postgres` defaults were revoked. The connected role could not change `supabase_admin` defaults, so its existing table, sequence, and function defaults still grant privileges to `anon` and `authenticated`. Do not create new public objects as `supabase_admin` until an appropriately authorized administrator revokes those defaults and verifies them.

Minimal project convention: every future `CREATE TABLE public.<name>` in `database/schema.sql` or a numbered migration must be followed in the same transaction by:

```sql
ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.<name> FROM anon, authenticated;
```

Do not add permissive anon/authenticated policies by default. Any intentional client-facing table must receive a reviewed, narrowly scoped policy and explicit privileges in that migration. Keep the default-privilege revocations in migrations for every role that is permitted to create public objects.

An event trigger could automate RLS enabling for arbitrary DDL, but it was not selected or installed: managed Supabase may restrict event-trigger creation, and an automatically privileged DDL hook adds a new security-sensitive function. If automatic enforcement is required for SQL-editor-created tables, first verify supported event-trigger privileges in a staging Supabase project and review an invoker-only trigger design.