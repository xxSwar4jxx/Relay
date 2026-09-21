import type { ParsedCustomId } from "../types";

const SEP = ":";
const MAX_LEN = 100; // Discord custom_id hard limit

/**
 * Builds a routable custom_id: "<namespace>:<action>[:<id>[:<extra>]]".
 * IDs embedded here are only ROUTING HINTS. Every handler must still verify
 * the referenced object exists, belongs to the current guild, and that the
 * invoking user is authorized — never trust the custom_id payload alone.
 */
export function buildCustomId(namespace: string, action: string, id?: string | number, extra?: string): string {
  const parts = [namespace, action];
  if (id !== undefined) parts.push(String(id));
  if (extra !== undefined) parts.push(extra);
  const out = parts.join(SEP);
  if (out.length > MAX_LEN) {
    throw new Error(`custom_id exceeds ${MAX_LEN} chars: ${out}`);
  }
  return out;
}

export function parseCustomId(customId: string): ParsedCustomId | null {
  if (!customId || typeof customId !== "string") return null;
  const parts = customId.split(SEP);
  if (parts.length < 2) return null;
  const [namespace, action, id, extra] = parts;
  if (!namespace || !action) return null;
  return { namespace, action, id, extra };
}
