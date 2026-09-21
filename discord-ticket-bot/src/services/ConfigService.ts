import { getDb, ensureGuild } from "../database/db";
import type {
  PanelRow,
  TicketButtonRow,
  ButtonStyleName,
  SettingsRow,
} from "../types";
import { ValidationError } from "../utils/errors";

export interface ButtonWithRoles extends TicketButtonRow {
  staffRoleIds: string[];
  pingRoleIds: string[];
}

export interface UpdatePanelInput {
  title?: string;
  description?: string;
  color?: string;
  image?: string | null;
  thumbnail?: string | null;
  footer_text?: string | null;
  footer_icon?: string | null;
  channel_id?: string | null;
  message_id?: string | null;
}

export interface CreateButtonInput {
  name: string;
  emoji?: string | null;
  style?: ButtonStyleName;
  category_id?: string | null;
  channel_name?: string;
  opening_message?: string;
  max_tickets?: number;
  cooldown_seconds?: number;
}

export type UpdateButtonInput = Partial<CreateButtonInput>;

/**
 * Single source of truth for all guild configuration reads/writes.
 * Command and interaction handlers should never issue raw SQL themselves.
 */
export class ConfigService {
  // ---------- Guild ----------

  getGuildConfig(guildId: string): SettingsRow {
    ensureGuild(guildId);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM settings WHERE guild_id = ?`).get(guildId) as SettingsRow;
    return row;
  }

  updateGuildConfig(guildId: string, patch: Partial<Omit<SettingsRow, "guild_id" | "updated_at">>): SettingsRow {
    ensureGuild(guildId);
    const db = getDb();
    const current = this.getGuildConfig(guildId);
    const merged: SettingsRow = { ...current, ...patch };
    db.prepare(
      `UPDATE settings SET
         log_channel_id = ?,
         transcript_channel_id = ?,
         transcripts_enabled = ?,
         transcript_include_attachments = ?,
         admin_role_ids = ?,
         staff_role_ids = ?,
         close_removes_creator_send = ?,
         ticket_category_id = ?,
         updated_at = datetime('now')
       WHERE guild_id = ?`
    ).run(
      merged.log_channel_id,
      merged.transcript_channel_id,
      merged.transcripts_enabled,
      merged.transcript_include_attachments,
      merged.admin_role_ids,
      merged.staff_role_ids,
      merged.close_removes_creator_send,
      merged.ticket_category_id ?? null,
      guildId
    );
    return this.getGuildConfig(guildId);
  }

  getAdminRoleIds(guildId: string): string[] {
    const cfg = this.getGuildConfig(guildId);
    try {
      return JSON.parse(cfg.admin_role_ids) as string[];
    } catch {
      return [];
    }
  }

  setAdminRoleIds(guildId: string, roleIds: string[]): void {
    this.updateGuildConfig(guildId, { admin_role_ids: JSON.stringify(roleIds) });
  }

  getGlobalStaffRoleIds(guildId: string): string[] {
    const cfg = this.getGuildConfig(guildId);
    try {
      return JSON.parse(cfg.staff_role_ids) as string[];
    } catch {
      return [];
    }
  }

  setGlobalStaffRoleIds(guildId: string, roleIds: string[]): void {
    this.updateGuildConfig(guildId, { staff_role_ids: JSON.stringify(roleIds) });
  }

  getTicketCategoryId(guildId: string): string | null {
    const cfg = this.getGuildConfig(guildId);
    return cfg.ticket_category_id ?? null;
  }

  setTicketCategoryId(guildId: string, categoryId: string | null): void {
    this.updateGuildConfig(guildId, { ticket_category_id: categoryId });
  }


  // ---------- Panel ----------

  getPanelConfig(guildId: string): PanelRow {
    ensureGuild(guildId);
    const db = getDb();
    let row = db.prepare(`SELECT * FROM panels WHERE guild_id = ?`).get(guildId) as PanelRow | undefined;
    if (!row) {
      db.prepare(`INSERT INTO panels (guild_id) VALUES (?)`).run(guildId);
      row = db.prepare(`SELECT * FROM panels WHERE guild_id = ?`).get(guildId) as PanelRow;
    }
    return row;
  }

  updatePanelConfig(guildId: string, patch: UpdatePanelInput): PanelRow {
    const current = this.getPanelConfig(guildId);
    const merged = { ...current, ...patch };
    const db = getDb();
    db.prepare(
      `UPDATE panels SET
         title = ?, description = ?, color = ?, image = ?, thumbnail = ?,
         footer_text = ?, footer_icon = ?, channel_id = ?, message_id = ?,
         updated_at = datetime('now')
       WHERE guild_id = ?`
    ).run(
      merged.title,
      merged.description,
      merged.color,
      merged.image,
      merged.thumbnail,
      merged.footer_text,
      merged.footer_icon,
      merged.channel_id,
      merged.message_id,
      guildId
    );
    return this.getPanelConfig(guildId);
  }

  // ---------- Buttons ----------

  getButtons(guildId: string): ButtonWithRoles[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM ticket_buttons WHERE guild_id = ? ORDER BY position ASC, id ASC`)
      .all(guildId) as TicketButtonRow[];
    return rows.map((row) => this.attachRoles(row));
  }

  getButton(guildId: string, buttonId: number): ButtonWithRoles | null {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM ticket_buttons WHERE guild_id = ? AND id = ?`)
      .get(guildId, buttonId) as TicketButtonRow | undefined;
    if (!row) return null;
    return this.attachRoles(row);
  }

  private attachRoles(row: TicketButtonRow): ButtonWithRoles {
    const db = getDb();
    const staffRoleIds = (
      db.prepare(`SELECT role_id FROM button_staff_roles WHERE button_id = ?`).all(row.id) as { role_id: string }[]
    ).map((r) => r.role_id);
    const pingRoleIds = (
      db.prepare(`SELECT role_id FROM button_ping_roles WHERE button_id = ?`).all(row.id) as { role_id: string }[]
    ).map((r) => r.role_id);
    return { ...row, staffRoleIds, pingRoleIds };
  }

  createButton(guildId: string, input: CreateButtonInput): ButtonWithRoles {
    ensureGuild(guildId);
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError("Button name cannot be empty.");
    }
    if (input.name.length > 80) {
      throw new ValidationError("Button name must be 80 characters or fewer.");
    }
    const db = getDb();
    const maxPosRow = db
      .prepare(`SELECT COALESCE(MAX(position), -1) as maxPos FROM ticket_buttons WHERE guild_id = ?`)
      .get(guildId) as { maxPos: number };
    const position = maxPosRow.maxPos + 1;

    const info = db
      .prepare(
        `INSERT INTO ticket_buttons
           (guild_id, name, emoji, style, category_id, channel_name, opening_message, max_tickets, cooldown_seconds, position)
         VALUES (@guild_id, @name, @emoji, @style, @category_id, @channel_name, @opening_message, @max_tickets, @cooldown_seconds, @position)`
      )
      .run({
        guild_id: guildId,
        name: input.name.trim(),
        emoji: input.emoji ?? null,
        style: input.style ?? "Primary",
        category_id: input.category_id ?? null,
        channel_name: input.channel_name ?? "ticket-{username}",
        opening_message: input.opening_message ?? "Thanks for reaching out! Support will be with you shortly.",
        max_tickets: input.max_tickets ?? 1,
        cooldown_seconds: input.cooldown_seconds ?? 0,
        position,
      });

    return this.getButton(guildId, Number(info.lastInsertRowid))!;
  }

  updateButton(guildId: string, buttonId: number, patch: UpdateButtonInput): ButtonWithRoles {
    const existing = this.getButton(guildId, buttonId);
    if (!existing) throw new ValidationError("That ticket button no longer exists.");
    const merged = { ...existing, ...patch };
    const db = getDb();
    db.prepare(
      `UPDATE ticket_buttons SET
         name = ?, emoji = ?, style = ?, category_id = ?, channel_name = ?,
         opening_message = ?, max_tickets = ?, cooldown_seconds = ?, updated_at = datetime('now')
       WHERE guild_id = ? AND id = ?`
    ).run(
      merged.name,
      merged.emoji,
      merged.style,
      merged.category_id,
      merged.channel_name,
      merged.opening_message,
      merged.max_tickets,
      merged.cooldown_seconds,
      guildId,
      buttonId
    );
    return this.getButton(guildId, buttonId)!;
  }

  deleteButton(guildId: string, buttonId: number): void {
    const db = getDb();
    const result = db.prepare(`DELETE FROM ticket_buttons WHERE guild_id = ? AND id = ?`).run(guildId, buttonId);
    if (result.changes === 0) {
      throw new ValidationError("That ticket button no longer exists.");
    }
  }

  reorderButtons(guildId: string, orderedButtonIds: number[]): void {
    const db = getDb();
    const tx = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        db.prepare(`UPDATE ticket_buttons SET position = ? WHERE guild_id = ? AND id = ?`).run(
          index,
          guildId,
          id
        );
      });
    });
    tx(orderedButtonIds);
  }

  setButtonStaffRoles(guildId: string, buttonId: number, roleIds: string[]): void {
    this.assertButtonBelongsToGuild(guildId, buttonId);
    const db = getDb();
    const tx = db.transaction((ids: string[]) => {
      db.prepare(`DELETE FROM button_staff_roles WHERE button_id = ?`).run(buttonId);
      for (const roleId of ids) {
        db.prepare(`INSERT OR IGNORE INTO button_staff_roles (button_id, role_id) VALUES (?, ?)`).run(
          buttonId,
          roleId
        );
      }
    });
    tx(roleIds);
  }

  setButtonPingRoles(guildId: string, buttonId: number, roleIds: string[]): void {
    this.assertButtonBelongsToGuild(guildId, buttonId);
    const db = getDb();
    const tx = db.transaction((ids: string[]) => {
      db.prepare(`DELETE FROM button_ping_roles WHERE button_id = ?`).run(buttonId);
      for (const roleId of ids) {
        db.prepare(`INSERT OR IGNORE INTO button_ping_roles (button_id, role_id) VALUES (?, ?)`).run(
          buttonId,
          roleId
        );
      }
    });
    tx(roleIds);
  }

  /**
   * Deletes panel, buttons (and their role links via cascade), and resets
   * settings to defaults for a guild. Open tickets themselves are left intact
   * so staff can still see/manage in-flight conversations.
   */
  resetGuild(guildId: string): void {
    ensureGuild(guildId);
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM panels WHERE guild_id = ?`).run(guildId);
      db.prepare(`DELETE FROM ticket_buttons WHERE guild_id = ?`).run(guildId); // cascades staff/ping roles
      db.prepare(`DELETE FROM cooldowns WHERE guild_id = ?`).run(guildId);
      db.prepare(
        `UPDATE settings SET
           log_channel_id = NULL,
           transcript_channel_id = NULL,
           transcripts_enabled = 1,
           transcript_include_attachments = 1,
           admin_role_ids = '[]',
           staff_role_ids = '[]',
           close_removes_creator_send = 1,
           ticket_category_id = NULL,
           updated_at = datetime('now')
         WHERE guild_id = ?`
      ).run(guildId);
    });
    tx();
  }

  private assertButtonBelongsToGuild(guildId: string, buttonId: number): void {
    const db = getDb();
    const row = db
      .prepare(`SELECT id FROM ticket_buttons WHERE guild_id = ? AND id = ?`)
      .get(guildId, buttonId);
    if (!row) throw new ValidationError("That ticket button does not belong to this server.");
  }
}

export const configService = new ConfigService();
