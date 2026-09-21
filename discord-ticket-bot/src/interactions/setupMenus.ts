import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Colors,
} from "discord.js";
import { buildCustomId } from "../utils/customId";
import { configService, type ButtonWithRoles } from "../services/ConfigService";
import { parseColor } from "../utils/embeds";

// ---------------------------------------------------------------------------
// Main menu (/ticket setup)
// ---------------------------------------------------------------------------

export function buildMainMenu() {
  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket System Configuration")
    .setColor(Colors.Blurple)
    .setDescription("Choose a category below to configure the ticket system for this server.")
    .addFields(
      { name: "Panel", value: "Edit the panel text, appearance, and deploy it.", inline: false },
      { name: "Tickets", value: "Parent category, ticket buttons, and staff roles.", inline: false },
      { name: "Logs & Transcripts", value: "Configure logging and transcript delivery.", inline: false },
      { name: "System", value: "Admin permissions and full reset.", inline: false }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "panel")).setLabel("Panel").setEmoji("📝").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "category")).setLabel("Ticket Category").setEmoji("📁").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "buttons")).setLabel("Manage Buttons").setEmoji("🔘").setStyle(ButtonStyle.Primary)
  );
  const row1b = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "staff")).setLabel("Staff Roles").setEmoji("👮").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "logs")).setLabel("Logging Channel").setEmoji("📋").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "transcripts")).setLabel("Transcript Settings").setEmoji("📜").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "permissions")).setLabel("Permissions").setEmoji("🔒").setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "reset")).setLabel("Reset Config").setEmoji("♻️").setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row1b, row2, row3] };
}

// ---------------------------------------------------------------------------
// Panel submenu
// ---------------------------------------------------------------------------

export function buildPanelMenu(guildId: string) {
  const panel = configService.getPanelConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle("📝 Panel Configuration")
    .setColor(parseColor(panel.color))
    .setDescription(
      [
        `**Title:** ${panel.title}`,
        `**Description:** ${panel.description}`,
        `**Color:** ${panel.color}`,
        `**Image:** ${panel.image ?? "not set"}`,
        `**Thumbnail:** ${panel.thumbnail ?? "not set"}`,
        `**Footer:** ${panel.footer_text ?? "not set"}`,
        `**Deployed:** ${panel.channel_id ? `<#${panel.channel_id}>` : "not yet sent"}`,
      ].join("\n")
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "panel_text_modal")).setLabel("Edit Text & Color").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "panel_images_modal")).setLabel("Edit Images").setEmoji("🖼️").setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "panel_preview")).setLabel("Preview").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "panel_send")).setLabel("Send / Update Panel").setEmoji("📤").setStyle(ButtonStyle.Success)
  );
  const row3 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "panel_channel_select"))
      .setPlaceholder("Choose the channel to send/update the panel in")
      .addChannelTypes(ChannelType.GuildText)
  );
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export function buildPanelTextModal(guildId: string): ModalBuilder {
  const panel = configService.getPanelConfig(guildId);
  return new ModalBuilder()
    .setCustomId(buildCustomId("config", "panel_text_submit"))
    .setTitle("Edit Panel Text & Color")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.title)
          .setMaxLength(256)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(panel.description)
          .setMaxLength(2000)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Color (hex, e.g. #5865F2)")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.color)
          .setMaxLength(7)
          .setRequired(false)
      )
    );
}

export function buildPanelImagesModal(guildId: string): ModalBuilder {
  const panel = configService.getPanelConfig(guildId);
  return new ModalBuilder()
    .setCustomId(buildCustomId("config", "panel_images_submit"))
    .setTitle("Edit Panel Images")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("image")
          .setLabel("Banner image URL")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.image ?? "")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("thumbnail")
          .setLabel("Thumbnail image URL")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.thumbnail ?? "")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("footer_text")
          .setLabel("Footer text")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.footer_text ?? "")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("footer_icon")
          .setLabel("Footer icon URL")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.footer_icon ?? "")
          .setRequired(false)
      )
    );
}

// ---------------------------------------------------------------------------
// Buttons submenu
// ---------------------------------------------------------------------------

export function buildButtonsMenu(guildId: string) {
  const buttons = configService.getButtons(guildId);
  const embed = new EmbedBuilder()
    .setTitle("🔘 Ticket Buttons")
    .setColor(Colors.Blurple)
    .setDescription(
      buttons.length === 0
        ? "No ticket buttons configured yet. Click **Add Button** to create one."
        : buttons
            .map((b) => `${b.emoji ?? "•"} **${b.name}** — category: ${b.category_id ? `<#${b.category_id}>` : "none"} · max: ${b.max_tickets || "∞"} · cooldown: ${b.cooldown_seconds}s`)
            .join("\n")
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "button_add_modal")).setLabel("Add Button").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildCustomId("config", "buttons_reorder")).setLabel("Reorder").setEmoji("↕️").setStyle(ButtonStyle.Secondary).setDisabled(buttons.length < 2)
  );

  const components: any[] = [row1];

  if (buttons.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "button_select"))
      .setPlaceholder("Select a button to edit, delete, or configure roles")
      .addOptions(
        buttons.slice(0, 25).map((b) => ({
          label: b.name.slice(0, 100),
          value: String(b.id),
          emoji: b.emoji ?? undefined,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}

export function buildButtonDetailMenu(button: ButtonWithRoles) {
  const embed = new EmbedBuilder()
    .setTitle(`${button.emoji ?? "🔘"} ${button.name}`)
    .setColor(Colors.Blurple)
    .addFields(
      { name: "Category", value: button.category_id ? `<#${button.category_id}>` : "not set", inline: true },
      { name: "Style", value: button.style, inline: true },
      { name: "Max tickets / user", value: String(button.max_tickets || "unlimited"), inline: true },
      { name: "Cooldown", value: `${button.cooldown_seconds}s`, inline: true },
      { name: "Channel name format", value: `\`${button.channel_name}\``, inline: false },
      { name: "Opening message", value: button.opening_message.slice(0, 1000), inline: false },
      { name: "Staff roles", value: button.staffRoleIds.length ? button.staffRoleIds.map((r) => `<@&${r}>`).join(" ") : "none", inline: false },
      { name: "Ping roles", value: button.pingRoleIds.length ? button.pingRoleIds.map((r) => `<@&${r}>`).join(" ") : "none", inline: false }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "button_edit_modal", button.id)).setLabel("Edit Details").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "button_style", button.id)).setLabel("Button Style").setEmoji("🎨").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId("config", "button_delete", button.id)).setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "button_category_select", button.id))
      .setPlaceholder("Set ticket category")
      .addChannelTypes(ChannelType.GuildCategory)
  );
  const row3 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "button_staff_select", button.id))
      .setPlaceholder("Set staff roles for this button")
      .setMinValues(0)
      .setMaxValues(10)
  );
  const row4 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "button_ping_select", button.id))
      .setPlaceholder("Set roles to ping when a ticket opens")
      .setMinValues(0)
      .setMaxValues(10)
  );
  const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "menu", "buttons")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

export function buildButtonAddModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId("config", "button_add_submit"))
    .setTitle("Add Ticket Button")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Button name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("channel_name")
          .setLabel("Channel name format")
          .setStyle(TextInputStyle.Short)
          .setValue("ticket-{username}")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("opening_message")
          .setLabel("Opening message")
          .setStyle(TextInputStyle.Paragraph)
          .setValue("Thanks for reaching out! Support will be with you shortly.")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limits")
          .setLabel("Max tickets/user, cooldown(sec) e.g. \"1,600\"")
          .setStyle(TextInputStyle.Short)
          .setValue("1,0")
          .setRequired(false)
      )
    );
}

export function buildButtonEditModal(button: ButtonWithRoles): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildCustomId("config", "button_edit_submit", button.id))
    .setTitle(`Edit: ${button.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Button name").setStyle(TextInputStyle.Short).setValue(button.name).setRequired(true).setMaxLength(80)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setValue(button.emoji ?? "").setRequired(false).setMaxLength(20)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("channel_name")
          .setLabel("Channel name format")
          .setStyle(TextInputStyle.Short)
          .setValue(button.channel_name)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("opening_message")
          .setLabel("Opening message")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(button.opening_message)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limits")
          .setLabel("Max tickets/user, cooldown(sec) e.g. \"1,600\"")
          .setStyle(TextInputStyle.Short)
          .setValue(`${button.max_tickets},${button.cooldown_seconds}`)
          .setRequired(false)
      )
    );
}

// ---------------------------------------------------------------------------
// Staff / Logs / Transcripts / Permissions submenus
// ---------------------------------------------------------------------------

export function buildStaffMenu(guildId: string) {
  const roleIds = configService.getGlobalStaffRoleIds(guildId);
  const embed = new EmbedBuilder()
    .setTitle("👮 Global Staff Roles")
    .setColor(Colors.Blurple)
    .setDescription(
      "These roles can manage every ticket regardless of type. Per-button staff roles (set inside a button's config) are additive.\n\n" +
        (roleIds.length ? roleIds.map((r) => `<@&${r}>`).join(" ") : "No global staff roles set.")
    );
  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId(buildCustomId("config", "staff_select")).setPlaceholder("Select global staff roles").setMinValues(0).setMaxValues(10)
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row, back] };
}

export function buildPermissionsMenu(guildId: string) {
  const roleIds = configService.getAdminRoleIds(guildId);
  const embed = new EmbedBuilder()
    .setTitle("🔒 Ticket System Administrators")
    .setColor(Colors.Blurple)
    .setDescription(
      "Members with Administrator or Manage Server can always configure the ticket system. These additional roles can too:\n\n" +
        (roleIds.length ? roleIds.map((r) => `<@&${r}>`).join(" ") : "No additional admin roles set.")
    );
  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId(buildCustomId("config", "admin_select")).setPlaceholder("Select additional admin roles").setMinValues(0).setMaxValues(10)
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row, back] };
}

export function buildLogsMenu(guildId: string) {
  const settings = configService.getGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle("📋 Logging Channel")
    .setColor(Colors.Blurple)
    .setDescription(`Current: ${settings.log_channel_id ? `<#${settings.log_channel_id}>` : "not set"}`);
  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(buildCustomId("config", "log_channel_select")).setPlaceholder("Select the logging channel").addChannelTypes(ChannelType.GuildText)
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row, back] };
}

export function buildTranscriptsMenu(guildId: string) {
  const settings = configService.getGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle("📜 Transcript Settings")
    .setColor(Colors.Blurple)
    .setDescription(
      [
        `**Enabled:** ${settings.transcripts_enabled ? "Yes" : "No"}`,
        `**Channel:** ${settings.transcript_channel_id ? `<#${settings.transcript_channel_id}>` : "not set"}`,
        `**Include attachments:** ${settings.transcript_include_attachments ? "Yes" : "No"}`,
      ].join("\n")
    );
  const row1 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(buildCustomId("config", "transcript_channel_select")).setPlaceholder("Select the transcript channel").addChannelTypes(ChannelType.GuildText)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "transcript_toggle"))
      .setLabel(settings.transcripts_enabled ? "Disable Transcripts" : "Enable Transcripts")
      .setStyle(settings.transcripts_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "transcript_attachments_toggle"))
      .setLabel(settings.transcript_include_attachments ? "Exclude Attachments" : "Include Attachments")
      .setStyle(ButtonStyle.Secondary)
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row1, row2, back] };
}

export function buildResetConfirm() {
  const embed = new EmbedBuilder()
    .setTitle("♻️ Reset Ticket Configuration")
    .setColor(Colors.Red)
    .setDescription(
      "This will permanently delete the panel, all ticket buttons, staff role settings, and logging/transcript settings for this server. **Open tickets are not deleted.**\n\nThis cannot be undone."
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "reset_confirm")).setLabel("Confirm Reset").setEmoji("⚠️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}


// ---------------------------------------------------------------------------
// Button style picker
// ---------------------------------------------------------------------------

export function buildButtonStyleMenu(button: ButtonWithRoles) {
  const embed = new EmbedBuilder()
    .setTitle(`🎨 Button Style — ${button.name}`)
    .setColor(Colors.Blurple)
    .setDescription(
      `Current style: **${button.style}**\n\nDiscord supports four native button styles. Custom hex colors are not supported by Discord.`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "button_style_set", button.id, "Primary"))
      .setLabel("Primary")
      .setEmoji("🔵")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(button.style === "Primary"),
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "button_style_set", button.id, "Secondary"))
      .setLabel("Secondary")
      .setEmoji("⚪")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(button.style === "Secondary"),
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "button_style_set", button.id, "Success"))
      .setLabel("Success")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success)
      .setDisabled(button.style === "Success"),
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "button_style_set", button.id, "Danger"))
      .setLabel("Danger")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(button.style === "Danger")
  );
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("config", "menu", "buttons"))
      .setLabel("← Back to Buttons")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, backRow] };
}

// ---------------------------------------------------------------------------
// Button reordering
// ---------------------------------------------------------------------------

export function buildReorderMenu(guildId: string) {
  const buttons = configService.getButtons(guildId);
  const embed = new EmbedBuilder()
    .setTitle("↕️ Reorder Ticket Buttons")
    .setColor(Colors.Blurple)
    .setDescription(
      buttons.length === 0
        ? "No buttons to reorder."
        : buttons
            .map((b, i) => `**${i + 1}.** ${b.emoji ?? "•"} ${b.name}`)
            .join("\n") +
          "\n\nUse the buttons below to move a button up or down. Order is saved immediately and used when the panel is rendered."
    );

  const components: any[] = [];

  // For each button (up to 5 shown with up/down to stay within component limits),
  // provide move controls. For larger lists, use a select to pick which to move.
  if (buttons.length >= 2) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "button_select"))
      .setPlaceholder("Select a button to view/edit (or use ↑↓ below)")
      .addOptions(
        buttons.slice(0, 25).map((b, i) => ({
          label: `${i + 1}. ${b.name}`.slice(0, 100),
          value: String(b.id),
          emoji: b.emoji ?? undefined,
        }))
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  // Up/Down controls for first few buttons (compact)
  for (let i = 0; i < Math.min(buttons.length, 4); i++) {
    const b = buttons[i];
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId("config", "reorder_label", b.id))
        .setLabel(`${i + 1}. ${b.name}`.slice(0, 60))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(buildCustomId("config", "reorder_up", b.id))
        .setLabel("↑")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(i === 0),
      new ButtonBuilder()
        .setCustomId(buildCustomId("config", "reorder_down", b.id))
        .setLabel("↓")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(i === buttons.length - 1)
    );
    components.push(row);
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId("config", "menu", "buttons"))
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}


// ---------------------------------------------------------------------------
// Ticket Category (guild-level parent for all ticket channels)
// ---------------------------------------------------------------------------

export function buildCategoryMenu(guildId: string) {
  const categoryId = configService.getTicketCategoryId(guildId);
  const embed = new EmbedBuilder()
    .setTitle("📁 Ticket Category")
    .setColor(Colors.Blurple)
    .setDescription(
      [
        "All new ticket channels are created **inside** this Discord category.",
        "",
        `**Current category:** ${categoryId ? `<#${categoryId}>` : "❌ not configured"}`,
        "",
        "Select an existing **Category** channel below. Do not hardcode names — pick the category you use for support tickets.",
        "If the category is deleted later, ticket creation will fail with a clear error until you reconfigure it.",
      ].join("\n")
    );

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(buildCustomId("config", "ticket_category_select"))
      .setPlaceholder("Select the parent category for tickets")
      .addChannelTypes(ChannelType.GuildCategory)
  );
  const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId("config", "back_main")).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row, back] };
}
