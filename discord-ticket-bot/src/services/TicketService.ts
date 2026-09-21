import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";
import { getDb, ensureGuild } from "../database/db";
import { configService } from "./ConfigService";
import { applyPlaceholders } from "../utils/placeholders";
import { buildCustomId } from "../utils/customId";
import { CooldownError, ValidationError, NotFoundError, PermissionDeniedError } from "../utils/errors";
import type { TicketRow } from "../types";

const STAFF_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.EmbedLinks,
] as const;

const CREATOR_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.EmbedLinks,
] as const;

const BOT_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.EmbedLinks,
] as const;

export class TicketService {
  private countOpenTicketsForButton(guildId: string, userId: string, buttonId: number): number {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM tickets
         WHERE guild_id = ? AND user_id = ? AND button_id = ? AND status = 'open'`
      )
      .get(guildId, userId, buttonId) as { cnt: number };
    return row.cnt;
  }

  private checkCooldown(guildId: string, userId: string, buttonId: number, cooldownSeconds: number): void {
    if (cooldownSeconds <= 0) return;
    const db = getDb();
    const row = db
      .prepare(`SELECT last_created_at FROM cooldowns WHERE guild_id = ? AND user_id = ? AND button_id = ?`)
      .get(guildId, userId, buttonId) as { last_created_at: string } | undefined;
    if (!row) return;
    const last = new Date(row.last_created_at + "Z").getTime();
    const elapsedSec = (Date.now() - last) / 1000;
    if (elapsedSec < cooldownSeconds) {
      const remaining = Math.ceil(cooldownSeconds - elapsedSec);
      throw new CooldownError(`Please wait ${remaining}s before opening another ticket of this type.`);
    }
  }

  private recordCooldown(guildId: string, userId: string, buttonId: number): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO cooldowns (guild_id, user_id, button_id, last_created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id, button_id) DO UPDATE SET last_created_at = datetime('now')`
    ).run(guildId, userId, buttonId);
  }

  /**
   * Resolves the parent category for new tickets.
   * Uses the guild-level ticket_category_id (required).
   * Does not silently create top-level channels.
   */
  private resolveParentCategory(guild: Guild): string {
    const categoryId = configService.getTicketCategoryId(guild.id);
    if (!categoryId) {
      throw new ValidationError(
        "No ticket category is configured. An administrator must set one via `/ticket setup` → Ticket Category."
      );
    }

    const cat = guild.channels.cache.get(categoryId) ?? null;
    if (!cat) {
      throw new ValidationError(
        "The configured ticket category no longer exists. An administrator must reconfigure the ticket category."
      );
    }
    if (cat.type !== ChannelType.GuildCategory) {
      throw new ValidationError(
        "The configured ticket category is not a valid Category channel. Please reconfigure it."
      );
    }
    if (cat.guildId !== guild.id) {
      throw new ValidationError("The configured ticket category does not belong to this server.");
    }

    const me = guild.members.me;
    if (!me) {
      throw new ValidationError("Bot member not found in this server. Re-invite the bot and try again.");
    }
    if (!cat.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageChannels)) {
      throw new ValidationError(
        "I do not have permission to create channels in the configured ticket category. Grant me Manage Channels there."
      );
    }

    return categoryId;
  }

  private validateBotPerms(guild: Guild): void {
    const me = guild.members.me;
    if (!me) {
      throw new ValidationError("Bot member not found in this server. Re-invite the bot and try again.");
    }
    const needed = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.ManageChannels,
    ];
    for (const perm of needed) {
      if (!me.permissions.has(perm)) {
        throw new ValidationError(
          "I am missing required permissions (Manage Channels, View Channel, Send Messages, Read Message History, Manage Messages)."
        );
      }
    }
  }

  private buildOverwrites(
    guild: Guild,
    member: GuildMember,
    buttonStaffRoleIds: string[]
  ): { id: string; allow?: bigint[]; deny?: bigint[] }[] {
    const overwrites: { id: string; allow?: bigint[]; deny?: bigint[] }[] = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: member.id,
        allow: [...CREATOR_PERMS],
      },
      {
        id: guild.client.user!.id,
        allow: [...BOT_PERMS],
      },
    ];

    const globalStaff = configService.getGlobalStaffRoleIds(guild.id);
    const allStaffRoleIds = [...new Set([...globalStaff, ...buttonStaffRoleIds])];

    for (const roleId of allStaffRoleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        console.warn(`[TicketService] Skipping deleted/missing staff role ${roleId} in guild ${guild.id}`);
        continue;
      }
      overwrites.push({
        id: roleId,
        allow: [...STAFF_PERMS],
      });
    }

    return overwrites;
  }

  /** Builds the ticket info embed including visible claim status. */
  buildTicketEmbed(ticket: TicketRow, title: string, description: string): EmbedBuilder {
    const claimStatus = ticket.claimed_by
      ? `🟢 Claimed by <@${ticket.claimed_by}>`
      : "⚪ Unclaimed";

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(ticket.claimed_by ? 0x57f287 : 0x5865f2)
      .addFields({ name: "Claim Status", value: claimStatus, inline: false })
      .setFooter({ text: `Ticket #${ticket.id}` })
      .setTimestamp(new Date(ticket.created_at + "Z"));
  }

  /**
   * Creates a ticket channel under the guild-configured category.
   * Atomic: if DB insert fails after channel creation, the channel is deleted.
   */
  async createTicket(
    guild: Guild,
    member: GuildMember,
    buttonId: number
  ): Promise<{ channel: TextChannel; ticket: TicketRow }> {
    ensureGuild(guild.id);
    const button = configService.getButton(guild.id, buttonId);
    if (!button) throw new NotFoundError("This ticket type no longer exists.");

    if (button.max_tickets > 0) {
      const openCount = this.countOpenTicketsForButton(guild.id, member.id, buttonId);
      if (openCount >= button.max_tickets) {
        throw new ValidationError(
          `You already have ${openCount} open ticket(s) of this type (limit: ${button.max_tickets}). Please close an existing one first.`
        );
      }
    }
    this.checkCooldown(guild.id, member.id, buttonId, button.cooldown_seconds);
    this.validateBotPerms(guild);
    const parentCategoryId = this.resolveParentCategory(guild);

    const db = getDb();
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM tickets WHERE guild_id = ?`).get(guild.id) as {
      cnt: number;
    };
    const ticketNumber = countRow.cnt + 1;

    const channelName = applyPlaceholders(
      button.channel_name,
      { user: member.user, ticketType: button.name, ticketNumber },
      true
    );

    const overwrites = this.buildOverwrites(guild, member, button.staffRoleIds);

    let channel: TextChannel;
    try {
      channel = (await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategoryId,
        permissionOverwrites: overwrites,
        topic: `Ticket for ${member.user.tag ?? member.user.username} (${member.id}) — type: ${button.name}`,
      })) as TextChannel;
    } catch (err) {
      console.error("[TicketService] Channel creation failed:", err);
      throw new ValidationError(
        "Failed to create the ticket channel. Check that the bot has Manage Channels and that the category still exists."
      );
    }

    let ticket: TicketRow;
    try {
      const info = db
        .prepare(
          `INSERT INTO tickets (guild_id, channel_id, user_id, button_id, status)
           VALUES (?, ?, ?, ?, 'open')`
        )
        .run(guild.id, channel.id, member.id, buttonId);

      this.recordCooldown(guild.id, member.id, buttonId);

      ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(info.lastInsertRowid) as TicketRow;
    } catch (err) {
      console.error("[TicketService] Database insert failed after channel creation — deleting channel:", err);
      await channel.delete("Ticket database insert failed").catch(() => {});
      throw new ValidationError("Ticket creation failed due to a database error. Please try again.");
    }

    const openingMessage = applyPlaceholders(button.opening_message, {
      user: member.user,
      ticketType: button.name,
      ticketNumber,
    });

    const pingLine = button.pingRoleIds.length
      ? button.pingRoleIds.map((r) => `<@&${r}>`).join(" ")
      : "";

    const embed = this.buildTicketEmbed(ticket, `🎫 ${button.name}`, openingMessage);

    await channel.send({
      content: [pingLine, `${member}`].filter(Boolean).join(" "),
      embeds: [embed],
      components: [this.buildControlPanelRow(ticket, false)],
    });

    return { channel, ticket };
  }

  /**
   * Unclaimed → 🎫 Claim Ticket
   * Claimed   → 🔓 Unclaim Ticket
   */
  buildControlPanelRow(ticket: TicketRow, closed: boolean): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (!closed) {
      if (ticket.claimed_by) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId("ticket", "unclaim", ticket.id))
            .setLabel("Unclaim Ticket")
            .setEmoji("🔓")
            .setStyle(ButtonStyle.Secondary)
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId("ticket", "claim", ticket.id))
            .setLabel("Claim Ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
        );
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "adduser", ticket.id))
          .setLabel("Add User")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "removeuser", ticket.id))
          .setLabel("Remove User")
          .setEmoji("➖")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "close", ticket.id))
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "reopen", ticket.id))
          .setLabel("Reopen")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "transcript", ticket.id))
          .setLabel("Transcript")
          .setEmoji("📄")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(buildCustomId("ticket", "delete", ticket.id))
          .setLabel("Delete")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
      );
    }
    return row;
  }

  /**
   * Atomic claim: only succeeds if claimed_by is currently NULL.
   * Prevents race conditions where two staff click Claim at the same time.
   */
  claim(ticketId: number, staffId: string): TicketRow {
    const db = getDb();
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow | undefined;
    if (!ticket) throw new NotFoundError();

    // Atomic conditional update — first successful writer wins.
    const result = db
      .prepare(`UPDATE tickets SET claimed_by = ? WHERE id = ? AND claimed_by IS NULL`)
      .run(staffId, ticketId);

    if (result.changes === 0) {
      const current = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
      if (current.claimed_by) {
        throw new ValidationError(
          `❌ This ticket is already claimed by <@${current.claimed_by}>.`
        );
      }
      throw new ValidationError("Could not claim this ticket. Please try again.");
    }

    return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
  }

  /**
   * Unclaim rules:
   * - Current claimant may always unclaim.
   * - Guild admins (PermissionService.isGuildAdmin) may force-unclaim (override).
   * - Other staff cannot unclaim someone else's ticket.
   *
   * Returns { ticket, wasOverride }.
   */
  unclaim(
    ticketId: number,
    actorId: string,
    isAdminOverride: boolean
  ): { ticket: TicketRow; wasOverride: boolean; previousClaimant: string } {
    const db = getDb();
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow | undefined;
    if (!ticket) throw new NotFoundError();
    if (!ticket.claimed_by) {
      throw new ValidationError("This ticket is not currently claimed.");
    }

    const isClaimant = ticket.claimed_by === actorId;
    if (!isClaimant && !isAdminOverride) {
      throw new PermissionDeniedError(
        `❌ This ticket is claimed by <@${ticket.claimed_by}>.\nOnly the current claimant can unclaim it.`
      );
    }

    const previousClaimant = ticket.claimed_by;
    // Atomic clear only if still claimed by the same person (or admin override clears any).
    let result;
    if (isAdminOverride && !isClaimant) {
      result = db
        .prepare(`UPDATE tickets SET claimed_by = NULL WHERE id = ? AND claimed_by = ?`)
        .run(ticketId, previousClaimant);
    } else {
      result = db
        .prepare(`UPDATE tickets SET claimed_by = NULL WHERE id = ? AND claimed_by = ?`)
        .run(ticketId, actorId);
    }

    if (result.changes === 0) {
      const current = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
      if (!current.claimed_by) {
        throw new ValidationError("This ticket is not currently claimed.");
      }
      throw new PermissionDeniedError(
        `❌ This ticket is claimed by <@${current.claimed_by}>.\nOnly the current claimant can unclaim it.`
      );
    }

    const updated = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
    return {
      ticket: updated,
      wasOverride: isAdminOverride && !isClaimant,
      previousClaimant,
    };
  }

  /**
   * Updates the ticket info message's embed + control buttons in place.
   * Does not post a new message.
   */
  async refreshTicketMessage(message: Message, ticket: TicketRow, closed = false): Promise<void> {
    const row = this.buildControlPanelRow(ticket, closed);
    const existingEmbed = message.embeds[0];
    const title = existingEmbed?.title ?? `🎫 Ticket #${ticket.id}`;
    // Preserve original description (opening message) if present; strip old claim field content.
    let description = existingEmbed?.description ?? "";
    // Remove any previously appended claim lines from description (legacy).
    description = description.replace(/\n\n(?:⚪ Unclaimed|🟢 Claimed by .+)$/s, "").trim();

    const embed = this.buildTicketEmbed(ticket, title, description || " ");
    await message.edit({ embeds: [embed], components: [row] });
  }

  addMember(ticketId: number, userId: string): void {
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO ticket_members (ticket_id, user_id) VALUES (?, ?)`).run(ticketId, userId);
  }

  removeMember(ticketId: number, userId: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM ticket_members WHERE ticket_id = ? AND user_id = ?`).run(ticketId, userId);
  }

  close(ticketId: number, staffId: string): TicketRow {
    const db = getDb();
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow | undefined;
    if (!ticket) throw new NotFoundError();
    if (ticket.status === "closed") throw new ValidationError("This ticket is already closed.");
    db.prepare(
      `UPDATE tickets SET status = 'closed', closed_at = datetime('now'), closed_by = ? WHERE id = ?`
    ).run(staffId, ticketId);
    return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
  }

  reopen(ticketId: number): TicketRow {
    const db = getDb();
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow | undefined;
    if (!ticket) throw new NotFoundError();
    if (ticket.status !== "closed") throw new ValidationError("Only closed tickets can be reopened.");
    db.prepare(`UPDATE tickets SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ?`).run(ticketId);
    return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
  }

  markDeleted(ticketId: number): void {
    const db = getDb();
    db.prepare(`UPDATE tickets SET status = 'deleted', deleted_at = datetime('now') WHERE id = ?`).run(ticketId);
  }
}

export const ticketService = new TicketService();
