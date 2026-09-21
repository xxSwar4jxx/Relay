import type { User } from "discord.js";

export interface PlaceholderContext {
  user: User;
  ticketType: string;
  ticketNumber: number | string;
}

/** Discord channel names: lowercase, alphanumeric + hyphen, max 100 chars. */
function sanitizeChannelPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

export function applyPlaceholders(template: string, ctx: PlaceholderContext, forChannelName = false): string {
  let result = template
    .replaceAll("{username}", ctx.user.username)
    .replaceAll("{user}", `<@${ctx.user.id}>`)
    .replaceAll("{userid}", ctx.user.id)
    .replaceAll("{type}", ctx.ticketType)
    .replaceAll("{ticket}", String(ctx.ticketNumber));

  if (forChannelName) {
    result = sanitizeChannelPart(result);
    if (!result) result = `ticket-${ctx.ticketNumber}`;
  }
  return result;
}
