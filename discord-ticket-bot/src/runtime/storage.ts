import { del, get, put } from "@vercel/blob";

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

export async function readJson<T>(pathname: string, fallback: T): Promise<T> {
  assertBlobConfigured();
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return fallback;
  try {
    return JSON.parse((await streamToBuffer(result.stream)).toString("utf8")) as T;
  } catch {
    return fallback;
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
  await del(pathname);
}
