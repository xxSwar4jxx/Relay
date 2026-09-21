import type { Client } from "discord.js";

export function handleReady(client: Client<true>): void {
  console.log(`[ready] Logged in as ${client.user.tag} (${client.user.id})`);
  console.log(`[ready] Serving ${client.guilds.cache.size} guild(s)`);
}
