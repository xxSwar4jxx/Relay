import "dotenv/config";
import path from "node:path";

interface Env {
  DISCORD_TOKEN: string;
  CLIENT_ID: string;
  DEV_GUILD_ID: string | null;
  DATABASE_PATH: string;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[env] Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

function validateLogLevel(value: string | undefined): Env["LOG_LEVEL"] {
  const allowed = ["debug", "info", "warn", "error"] as const;
  if (!value) return "info";
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`[env] LOG_LEVEL must be one of ${allowed.join(", ")}`);
  }
  return value as Env["LOG_LEVEL"];
}

export function loadEnv(): Env {
  const DISCORD_TOKEN = required("DISCORD_TOKEN");
  const CLIENT_ID = required("CLIENT_ID");
  const DEV_GUILD_ID = process.env.DEV_GUILD_ID?.trim() || null;
  const DATABASE_PATH =
    process.env.DATABASE_PATH?.trim() || path.join(process.cwd(), "data", "tickets.sqlite");
  const LOG_LEVEL = validateLogLevel(process.env.LOG_LEVEL);

  return { DISCORD_TOKEN, CLIENT_ID, DEV_GUILD_ID, DATABASE_PATH, LOG_LEVEL };
}

export const env = loadEnv();
