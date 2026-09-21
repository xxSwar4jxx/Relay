import type { Interaction } from "discord.js";
import { commandsByName } from "../commands";
import { routeButton } from "../interactions/buttons";
import { routeModal } from "../interactions/modals";
import { routeSelectMenu } from "../interactions/selectMenus";
import { UserFacingError } from "../utils/errors";
import { errorEmbed } from "../utils/embeds";

async function safeRespond(interaction: Interaction, message: string): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], ephemeral: true } as const;
  try {
    if (!("isRepliable" in interaction) || !interaction.isRepliable()) return;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: payload.embeds });
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // If we can't even send the error, there's nothing more we can safely do.
  }
}

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) {
        await safeRespond(interaction, "Unknown command.");
        return;
      }
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      await routeButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await routeModal(interaction);
      return;
    }

    if (interaction.isAnySelectMenu()) {
      await routeSelectMenu(interaction);
      return;
    }
  } catch (err) {
    if (err instanceof UserFacingError) {
      await safeRespond(interaction, err.message);
      return;
    }
    // Unexpected error: log full detail for developers, never leak internals to the user.
    console.error("[interactionCreate] Unhandled error:", err);
    await safeRespond(interaction, "Something went wrong handling that. Please try again.");
  }
}
