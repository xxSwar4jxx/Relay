const DISCORD_API = "https://discord.com/api/v10";

export class DiscordRestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly discordCode?: number,
  ) {
    super(message);
    this.name = "DiscordRestError";
  }
}

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  return token;
}

/**
 * Minimal Discord REST client for serverless handlers.
 * Do not use this for interaction callback responses; those must be returned
 * directly from the signed interactions endpoint within Discord's deadline.
 */
export async function discordRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) throw new Error("Discord REST path must start with /");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${botToken()}`);
  headers.set("User-Agent", "Relay (https://github.com/xxSwar4jxx/Relay, 2.0.0)");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const body = await response.text();
  let parsed: unknown = undefined;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }

  if (!response.ok) {
    const details = parsed && typeof parsed === "object" ? parsed as { message?: string; code?: number } : {};
    throw new DiscordRestError(
      details.message || `Discord REST request failed with status ${response.status}.`,
      response.status,
      details.code,
    );
  }

  return parsed as T;
}

export function discordJson(body: unknown): string {
  return JSON.stringify(body);
}
