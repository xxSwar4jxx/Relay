import { REST, Routes } from "discord.js";
import { env } from "./config/env";
import { commands } from "./commands";

async function main() {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  if (env.DEV_GUILD_ID) {
    console.log(`[deploy] Registering ${body.length} command(s) to guild ${env.DEV_GUILD_ID} (instant)...`);
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), { body });
  } else {
    console.log(`[deploy] Registering ${body.length} command(s) globally (may take up to 1 hour to propagate)...`);
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body });
  }

  console.log("[deploy] Done.");
}

main().catch((err) => {
  console.error("[deploy] Failed:", err);
  process.exit(1);
});
