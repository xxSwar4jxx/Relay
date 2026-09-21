import { EmbedBuilder, Colors, type Client, type User } from "discord.js";
import { configService } from "./ConfigService";

export type TicketLogEvent =
  | "Ticket Created"
  | "Ticket Claimed"
  | "Ticket Unclaimed"
  | "User Added"
  | "User Removed"
  | "Ticket Closed"
  | "Ticket Reopened"
  | "Ticket Deleted"
  | "Configuration Changed"
  | "Panel Updated";

export interface LogFields {
  ticket?: string;
  user?: string;
  staff?: string;
  action?: string;
  extra?: string;
}

const EVENT_COLORS: Partial<Record<TicketLogEvent, number>> = {
  "Ticket Created": Colors.Green,
  "Ticket Claimed": Colors.Blurple,
  "Ticket Unclaimed": Colors.Grey,
  "Ticket Closed": Colors.Orange,
  "Ticket Deleted": Colors.Red,
  "Ticket Reopened": Colors.Green,
  "Configuration Changed": Colors.Grey,
  "Panel Updated": Colors.Grey,
};

/**
 * Sends structured log embeds to the guild's configured log channel.
 * Silently no-ops (never throws) if logging isn't configured — logging
 * failures must never break the ticket action that triggered them.
 */
export class LoggingService {
  async log(client: Client, guildId: string, event: TicketLogEvent, fields: LogFields): Promise<void> {
    try {
      const settings = configService.getGuildConfig(guildId);
      if (!settings.log_channel_id) return;

      const channel = await client.channels.fetch(settings.log_channel_id).catch(() => null);
      if (!channel || !channel.isTextBased() || !("send" in channel)) return;

      const embed = new EmbedBuilder()
        .setTitle(event)
        .setColor(EVENT_COLORS[event] ?? Colors.Grey)
        .setTimestamp(new Date());

      const lines: string[] = [];
      if (fields.ticket) lines.push(`**Ticket:** ${fields.ticket}`);
      if (fields.user) lines.push(`**User:** ${fields.user}`);
      if (fields.staff) lines.push(`**Staff:** ${fields.staff}`);
      if (fields.action) lines.push(`**Action:** ${fields.action}`);
      if (fields.extra) lines.push(fields.extra);
      if (lines.length) embed.setDescription(lines.join("\n"));

      await channel.send({ embeds: [embed] });
    } catch {
      // Never let logging failures break the calling flow.
    }
  }

  formatUser(user: User): string {
    return `${user} (${user.tag ?? user.username}, \`${user.id}\`)`;
  }
}

export const loggingService = new LoggingService();
