// Public Supabase connection values — SAFE to commit.
//
// The project URL and the anon ("public") key are designed to ship to
// browsers; Row-Level Security plus the server-only SERVICE_ROLE_KEY are what
// actually protect the data. We hardcode them here as the source of truth
// because Vercel force-locks env vars as "sensitive," and sensitive
// NEXT_PUBLIC_* values are NOT inlined into the build — which silently
// disabled the shared story pool (no caching) and saved stories. Baking the
// public values into code sidesteps that lock permanently. A real env var, if
// present, still wins.
//
// The SERVICE_ROLE_KEY is the only true secret and is never placed here — it
// stays an environment variable read on the server.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ftcdqmrjjooluihysuyc.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
