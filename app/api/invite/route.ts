import { NextResponse } from "next/server";
import { validateInvite, touchInvite } from "@/lib/inviteGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Checks an invite code against the guest list. The client calls this once
// when the user types their code, then stores the code and sends it with
// every story/voice request — each of which re-validates server-side, so
// this endpoint is a convenience check, not the actual wall.
export async function POST(req: Request) {
  let code = "";
  try {
    const body = await req.json();
    code = String(body.code || "");
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!(await validateInvite(code))) {
    // Slow down wrong guesses. This alone won't stop a distributed
    // brute-force — codes having real entropy (see the SQL file's comments)
    // is the actual defense — but it makes casual guessing miserable.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json(
      { error: "That code didn't open the door. Double-check it and try again." },
      { status: 401 }
    );
  }

  await touchInvite(code);
  return NextResponse.json({ ok: true });
}
