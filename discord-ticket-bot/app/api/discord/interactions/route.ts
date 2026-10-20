import { NextRequest, NextResponse } from "next/server";
import { handleHttpInteraction } from "../../../../src/runtime/http-handlers";
import { verifyDiscordRequest } from "../../../../src/runtime/discord-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


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
    const details = error && typeof error === "object" ? error as { status?: number; discordCode?: number; message?: string } : {};
    const content = details.status === 403 || details.discordCode === 50013
      ? "Relay is missing a Discord permission for this action. Give the bot Manage Channels, View Channels, Send Messages, and Read Message History, then try again."
      : details.status === 401 || details.discordCode === 50001
        ? "Relay cannot access this Discord resource. Check that the bot is still in the server and has access to the configured channels."
        : "Relay couldn't complete that action. Check the bot's server configuration and try again.";
    // Keep credentials and provider internals out of user-facing interaction responses.
    return NextResponse.json({ type: 4, data: { content, flags: 64 } });
  }
}
