import { AttachmentBuilder, type Client, type TextChannel, type Message } from "discord.js";
import { configService } from "./ConfigService";
import type { TicketRow } from "../types";

/**
 * Maximum number of messages to include in a transcript.
 * Discord channels can have very long histories; we paginate correctly
 * but enforce a safety ceiling. This is NOT "full unlimited history".
 * 10_000 messages = up to 100 pages of 100.
 */
export const MAX_TRANSCRIPT_MESSAGES = 10_000;

/**
 * Generates plain-text transcripts of ticket channels and delivers them only
 * to the configured transcript channel — never posted publicly, never
 * returned to unauthorized users. Callers must already have verified the
 * requester is authorized staff/admin before invoking this service.
 */
export class TranscriptService {
  async generate(channel: TextChannel, ticket: TicketRow, includeAttachments: boolean): Promise<AttachmentBuilder> {
    const messages: Message[] = [];
    let lastId: string | undefined;
    const maxPages = Math.ceil(MAX_TRANSCRIPT_MESSAGES / 100);

    // Paginate through channel history (newest batches first), then reverse for chronological output.
    for (let i = 0; i < maxPages; i++) {
      const batch = await channel.messages.fetch({ limit: 100, before: lastId });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
      if (messages.length >= MAX_TRANSCRIPT_MESSAGES) break;
    }

    // Keep only the most recent MAX_TRANSCRIPT_MESSAGES if we hit the ceiling.
    const trimmed = messages.slice(0, MAX_TRANSCRIPT_MESSAGES);
    trimmed.reverse();

    const lines: string[] = [];
    lines.push(`Transcript for ticket #${ticket.id} — #${channel.name}`);
    lines.push(`Opened by user ID ${ticket.user_id} at ${ticket.created_at}`);
    lines.push(`Status: ${ticket.status}`);
    if (messages.length >= MAX_TRANSCRIPT_MESSAGES) {
      lines.push(`Note: Transcript capped at ${MAX_TRANSCRIPT_MESSAGES} most recent messages.`);
    }
    lines.push("=".repeat(60));

    for (const msg of trimmed) {
      const timestamp = msg.createdAt.toISOString();
      const author = `${msg.author.tag ?? msg.author.username} (${msg.author.id})`;
      lines.push(`[${timestamp}] ${author}:`);
      if (msg.content) lines.push(msg.content);
      if (includeAttachments && msg.attachments.size > 0) {
        for (const att of msg.attachments.values()) {
          lines.push(`  [attachment] ${att.name}: ${att.url}`);
        }
      }
      lines.push("");
    }

    const buffer = Buffer.from(lines.join("\n"), "utf-8");
    return new AttachmentBuilder(buffer, { name: `transcript-ticket-${ticket.id}.txt` });
  }

  /** Delivers a transcript attachment to the guild's configured transcript channel only. */
  async deliver(client: Client, guildId: string, attachment: AttachmentBuilder, ticket: TicketRow): Promise<boolean> {
    const settings = configService.getGuildConfig(guildId);
    if (!settings.transcripts_enabled || !settings.transcript_channel_id) return false;

    const channel = await client.channels.fetch(settings.transcript_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      console.warn(`[TranscriptService] Transcript channel ${settings.transcript_channel_id} missing or invalid for guild ${guildId}`);
      return false;
    }

    await channel.send({
      content: `Transcript for ticket #${ticket.id} (closed by <@${ticket.closed_by ?? "unknown"}>)`,
      files: [attachment],
    });
    return true;
  }
}

export const transcriptService = new TranscriptService();
