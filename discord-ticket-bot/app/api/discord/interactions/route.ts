import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { handleHttpInteraction } from "../../../../src/runtime/http-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyDiscordRequest(rawBody: string, signatureHex: string | null, timestamp: string | null): boolean {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  try {
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) return false;
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

export async function GET() {
  return NextResponse.json({ ok: true, service: "relay-interactions", runtime: "http" });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyDiscordRequest(rawBody, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"))) {
    return NextResponse.json({ error: "Invalid Discord request signature." }, { status: 401 });
  }

  let interaction: Parameters<typeof handleHttpInteraction>[0];
  try {
    interaction = JSON.parse(rawBody) as Parameters<typeof handleHttpInteraction>[0];
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const payload = await handleHttpInteraction(interaction);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[relay-http-interaction] Failed:", error);
    // Do not expose tokens, configuration, or provider internals in interaction responses.
    return NextResponse.json({
      type: 4,
      data: { content: "Relay couldn't complete that action. Check the bot's server configuration and try again.", flags: 64 },
    });
  }
}
