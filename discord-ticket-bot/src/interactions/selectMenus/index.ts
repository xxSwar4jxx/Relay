import {
  ChannelType,
  type AnySelectMenuInteraction,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { permissionService } from "../../services/PermissionService";
import { configService } from "../../services/ConfigService";
import { ticketService } from "../../services/TicketService";
import { loggingService } from "../../services/LoggingService";
import { successEmbed, errorEmbed } from "../../utils/embeds";
import { parseCustomId } from "../../utils/customId";
import { UserFacingError, NotFoundError, ValidationError } from "../../utils/errors";
import {
  buildPanelMenu,
  buildButtonDetailMenu,
  buildStaffMenu,
  buildPermissionsMenu,
  buildLogsMenu,
  buildTranscriptsMenu,
  buildCategoryMenu,
} from "../setupMenus";

function requireButton(guildId: string, idStr?: string) {
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) throw new NotFoundError("That ticket button no longer exists.");
  const btn = configService.getButton(guildId, id);
  if (!btn) throw new NotFoundError("That ticket button no longer exists.");
  return btn;
}

export async function routeSelectMenu(interaction: AnySelectMenuInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) throw new UserFacingError("This menu is no longer valid.");
  if (!interaction.inGuild()) throw new UserFacingError("This can only be used in a server.");

  const guildId = interaction.guildId!;
  const member = interaction.member as GuildMember;

  // Ticket creation via select menu (when >25 ticket types).
  if (parsed.namespace === "ticket" && parsed.action === "create_select") {
    if (!interaction.isStringSelectMenu()) throw new UserFacingError("Unexpected menu type.");
    const buttonId = Number(interaction.values[0]);
    if (!interaction.values[0] || Number.isNaN(buttonId)) {
      throw new NotFoundError("This ticket type no longer exists.");
    }
    await interaction.deferReply({ ephemeral: true });
    const { channel } = await ticketService.createTicket(interaction.guild!, member, buttonId);
    await loggingService.log(interaction.client, guildId, "Ticket Created", {
      ticket: `<#${channel.id}>`,
      user: loggingService.formatUser(interaction.user),
    });
    await interaction.editReply({ embeds: [successEmbed(`Your ticket has been created: <#${channel.id}>`)] });
    return;
  }

  // Ticket member management (adduser/removeuser) is staff-gated per ticket.
  if (parsed.namespace === "ticket") {
    const ticketId = Number(parsed.id);
    if (!parsed.id || Number.isNaN(ticketId)) throw new NotFoundError();
    const ticket = permissionService.loadTicketOrThrow(guildId, ticketId);
    permissionService.requireStaffForTicket(member, ticket);

    if (!interaction.isUserSelectMenu()) throw new UserFacingError("Unexpected menu type.");
    const selectedUser = interaction.users.first();
    if (!selectedUser) throw new ValidationError("No user was selected.");

    const channel = interaction.channel as TextChannel;

    if (parsed.action === "adduser_select") {
      ticketService.addMember(ticketId, selectedUser.id);
      await channel.permissionOverwrites
        .edit(selectedUser.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        })
        .catch(() => {});
      await loggingService.log(interaction.client, guildId, "User Added", {
        ticket: `<#${ticket.channel_id}>`,
        user: loggingService.formatUser(selectedUser),
        staff: loggingService.formatUser(interaction.user),
      });
      await interaction.update({ content: `Added ${selectedUser} to the ticket.`, components: [] });
      return;
    }
    if (parsed.action === "removeuser_select") {
      // Server-side enforcement: never remove the ticket creator.
      if (selectedUser.id === ticket.user_id) {
        await interaction.update({
          content: "❌ You cannot remove the ticket creator from their own ticket.",
          components: [],
        });
        return;
      }
      ticketService.removeMember(ticketId, selectedUser.id);
      await channel.permissionOverwrites.delete(selectedUser.id).catch(() => {});
      await loggingService.log(interaction.client, guildId, "User Removed", {
        ticket: `<#${ticket.channel_id}>`,
        user: loggingService.formatUser(selectedUser),
        staff: loggingService.formatUser(interaction.user),
      });
      await interaction.update({ content: `Removed ${selectedUser} from the ticket.`, components: [] });
      return;
    }
    throw new UserFacingError("Unknown ticket menu action.");
  }

  if (parsed.namespace !== "config") throw new UserFacingError("Unrecognized interaction.");

  permissionService.requireAdmin(member);

  switch (parsed.action) {
    case "button_select": {
      if (!interaction.isStringSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const btn = requireButton(guildId, interaction.values[0]);
      const { embeds, components } = buildButtonDetailMenu(btn);
      await interaction.update({ embeds, components });
      return;
    }

    case "panel_channel_select": {
      if (!interaction.isChannelSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const channelId = interaction.values[0];
      configService.updatePanelConfig(guildId, { channel_id: channelId, message_id: null });
      const { embeds, components } = buildPanelMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    case "ticket_category_select": {
      if (!interaction.isChannelSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const categoryId = interaction.values[0];
      // Verify it is a category in this guild (ChannelSelect with GuildCategory type already filters).
      const ch = interaction.guild!.channels.cache.get(categoryId);
      if (!ch || ch.type !== ChannelType.GuildCategory) {
        // ChannelType.GuildCategory === 4
        await interaction.update({
          embeds: [errorEmbed("Please select a valid Category channel.")],
          components: buildCategoryMenu(guildId).components,
        });
        return;
      }
      configService.setTicketCategoryId(guildId, categoryId);
      await loggingService.log(interaction.client, guildId, "Configuration Changed", {
        staff: loggingService.formatUser(interaction.user),
        action: `Set ticket category to <#${categoryId}>`,
      });
      const { embeds, components } = buildCategoryMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    case "button_category_select": {
      if (!interaction.isChannelSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const btn = requireButton(guildId, parsed.id);
      const categoryId = interaction.values[0] ?? null;
      const updated = configService.updateButton(guildId, btn.id, { category_id: categoryId });
      const { embeds, components } = buildButtonDetailMenu(updated);
      await interaction.update({ embeds, components });
      return;
    }

    case "button_staff_select": {
      if (!interaction.isRoleSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const btn = requireButton(guildId, parsed.id);
      // Filter out roles that no longer exist (defensive).
      const valid = interaction.values.filter((rid) => interaction.guild!.roles.cache.has(rid));
      configService.setButtonStaffRoles(guildId, btn.id, valid);
      const refreshed = configService.getButton(guildId, btn.id)!;
      const { embeds, components } = buildButtonDetailMenu(refreshed);
      await interaction.update({ embeds, components });
      return;
    }

    case "button_ping_select": {
      if (!interaction.isRoleSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const btn = requireButton(guildId, parsed.id);
      const valid = interaction.values.filter((rid) => interaction.guild!.roles.cache.has(rid));
      configService.setButtonPingRoles(guildId, btn.id, valid);
      const refreshed = configService.getButton(guildId, btn.id)!;
      const { embeds, components } = buildButtonDetailMenu(refreshed);
      await interaction.update({ embeds, components });
      return;
    }

    case "staff_select": {
      if (!interaction.isRoleSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const valid = interaction.values.filter((rid) => interaction.guild!.roles.cache.has(rid));
      configService.setGlobalStaffRoleIds(guildId, valid);
      const { embeds, components } = buildStaffMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    case "admin_select": {
      if (!interaction.isRoleSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      const valid = interaction.values.filter((rid) => interaction.guild!.roles.cache.has(rid));
      configService.setAdminRoleIds(guildId, valid);
      const { embeds, components } = buildPermissionsMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    case "log_channel_select": {
      if (!interaction.isChannelSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      configService.updateGuildConfig(guildId, { log_channel_id: interaction.values[0] });
      const { embeds, components } = buildLogsMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    case "transcript_channel_select": {
      if (!interaction.isChannelSelectMenu()) throw new UserFacingError("Unexpected menu type.");
      configService.updateGuildConfig(guildId, { transcript_channel_id: interaction.values[0] });
      const { embeds, components } = buildTranscriptsMenu(guildId);
      await interaction.update({ embeds, components });
      return;
    }

    default:
      throw new UserFacingError("Unknown menu action.");
  }
}
