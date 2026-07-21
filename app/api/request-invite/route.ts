import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabaseConfig";
import { bumpBucket } from "@/lib/inviteGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Ask for an invite" from the gate screen. Saves the request to
// roadlore_invite_requests AND emails Danny (Resend — same account Silly
// Goose sends from, verified loomiverse.ai domain). Succeeds if either the
// save or the email lands, so a hiccup in one never eats a request.
//
// Abuse guards: honeypot field for dumb bots, per-IP daily cap for annoying
// humans, hard length caps on everything.

const REQUESTS_PER_IP_PER_DAY = 5;
const NOTIFY_TO = "nolimitjones@gmail.com";
const FROM = "RoadLore <hello@loomiverse.ai>";

export async function POST(req: Request) {
  let name = "", email = "", howFound = "", honey = "";
  try {
    const body = await req.json();
    name = String(body.name || "").trim().slice(0, 80);
    email = String(body.email || "").trim().slice(0, 120);
    howFound = String(body.howFound || "").trim().slice(0, 600);
    honey = String(body.website || ""); // hidden field humans never fill
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Bots love filling every field. Pretend it worked and move on.
  if (honey) return NextResponse.json({ ok: true });

  if (!name || !howFound || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Need your name, a real email, and a line about how you found us." },
      { status: 400 }
    );
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!(await bumpBucket(`req:${ip}`, REQUESTS_PER_IP_PER_DAY))) {
    return NextResponse.json(
      { error: "That's a lot of knocking for one day — Danny heard you, promise." },
      { status: 429 }
    );
  }

  let savedOrSent = false;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_URL && serviceKey) {
    try {
      const sb = createClient(SUPABASE_URL, serviceKey);
      const { error } = await sb
        .from("roadlore_invite_requests")
        .insert({ name, email, how_found: howFound });
      if (!error) savedOrSent = true;
    } catch {
      /* fall through to email */
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [NOTIFY_TO],
          reply_to: email,
          subject: `RoadLore invite request: ${name}`,
          text: [
            `Someone's knocking on RoadLore's door.`,
            ``,
            `Name:  ${name}`,
            `Email: ${email}`,
            ``,
            `How they know you / found the site:`,
            howFound,
            ``,
            `To let them in: send them the friends code, or mint them their own`,
            `code in Supabase (roadlore_invites table).`,
          ].join("\n"),
        }),
      });
      if (res.ok) savedOrSent = true;
    } catch {
      /* saved copy may still exist */
    }
  }

  if (!savedOrSent) {
    return NextResponse.json(
      { error: "The carrier pigeon got lost — try again in a minute." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
