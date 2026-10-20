import nacl from "tweetnacl";

/** Verify Discord's Ed25519 signature over timestamp + exact raw request body. */
export function verifyDiscordRequest(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex = process.env.DISCORD_PUBLIC_KEY,
  nowMs = Date.now(),
): boolean {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  try {
    if (!/^[0-9a-f]{128}$/i.test(signatureHex) || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
    if (!/^\d+$/.test(timestamp)) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowMs / 1000 - timestampSeconds) > 5 * 60) return false;
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody, "utf8"),
      new Uint8Array(Buffer.from(signatureHex, "hex")),
      new Uint8Array(Buffer.from(publicKeyHex, "hex")),
    );
  } catch {
    return false;
  }
}
