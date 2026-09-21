import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { permissionService } from "../services/PermissionService";
import { configService } from "../services/ConfigService";
import { panelService } from "../services/PanelService";
import { errorEmbed, successEmbed } from "../utils/embeds";
import { buildMainMenu } from "../interactions/setupMenus";
import { UserFacingError } from "../utils/errors";
import { loggingService } from "../services/LoggingService";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Configure and manage the ticket system")
  .setDMPermission(false)
  // Intentionally NOT setting defaultMemberPermissions to ManageGuild.
  // Application-level authorization is handled exclusively by PermissionService
  // so configured Ticket Admin roles can use /ticket even without Manage Guild.
  .addSubcommand((sc) => sc.setName("setup").setDescription("Open the full ticket system configuration menu"))
  .addSubcommand((sc) =>
    sc
      .setName("panel")
      .setDescription("Preview, send, or update the ticket panel")
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("What to do with the panel")
          .setRequired(true)
          .addChoices(
            { name: "Preview", value: "preview" },
            { name: "Send / Update", value: "send" }
          )
      )
      .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Channel to send the panel to").addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sc) => sc.setName("config").setDescription("View the current ticket system configuration"))
  .addSubcommand((sc) => sc.setName("buttons").setDescription("Open the ticket button manager"))
  .addSubcommand((sc) => sc.setName("staff").setDescription("Open the global staff role manager"))
  .addSubcommand((sc) => sc.setName("logs").setDescription("Open the logging channel configuration"))
  .addSubcommand((sc) => sc.setName("transcripts").setDescription("Open the transcript configuration"))
  .addSubcommand((sc) => sc.setName("reset").setDescription("Reset all ticket configuration for this server"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed("This command can only be used in a server.")], ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  // Discord's own default_member_permissions already gates this at ManageGuild,
  // but we re-check against our admin layer for admin-role parity across the app.
  permissionService.requireAdmin(member);

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  switch (sub) {
    case "setup": {
      const { embeds, components } = buildMainMenu();
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    case "panel": {
      const action = interaction.options.getString("action", true);
      const channelOpt = interaction.options.getChannel("channel");

      if (action === "preview") {
        const preview = await panelService.buildPreview(guildId);
        await interaction.reply({ ...preview, ephemeral: true });
        return;
      }

      // send / update
      const targetChannel = channelOpt ?? interaction.channel;
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [errorEmbed("Please run this in a text channel or specify a text channel.")],
          ephemeral: true,
        });
        return;
      }
      const sent = await panelService.deploy(targetChannel as any, guildId);
      await loggingService.log(interaction.client, guildId, "Panel Updated", {
        staff: loggingService.formatUser(interaction.user),
        action: `Panel deployed to <#${sent.channelId}>`,
      });
      await interaction.reply({ embeds: [successEmbed(`Panel sent/updated in <#${sent.channelId}>.`)], ephemeral: true });
      return;
    }

    case "config": {
      const settings = configService.getGuildConfig(guildId);
      const buttons = configService.getButtons(guildId);
      const panel = configService.getPanelConfig(guildId);
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Current Ticket Configuration")
        .setColor(Colors.Blurple)
        .addFields(
          { name: "Panel deployed", value: panel.channel_id ? `<#${panel.channel_id}>` : "No", inline: true },
          { name: "Ticket buttons", value: String(buttons.length), inline: true },
          { name: "Log channel", value: settings.log_channel_id ? `<#${settings.log_channel_id}>` : "not set", inline: true },
          { name: "Transcript channel", value: settings.transcript_channel_id ? `<#${settings.transcript_channel_id}>` : "not set", inline: true },
          { name: "Transcripts enabled", value: settings.transcripts_enabled ? "Yes" : "No", inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    case "buttons": {
      const { buildButtonsMenu } = await import("../interactions/setupMenus");
      const { embeds, components } = buildButtonsMenu(guildId);
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    case "staff": {
      const { buildStaffMenu } = await import("../interactions/setupMenus");
      const { embeds, components } = buildStaffMenu(guildId);
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    case "logs": {
      const { buildLogsMenu } = await import("../interactions/setupMenus");
      const { embeds, components } = buildLogsMenu(guildId);
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    case "transcripts": {
      const { buildTranscriptsMenu } = await import("../interactions/setupMenus");
      const { embeds, components } = buildTranscriptsMenu(guildId);
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    case "reset": {
      const { buildResetConfirm } = await import("../interactions/setupMenus");
      const { embeds, components } = buildResetConfirm();
      await interaction.reply({ embeds, components, ephemeral: true });
      return;
    }

    default:
      throw new UserFacingError("Unknown subcommand.");
  }
}
