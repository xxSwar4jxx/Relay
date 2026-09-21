import type { ModalSubmitInteraction, GuildMember } from "discord.js";
import { permissionService } from "../../services/PermissionService";
import { configService } from "../../services/ConfigService";
import { loggingService } from "../../services/LoggingService";
import { parseCustomId } from "../../utils/customId";
import { UserFacingError, ValidationError, NotFoundError } from "../../utils/errors";
import { buildPanelMenu, buildButtonsMenu, buildButtonDetailMenu } from "../setupMenus";

/**
 * All our modals are opened from a button (isFromMessage() true), so we can
 * update the original message in place. Falls back to a fresh ephemeral
 * reply if that's ever not the case.
 */
async function respond(interaction: ModalSubmitInteraction, payload: { embeds: any[]; components: any[] }): Promise<void> {
  if (interaction.isFromMessage()) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

function parseLimits(raw: string | null | undefined): { max: number; cooldown: number } {
  if (!raw || !raw.trim()) return { max: 1, cooldown: 0 };
  const [maxStr, cooldownStr] = raw.split(",").map((s) => s.trim());
  const max = Number(maxStr);
  const cooldown = Number(cooldownStr ?? 0);
  if (Number.isNaN(max) || max < 0) throw new ValidationError('Max tickets must be a number ≥ 0 (0 = unlimited). Format: "1,600"');
  if (Number.isNaN(cooldown) || cooldown < 0) throw new ValidationError('Cooldown must be a number of seconds ≥ 0. Format: "1,600"');
  return { max, cooldown };
}

export async function routeModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.namespace !== "config") throw new UserFacingError("This form is no longer valid.");
  if (!interaction.inGuild()) throw new UserFacingError("This can only be used in a server.");

  const member = interaction.member as GuildMember;
  permissionService.requireAdmin(member);
  const guildId = interaction.guildId!;

  switch (parsed.action) {
    case "panel_text_submit": {
      const title = interaction.fields.getTextInputValue("title");
      const description = interaction.fields.getTextInputValue("description");
      const color = interaction.fields.getTextInputValue("color") || "#5865F2";
      if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) {
        throw new ValidationError("Color must be a 6-digit hex code, e.g. #5865F2.");
      }
      configService.updatePanelConfig(guildId, {
        title,
        description,
        color: color.startsWith("#") ? color : `#${color}`,
      });
      await loggingService.log(interaction.client, guildId, "Panel Updated", {
        staff: loggingService.formatUser(interaction.user),
        action: "Edited panel title/description/color",
      });
      const { embeds, components } = buildPanelMenu(guildId);
      await respond(interaction, { embeds, components });
      return;
    }

    case "panel_images_submit": {
      const image = interaction.fields.getTextInputValue("image") || null;
      const thumbnail = interaction.fields.getTextInputValue("thumbnail") || null;
      const footer_text = interaction.fields.getTextInputValue("footer_text") || null;
      const footer_icon = interaction.fields.getTextInputValue("footer_icon") || null;
      configService.updatePanelConfig(guildId, { image, thumbnail, footer_text, footer_icon });
      await loggingService.log(interaction.client, guildId, "Panel Updated", {
        staff: loggingService.formatUser(interaction.user),
        action: "Edited panel images/footer",
      });
      const { embeds, components } = buildPanelMenu(guildId);
      await respond(interaction, { embeds, components });
      return;
    }

    case "button_add_submit": {
      const name = interaction.fields.getTextInputValue("name");
      const emoji = interaction.fields.getTextInputValue("emoji") || null;
      const channel_name = interaction.fields.getTextInputValue("channel_name") || "ticket-{username}";
      const opening_message =
        interaction.fields.getTextInputValue("opening_message") ||
        "Thanks for reaching out! Support will be with you shortly.";
      const { max, cooldown } = parseLimits(interaction.fields.getTextInputValue("limits"));

      const created = configService.createButton(guildId, {
        name,
        emoji,
        channel_name,
        opening_message,
        max_tickets: max,
        cooldown_seconds: cooldown,
      });

      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: `Created ticket button "${created.name}"`,
      });

      const { embeds, components } = buildButtonsMenu(guildId);
      await respond(interaction, { embeds, components });
      return;
    }

    case "button_edit_submit": {
      const buttonId = Number(parsed.id);
      if (!parsed.id || Number.isNaN(buttonId)) throw new NotFoundError("That ticket button no longer exists.");

      const name = interaction.fields.getTextInputValue("name");
      const emoji = interaction.fields.getTextInputValue("emoji") || null;
      const channel_name = interaction.fields.getTextInputValue("channel_name") || "ticket-{username}";
      const opening_message = interaction.fields.getTextInputValue("opening_message");
      const { max, cooldown } = parseLimits(interaction.fields.getTextInputValue("limits"));

      const updated = configService.updateButton(guildId, buttonId, {
        name,
        emoji,
        channel_name,
        opening_message,
        max_tickets: max,
        cooldown_seconds: cooldown,
      });

      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: `Edited ticket button "${updated.name}"`,
      });

      const { embeds, components } = buildButtonDetailMenu(updated);
      await respond(interaction, { embeds, components });
      return;
    }

    default:
      throw new UserFacingError("Unknown form.");
  }
}
