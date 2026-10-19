import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyDiscordRequest(rawBody: string, signatureHex: string | null, timestamp: string | null): boolean {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKeyHex || !signatureHex || !timestamp) return false;

  try {
    const publicKey = Buffer.from(publicKeyHex, "hex");
    const signature = Buffer.from(signatureHex, "hex");
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody, "utf8"),
      new Uint8Array(signature),
      new Uint8Array(publicKey),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyDiscordRequest(
    rawBody,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
  )) {
    return NextResponse.json({ error: "Invalid Discord request signature." }, { status: 401 });
  }

  let interaction: { type?: number };
  try {
    interaction = JSON.parse(rawBody) as { type?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  // Discord's endpoint validation handshake.
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Non-PING interactions are wired into the HTTP dispatcher as the migration
  // progresses. Never execute unsigned requests or acknowledge an interaction
  // as successful until its handler has actually run.
  return NextResponse.json({
    type: 4,
    data: {
      content: "Relay's HTTP runtime is being migrated. Please try again after the update is complete.",
      flags: 64,
    },
  });
}
