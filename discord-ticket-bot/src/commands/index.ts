import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as ticketCommand from "./ticket";

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [ticketCommand as unknown as Command];

export const commandsByName = new Map<string, Command>(commands.map((c) => [c.data.name, c]));
