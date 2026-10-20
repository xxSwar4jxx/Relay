import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { verifyDiscordRequest } from "./discord-signature";

test("accepts a correctly signed Discord interaction payload", () => {
  const keys = nacl.sign.keyPair();
  const publicKey = Buffer.from(keys.publicKey).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = nacl.sign.detached(Buffer.from(timestamp + body), keys.secretKey);
  assert.equal(verifyDiscordRequest(body, Buffer.from(signature).toString("hex"), timestamp, publicKey), true);
});

test("rejects a modified body", () => {
  const keys = nacl.sign.keyPair();
  const publicKey = Buffer.from(keys.publicKey).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = nacl.sign.detached(Buffer.from(timestamp + '{"type":1}'), keys.secretKey);
  assert.equal(verifyDiscordRequest('{"type":2}', Buffer.from(signature).toString("hex"), timestamp, publicKey), false);
});

test("rejects missing headers, malformed hex, and stale timestamps", () => {
  const keys = nacl.sign.keyPair();
  const publicKey = Buffer.from(keys.publicKey).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  assert.equal(verifyDiscordRequest("{}", null, timestamp, publicKey), false);
  assert.equal(verifyDiscordRequest("{}", "not-hex", timestamp, publicKey), false);
  assert.equal(verifyDiscordRequest("{}", "00".repeat(64), String(Number(timestamp) - 600), publicKey), false);
});

test("rejects an invalid public key length", () => {
  assert.equal(verifyDiscordRequest("{}", "00".repeat(64), String(Math.floor(Date.now() / 1000)), "abcd"), false);
});
