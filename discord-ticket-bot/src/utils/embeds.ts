import { EmbedBuilder, Colors } from "discord.js";

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ ${message}`);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ ${message}`);
}

export function infoEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Blurple).setDescription(message);
}

/** Parses a user-supplied hex color, falling back to Discord blurple on invalid input. */
export function parseColor(input: string | null | undefined): number {
  if (!input) return 0x5865f2;
  const hex = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0x5865f2;
  return parseInt(hex, 16);
}
