import type { ButtonStyle } from "discord.js";

export interface GuildRow {
  id: number;
  guild_id: string;
  created_at: string;
  updated_at: string;
}

export interface PanelRow {
  id: number;
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  title: string;
  description: string;
  color: string; // hex string, e.g. #5865F2
  image: string | null;
  thumbnail: string | null;
  footer_text: string | null;
  footer_icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketButtonRow {
  id: number;
  guild_id: string;
  name: string;
  emoji: string | null;
  style: ButtonStyleName;
  category_id: string | null;
  channel_name: string; // template with placeholders
  opening_message: string;
  max_tickets: number; // per-user, 0 = unlimited
  cooldown_seconds: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export type ButtonStyleName = "Primary" | "Secondary" | "Success" | "Danger";

export const BUTTON_STYLE_MAP: Record<ButtonStyleName, ButtonStyle> = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
} as unknown as Record<ButtonStyleName, ButtonStyle>;

export interface ButtonStaffRoleRow {
  button_id: number;
  role_id: string;
}

export interface ButtonPingRoleRow {
  button_id: number;
  role_id: string;
}

export type TicketStatus = "open" | "closed" | "deleted";

export interface TicketRow {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  button_id: number | null;
  claimed_by: string | null;
  status: TicketStatus;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  deleted_at: string | null;
}

export interface TicketMemberRow {
  ticket_id: number;
  user_id: string;
}

export interface SettingsRow {
  guild_id: string;
  log_channel_id: string | null;
  transcript_channel_id: string | null;
  transcripts_enabled: number; // 0/1
  transcript_include_attachments: number; // 0/1
  admin_role_ids: string; // JSON string array
  staff_role_ids: string; // JSON string array (global staff, separate from per-button staff)
  close_removes_creator_send: number; // 0/1
  ticket_category_id: string | null;
  updated_at: string;
}

export interface ParsedCustomId {
  namespace: string; // "ticket" | "config"
  action: string;
  id?: string;
  extra?: string;
}

export const PLACEHOLDER_KEYS = ["{username}", "{user}", "{userid}", "{type}", "{ticket}"] as const;
