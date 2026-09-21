import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "./config/env";
import { getDb } from "./database/db";
import { handleReady } from "./events/ready";
import { handleInteractionCreate } from "./events/interactionCreate";

// Initialize (and migrate) the database before the client connects.
getDb();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

client.once("ready", (readyClient) => handleReady(readyClient));

client.on("interactionCreate", (interaction) => {
  void handleInteractionCreate(interaction);
});

client.on("error", (err) => {
  console.error("[client] Client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled rejection:", reason);
});

client.login(env.DISCORD_TOKEN).catch((err) => {
  console.error("[login] Failed to log in. Check DISCORD_TOKEN.", err);
  process.exit(1);
});
