import test from "node:test";
import assert from "node:assert/strict";
import { readJson, writeJson } from "./storage";

test("storage operations fail clearly when Blob credentials are missing", async () => {
  const original = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    await assert.rejects(readJson("relay/test.json", {}), /BLOB_READ_WRITE_TOKEN is missing/);
    await assert.rejects(writeJson("relay/test.json", {}), /BLOB_READ_WRITE_TOKEN is missing/);
  } finally {
    if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = original;
  }
});
