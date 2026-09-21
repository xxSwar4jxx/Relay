import {
  ActionRowBuilder,
  ButtonInteraction,
  ChannelType,
  UserSelectMenuBuilder,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { permissionService } from "../../services/PermissionService";
import { configService } from "../../services/ConfigService";
import { panelService } from "../../services/PanelService";
import { ticketService } from "../../services/TicketService";
import { transcriptService } from "../../services/TranscriptService";
import { loggingService } from "../../services/LoggingService";
import { errorEmbed, successEmbed } from "../../utils/embeds";
import { buildCustomId, parseCustomId } from "../../utils/customId";
import { UserFacingError, NotFoundError } from "../../utils/errors";
import type { TicketRow } from "../../types";
import {
  buildMainMenu,
  buildPanelMenu,
  buildPanelTextModal,
  buildPanelImagesModal,
  buildButtonsMenu,
  buildButtonDetailMenu,
  buildButtonAddModal,
  buildButtonEditModal,
  buildStaffMenu,
  buildLogsMenu,
  buildTranscriptsMenu,
  buildPermissionsMenu,
  buildResetConfirm,
  buildButtonStyleMenu,
  buildReorderMenu,
  buildCategoryMenu,
} from "../setupMenus";

/** Handles button interactions in the "config:*" namespace — the setup UI. */
async function handleConfigButton(interaction: ButtonInteraction, action: string, id?: string, extra?: string): Promise<void> {
  const member = interaction.member as GuildMember;
  permissionService.requireAdmin(member);
  const guildId = interaction.guildId!;

  switch (action) {
    case "back_main": {
      const { embeds, components } = buildMainMenu();
      await interaction.update({ embeds, components });
      return;
    }
    case "menu": {
      const target = id;
      if (target === "panel") return void (await interaction.update(buildPanelMenu(guildId)));
      if (target === "category") return void (await interaction.update(buildCategoryMenu(guildId)));
      if (target === "buttons") return void (await interaction.update(buildButtonsMenu(guildId)));
      if (target === "staff") return void (await interaction.update(buildStaffMenu(guildId)));
      if (target === "logs") return void (await interaction.update(buildLogsMenu(guildId)));
      if (target === "transcripts") return void (await interaction.update(buildTranscriptsMenu(guildId)));
      if (target === "permissions") return void (await interaction.update(buildPermissionsMenu(guildId)));
      if (target === "reset") return void (await interaction.update(buildResetConfirm()));
      throw new UserFacingError("Unknown menu.");
    }
    case "panel_text_modal": {
      await interaction.showModal(buildPanelTextModal(guildId));
      return;
    }
    case "panel_images_modal": {
      await interaction.showModal(buildPanelImagesModal(guildId));
      return;
    }
    case "panel_preview": {
      // Preview of the public panel includes OpenForge branding.
      const preview = await panelService.buildPreview(guildId, true);
      await interaction.reply({ ...preview, ephemeral: true });
      return;
    }
    case "panel_send": {
      const panel = configService.getPanelConfig(guildId);
      const channelId = panel.channel_id ?? interaction.channelId;
      const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [errorEmbed("Select a destination channel first using the channel picker in the Panel menu.")],
          ephemeral: true,
        });
        return;
      }
      const sent = await panelService.deploy(channel as TextChannel, guildId);
      await loggingService.log(interaction.client, guildId, "Panel Updated", {
        staff: loggingService.formatUser(interaction.user),
        action: `Panel deployed to <#${sent.channelId}>`,
      });
      await interaction.reply({ embeds: [successEmbed(`Panel sent/updated in <#${sent.channelId}>.`)], ephemeral: true });
      return;
    }
    case "button_add_modal": {
      await interaction.showModal(buildButtonAddModal());
      return;
    }
    case "button_edit_modal": {
      const btn = requireButton(guildId, id);
      await interaction.showModal(buildButtonEditModal(btn));
      return;
    }
    case "button_style": {
      const btn = requireButton(guildId, id);
      await interaction.update(buildButtonStyleMenu(btn));
      return;
    }
    case "button_style_set": {
      // id = buttonId, extra = style name (Primary|Secondary|Success|Danger)
      const btn = requireButton(guildId, id);
      const style = (extra ?? "") as "Primary" | "Secondary" | "Success" | "Danger";
      const valid = ["Primary", "Secondary", "Success", "Danger"];
      if (!valid.includes(style)) throw new UserFacingError("Invalid button style.");
      const updated = configService.updateButton(guildId, btn.id, { style });
      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: `Set button "${updated.name}" style to ${style}`,
      });
      await interaction.update(buildButtonDetailMenu(updated));
      return;
    }
    case "button_delete": {
      const btn = requireButton(guildId, id);
      configService.deleteButton(guildId, btn.id);
      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: `Deleted ticket button "${btn.name}"`,
      });
      const { embeds, components } = buildButtonsMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }
    case "buttons_reorder": {
      await interaction.update(buildReorderMenu(guildId));
      return;
    }
    case "reorder_up":
    case "reorder_down": {
      const buttonId = Number(id);
      if (!id || Number.isNaN(buttonId)) throw new NotFoundError("That ticket button no longer exists.");
      const buttons = configService.getButtons(guildId);
      const idx = buttons.findIndex((b) => b.id === buttonId);
      if (idx < 0) throw new NotFoundError("That ticket button no longer exists.");
      const swapWith = action === "reorder_up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= buttons.length) {
        await interaction.update(buildReorderMenu(guildId));
        return;
      }
      const ordered = buttons.map((b) => b.id);
      [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
      configService.reorderButtons(guildId, ordered);
      await interaction.update(buildReorderMenu(guildId));
      return;
    }
    case "reorder_label": {
      // Disabled label button — should never fire; ignore safely.
      return;
    }
    case "transcript_toggle": {
      const settings = configService.getGuildConfig(guildId);
      configService.updateGuildConfig(guildId, { transcripts_enabled: settings.transcripts_enabled ? 0 : 1 });
      await interaction.update(buildTranscriptsMenu(guildId));
      return;
    }
    case "transcript_attachments_toggle": {
      const settings = configService.getGuildConfig(guildId);
      configService.updateGuildConfig(guildId, {
        transcript_include_attachments: settings.transcript_include_attachments ? 0 : 1,
      });
      await interaction.update(buildTranscriptsMenu(guildId));
      return;
    }
    case "reset_confirm": {
      configService.resetGuild(guildId);
      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: "Full ticket configuration reset",
      });
      const main = buildMainMenu();
      await interaction.update({ embeds: [successEmbed("Ticket configuration has been reset."), ...main.embeds], components: main.components });
      return;
    }
    default:
      throw new UserFacingError("Unknown action.");
  }
}

function requireButton(guildId: string, idStr?: string) {
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) throw new NotFoundError("That ticket button no longer exists.");
  const btn = configService.getButton(guildId, id);
  if (!btn) throw new NotFoundError("That ticket button no longer exists.");
  return btn;
}

/** Handles button interactions in the "ticket:*" namespace — live ticket controls. */
async function handleTicketButton(interaction: ButtonInteraction, action: string, idStr?: string): Promise<void> {
  const guildId = interaction.guildId!;
  const member = interaction.member as GuildMember;

  if (action === "create") {
    const buttonId = Number(idStr);
    if (!idStr || Number.isNaN(buttonId)) throw new NotFoundError("This ticket type no longer exists.");
    await interaction.deferReply({ ephemeral: true });
    const { channel } = await ticketService.createTicket(interaction.guild!, member, buttonId);
    await loggingService.log(interaction.client, guildId, "Ticket Created", {
      ticket: `<#${channel.id}>`,
      user: loggingService.formatUser(interaction.user),
    });
    await interaction.editReply({ embeds: [successEmbed(`Your ticket has been created: <#${channel.id}>`)] });
    return;
  }

  const ticketId = Number(idStr);
  if (!idStr || Number.isNaN(ticketId)) throw new NotFoundError();
  const ticket = permissionService.loadTicketOrThrow(guildId, ticketId);

  switch (action) {
    case "claim": {
      permissionService.requireStaffForTicket(member, ticket);
      const updated = ticketService.claim(ticketId, member.id);
      await refreshTicketPanel(interaction, updated, false);
      await loggingService.log(interaction.client, guildId, "Ticket Claimed", {
        ticket: `<#${ticket.channel_id}>`,
        staff: loggingService.formatUser(interaction.user),
        action: `Claimed by ${loggingService.formatUser(interaction.user)}`,
      });
      return;
    }
    case "unclaim": {
      permissionService.requireStaffForTicket(member, ticket);
      const isAdmin = permissionService.isGuildAdmin(member);
      const { ticket: updated, wasOverride, previousClaimant } = ticketService.unclaim(
        ticketId,
        member.id,
        isAdmin
      );
      await refreshTicketPanel(interaction, updated, false);
      if (wasOverride) {
        await loggingService.log(interaction.client, guildId, "Ticket Unclaimed", {
          ticket: `<#${ticket.channel_id}>`,
          staff: loggingService.formatUser(interaction.user),
          action: `Staff override — forcibly unclaimed from <@${previousClaimant}>`,
          extra: `Previous claimant: <@${previousClaimant}>`,
        });
      } else {
        await loggingService.log(interaction.client, guildId, "Ticket Unclaimed", {
          ticket: `<#${ticket.channel_id}>`,
          staff: loggingService.formatUser(interaction.user),
          action: `Unclaimed by ${loggingService.formatUser(interaction.user)}`,
        });
      }
      return;
    }
    case "adduser": {
      permissionService.requireStaffForTicket(member, ticket);
      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(buildCustomId("ticket", "adduser_select", ticketId))
          .setPlaceholder("Select a user to add")
          .setMinValues(1)
          .setMaxValues(1)
      );
      await interaction.reply({ content: "Select a user to add to this ticket:", components: [row], ephemeral: true });
      return;
    }
    case "removeuser": {
      permissionService.requireStaffForTicket(member, ticket);
      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(buildCustomId("ticket", "removeuser_select", ticketId))
          .setPlaceholder("Select a user to remove")
          .setMinValues(1)
          .setMaxValues(1)
      );
      await interaction.reply({ content: "Select a user to remove from this ticket:", components: [row], ephemeral: true });
      return;
    }
    case "close": {
      permissionService.requireStaffForTicket(member, ticket);
      await interaction.deferUpdate();
      const updated = ticketService.close(ticketId, member.id);
      const settings = configService.getGuildConfig(guildId);
      if (settings.close_removes_creator_send) {
        const channel = interaction.channel as TextChannel;
        await channel.permissionOverwrites.edit(updated.user_id, { SendMessages: false }).catch(() => {});
      }
      await refreshControlPanel(interaction, updated, true);
      await loggingService.log(interaction.client, guildId, "Ticket Closed", {
        ticket: `<#${ticket.channel_id}>`,
        staff: loggingService.formatUser(interaction.user),
      });
      return;
    }
    case "reopen": {
      permissionService.requireStaffForTicket(member, ticket);
      await interaction.deferUpdate();
      const updated = ticketService.reopen(ticketId);
      const channel = interaction.channel as TextChannel;
      await channel.permissionOverwrites.edit(updated.user_id, { SendMessages: true }).catch(() => {});
      await refreshControlPanel(interaction, updated, false);
      await loggingService.log(interaction.client, guildId, "Ticket Reopened", {
        ticket: `<#${ticket.channel_id}>`,
        staff: loggingService.formatUser(interaction.user),
      });
      return;
    }
    case "transcript": {
      permissionService.requireStaffForTicket(member, ticket);
      await interaction.deferReply({ ephemeral: true });
      const settings = configService.getGuildConfig(guildId);
      const channel = interaction.channel as TextChannel;
      const attachment = await transcriptService.generate(
        channel,
        ticket,
        Boolean(settings.transcript_include_attachments)
      );
      const delivered = await transcriptService.deliver(interaction.client, guildId, attachment, ticket);
      if (delivered) {
        await interaction.editReply({
          embeds: [successEmbed("Transcript generated and delivered to the configured transcript channel.")],
        });
      } else {
        await interaction.editReply({
          content: "Transcript (no transcript channel configured, sending here):",
          files: [attachment],
        });
      }
      return;
    }
    case "delete": {
      permissionService.requireStaffForTicket(member, ticket);
      await interaction.reply({ embeds: [successEmbed("Deleting this ticket channel in 3 seconds...")], ephemeral: true });
      ticketService.markDeleted(ticketId);
      await loggingService.log(interaction.client, guildId, "Ticket Deleted", {
        ticket: `#${ticket.id}`,
        staff: loggingService.formatUser(interaction.user),
      });
      setTimeout(() => {
        (interaction.channel as TextChannel)?.delete().catch(() => {});
      }, 3000);
      return;
    }
    default:
      throw new UserFacingError("Unknown ticket action.");
  }
}

/**
 * Updates the ticket message embed (claim status) + control buttons in place.
 * Prefers interaction.update so the click is acknowledged immediately.
 */
async function refreshTicketPanel(
  interaction: ButtonInteraction,
  ticket: TicketRow,
  closed = false
) {
  const row = ticketService.buildControlPanelRow(ticket, closed);
  const existingEmbed = interaction.message.embeds[0];
  const title = existingEmbed?.title ?? `🎫 Ticket #${ticket.id}`;
  let description = existingEmbed?.description ?? "";
  description = description.replace(/\n\n(?:⚪ Unclaimed|🟢 Claimed by .+)$/s, "").trim();

  const embed = ticketService.buildTicketEmbed(ticket, title, description || " ");

  if (interaction.deferred || interaction.replied) {
    await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
  } else {
    await interaction.update({ embeds: [embed], components: [row] });
  }
}

// Back-compat alias used by close/reopen paths
async function refreshControlPanel(
  interaction: ButtonInteraction,
  ticket: TicketRow,
  closed = false
) {
  await refreshTicketPanel(interaction, ticket, closed);
}


export async function routeButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) throw new UserFacingError("This button is no longer valid.");
  if (!interaction.inGuild()) throw new UserFacingError("This can only be used in a server.");

  if (parsed.namespace === "config") {
    await handleConfigButton(interaction, parsed.action, parsed.id, parsed.extra);
    return;
  }
  if (parsed.namespace === "ticket") {
    await handleTicketButton(interaction, parsed.action, parsed.id);
    return;
  }
  throw new UserFacingError("Unrecognized interaction.");
}
