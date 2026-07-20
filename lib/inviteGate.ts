// Server-side invite gate. RoadLore is invite-only while it runs on DJ's
// personal API keys: every route that costs real money (/api/story,
// /api/voice) must see a valid invite code before doing any work.
//
// Codes live in the roadlore_invites table, which is readable ONLY with the
// service-role key — the public anon key has no access, so codes can't be
// enumerated from the browser. The client remembers a validated code in
// localStorage and sends it with each request; the server re-checks it every
// time, so killing a code in the table locks that crowd out instantly.
//
// This module is imported by API routes only — never ship it to the client.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabaseConfig";

// Seatbelts, not the wall: even a valid code can't generate more than
// DEVICE_CAP fresh stories per device per day, and — because deviceId is
// client-supplied and can be rotated by anyone hostile — the CODE itself is
// capped too, which bounds what a leaked code can ever cost regardless of
// how many "devices" it pretends to be. Cached pool replays don't count.
const DAILY_DEVICE_CAP = 25;
const DAILY_CODE_CAP = 150;

function client(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return SUPABASE_URL && serviceKey ? createClient(SUPABASE_URL, serviceKey) : null;
}

function normalize(code: unknown): string {
  if (typeof code !== "string") return "";
  const n = code.trim().toLowerCase();
  return n.length > 64 ? "" : n;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fail CLOSED: if the gate can't be checked (missing service key, table
// missing, Supabase down), nobody gets through. A silently-open door would
// defeat the entire point of the wall.
export async function validateInvite(code: unknown): Promise<boolean> {
  const normalized = normalize(code);
  if (!normalized) return false;
  const sb = client();
  if (!sb) return false;
  try {
    const { data, error } = await sb
      .from("roadlore_invites")
      .select("code")
      .eq("code", normalized)
      .eq("active", true)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

// Usage stats for the guest list (how often is each code used?). Best-effort
// and stats-only — never blocks a request.
export async function touchInvite(code: unknown): Promise<void> {
  const normalized = normalize(code);
  const sb = client();
  if (!normalized || !sb) return;
  try {
    const { data } = await sb
      .from("roadlore_invites")
      .select("use_count")
      .eq("code", normalized)
      .maybeSingle();
    if (data) {
      await sb
        .from("roadlore_invites")
        .update({ use_count: (data.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("code", normalized);
    }
  } catch {
    /* stats only */
  }
}

// Count this request against today's device and code budgets, and say
// whether it's still allowed. The +1 happens atomically inside Postgres
// (roadlore_bump_usage), so parallel requests can't race past the cap.
// Bumping BEFORE generating means a failed generation eats a slot — a small
// undercount in the guest's favor is fine; an overcount in an attacker's
// favor is not.
//
// The seatbelt fails OPEN: the invite check above is the wall; if the usage
// counter hiccups we'd rather serve a story than strand an invited guest.
export async function bumpDailyUsage(deviceId: string, invite: unknown): Promise<boolean> {
  const sb = client();
  if (!sb) return true;
  try {
    const day = today();
    const [dev, code] = await Promise.all([
      sb.rpc("roadlore_bump_usage", { p_key: `dev:${deviceId}`, p_day: day }),
      sb.rpc("roadlore_bump_usage", { p_key: `code:${normalize(invite)}`, p_day: day }),
    ]);
    if (dev.error || code.error) return true;
    return Number(dev.data) <= DAILY_DEVICE_CAP && Number(code.data) <= DAILY_CODE_CAP;
  } catch {
    return true;
  }
}
