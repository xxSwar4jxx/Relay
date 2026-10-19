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

  // Required by Discord when validating an interactions endpoint.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  // This branch is intentionally not production-ready yet: feature handlers
  // must be ported from Gateway interaction objects to raw HTTP payloads
  // before normal commands and components can be enabled.
  return NextResponse.json({
    type: 4,
    data: {
      content: "Relay is being upgraded to its HTTP runtime. Please try again after the migration is complete.",
      flags: 64,
    },
  });
}
