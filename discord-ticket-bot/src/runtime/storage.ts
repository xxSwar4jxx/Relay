import { del, get, list, put } from "@vercel/blob";

function assertBlobConfigured(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is missing. Connect a private Vercel Blob store.");
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function findBlob(pathname: string) {
  const result = await list({ prefix: pathname, limit: 100 });
  return result.blobs.find((blob) => blob.pathname === pathname) ?? null;
}

export async function readJson<T>(pathname: string, fallback: T): Promise<T> {
  assertBlobConfigured();
  const blob = await findBlob(pathname);
  if (!blob) return fallback;
  const result = await get(blob.url, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Unable to read Relay storage object "${pathname}".`);
  }
  try {
    return JSON.parse((await streamToBuffer(result.stream)).toString("utf8")) as T;
  } catch {
    throw new Error(`Relay storage object "${pathname}" contains invalid JSON.`);
  }
}

export async function writeJson(pathname: string, value: unknown): Promise<void> {
  assertBlobConfigured();
  await put(pathname, Buffer.from(JSON.stringify(value, null, 2)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function deleteJson(pathname: string): Promise<void> {
  assertBlobConfigured();
  const blob = await findBlob(pathname);
  if (blob) await del(blob.url);
}
