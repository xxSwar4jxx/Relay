import { GuildMember, PermissionsBitField } from "discord.js";
import { configService } from "./ConfigService";
import { getDb } from "../database/db";
import type { TicketRow } from "../types";
import { PermissionDeniedError, NotFoundError } from "../utils/errors";

/**
 * Centralized permission/security layer. Every privileged action (configuration
 * changes, ticket claim/close/add/remove/delete, viewing transcripts) MUST route
 * through this service. Nothing here trusts custom IDs, button state, or
 * client-supplied values — every check re-reads from Discord's real permission
 * system and/or the database.
 */
export class PermissionService {
  /** True if the member has Administrator, Manage Guild, or a configured admin role. */
  isGuildAdmin(member: GuildMember): boolean {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    const adminRoleIds = configService.getAdminRoleIds(member.guild.id);
    return adminRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  /** True if the member is in the guild's global staff roles OR is a guild admin. */
  isGlobalStaff(member: GuildMember): boolean {
    if (this.isGuildAdmin(member)) return true;
    const staffRoleIds = configService.getGlobalStaffRoleIds(member.guild.id);
    return staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  /** True if the member is staff for a specific ticket button (or global staff/admin). */
  isStaffForButton(member: GuildMember, buttonId: number | null): boolean {
    if (this.isGlobalStaff(member)) return true;
    if (buttonId === null) return false;
    const button = configService.getButton(member.guild.id, buttonId);
    if (!button) return false;
    return button.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  /** Throws PermissionDeniedError unless the member is a guild admin. */
  requireAdmin(member: GuildMember): void {
    if (!this.isGuildAdmin(member)) {
      throw new PermissionDeniedError("Only server administrators can do that.");
    }
  }

  /** Throws unless the member has staff access to the ticket's originating button. */
  requireStaffForTicket(member: GuildMember, ticket: TicketRow): void {
    if (!this.isStaffForButton(member, ticket.button_id)) {
      throw new PermissionDeniedError("Only authorized staff can manage this ticket.");
    }
  }

  /**
   * True if the user may VIEW a ticket: the ticket creator, an added member,
   * authorized staff for that ticket, or a guild admin.
   */
  canViewTicket(member: GuildMember, ticket: TicketRow): boolean {
    if (ticket.user_id === member.id) return true;
    if (this.isStaffForButton(member, ticket.button_id)) return true;
    const db = getDb();
    const row = db
      .prepare(`SELECT 1 FROM ticket_members WHERE ticket_id = ? AND user_id = ?`)
      .get(ticket.id, member.id);
    return Boolean(row);
  }

  /**
   * Loads a ticket by its database ID and asserts it belongs to the given guild.
   * This is the standard guard against cross-guild ID spoofing via custom_id.
   */
  loadTicketOrThrow(guildId: string, ticketId: number): TicketRow {
    const db = getDb();
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow | undefined;
    if (!ticket) {
      throw new NotFoundError("This ticket no longer exists.");
    }
    if (ticket.guild_id !== guildId) {
      // Cross-guild access attempt — never leak whether the ID exists elsewhere.
      throw new NotFoundError("This ticket no longer exists.");
    }
    return ticket;
  }

  /** Loads a ticket by its Discord channel ID, scoped to the guild. */
  loadTicketByChannelOrThrow(guildId: string, channelId: string): TicketRow {
    const db = getDb();
    const ticket = db
      .prepare(`SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ?`)
      .get(guildId, channelId) as TicketRow | undefined;
    if (!ticket) {
      throw new NotFoundError("This channel is not a tracked ticket.");
    }
    return ticket;
  }
}

export const permissionService = new PermissionService();
