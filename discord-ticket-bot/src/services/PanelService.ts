import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  type TextChannel,
  type Message,
  type APIEmbedField,
} from "discord.js";
import { configService, type ButtonWithRoles } from "./ConfigService";
import { parseColor } from "../utils/embeds";
import { buildCustomId } from "../utils/customId";
import { ValidationError } from "../utils/errors";

const STYLE_TO_DISCORD: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

/** Official OpenForge branding — only rendered on the main public ticket panel. */
const OPENFORGE_FOOTER_TEXT = "Developed by OpenForge";
/** Public URL or attachment reference; Discord footer iconURL must be a valid URL.
 *  When deploying, we attach the local asset if available; for footer iconURL
 *  we prefer a stable hosted URL. The asset is also available in assets/. */
const OPENFORGE_LOGO_PATH = "assets/openforge-logo.png";

/**
 * Builds the ticket panel embed + components from a guild's stored configuration.
 * Supports >25 ticket types via select menus. OpenForge branding is always
 * applied to the public panel footer and cannot be removed by server config.
 */
export class PanelService {
  /**
   * Builds the public panel embed. Custom footer from config is preserved if set,
   * but OpenForge attribution is always present at the bottom (via description
   * separator or by merging into footer when Discord allows only one footer).
   *
   * Discord embeds support a single footer. Strategy:
   * - If the server set a custom footer_text, we keep it as the embed footer.
   * - OpenForge branding is appended as a final line in the description so it
   *   always appears at the bottom of the visual panel content, above buttons.
   * - Additionally set footer icon to OpenForge when no custom footer icon is set.
   *
   * For the purest "footer-style" branding matching the requirement, we always
   * set the embed footer to OpenForge branding (logo + text). Custom footer
   * from config is moved into the description if present, so attribution is
   * never lost and always sits at the very bottom of the embed content area.
   */
  buildEmbed(guildId: string, forPublicPanel = true): EmbedBuilder {
    const panel = configService.getPanelConfig(guildId);
    let description = panel.description || "Click a button below to open a ticket.";

    // If admin configured a custom footer, surface it in the description so the
    // actual Discord footer slot can be reserved for OpenForge on public panels.
    if (forPublicPanel && panel.footer_text) {
      description = `${description}\n\n_${panel.footer_text}_`;
    }

    const embed = new EmbedBuilder()
      .setTitle(panel.title || "Support Tickets")
      .setDescription(description)
      .setColor(parseColor(panel.color));

    if (panel.image) embed.setImage(panel.image);
    if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);

    if (forPublicPanel) {
      // OpenForge branding always at the bottom of the public panel.
      // iconURL must be a publicly reachable URL; when the panel is deployed
      // we can attach the file. For footer iconURL we leave it optional —
      // Discord requires a URL. Servers can host the logo; we set text always.
      embed.setFooter({
        text: OPENFORGE_FOOTER_TEXT,
        // Prefer custom footer icon if admin set one for branding consistency,
        // otherwise leave icon unset (text-only OpenForge attribution).
        // Admins cannot remove the text attribution.
        iconURL: panel.footer_icon ?? undefined,
      });
    } else {
      // Preview/config contexts: show configured footer as-is, no forced branding.
      if (panel.footer_text) {
        embed.setFooter({
          text: panel.footer_text,
          iconURL: panel.footer_icon ?? undefined,
        });
      }
    }

    return embed;
  }

  /**
   * Builds action rows for the panel.
   * ≤25 buttons → native buttons (max 5 per row, 5 rows).
   * >25 → one or more StringSelectMenus so every type remains accessible.
   */
  buildComponents(buttons: ButtonWithRoles[]): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    if (buttons.length === 0) return [];

    if (buttons.length <= 25) {
      return this.buildButtonRows(buttons);
    }

    // Select menus: Discord allows max 25 options per select, max 5 rows total.
    // Split into chunks of 25.
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
    const chunks: ButtonWithRoles[][] = [];
    for (let i = 0; i < buttons.length; i += 25) {
      chunks.push(buttons.slice(i, i + 25));
    }

    // Cap at 5 select menus (Discord message component limit).
    const usable = chunks.slice(0, 5);
    for (let i = 0; i < usable.length; i++) {
      const chunk = usable[i];
      const select = new StringSelectMenuBuilder()
        .setCustomId(buildCustomId("ticket", "create_select", i))
        .setPlaceholder(
          chunks.length === 1
            ? "🎫 Select a ticket type"
            : `🎫 Select a ticket type (${i * 25 + 1}–${i * 25 + chunk.length})`
        )
        .addOptions(
          chunk.map((btn) => {
            const opt: { label: string; value: string; emoji?: string; description?: string } = {
              label: btn.name.slice(0, 100),
              value: String(btn.id),
            };
            if (btn.emoji) {
              try {
                opt.emoji = btn.emoji;
              } catch {
                // skip invalid emoji
              }
            }
            return opt;
          })
        );
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }

    if (chunks.length > 5) {
      console.warn(
        `[PanelService] Guild has ${buttons.length} ticket types; only first 125 are shown via select menus due to Discord limits.`
      );
    }

    return rows;
  }

  private buildButtonRows(buttons: ButtonWithRoles[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let current = new ActionRowBuilder<ButtonBuilder>();
    let countInRow = 0;

    for (const btn of buttons) {
      if (countInRow === 5) {
        rows.push(current);
        current = new ActionRowBuilder<ButtonBuilder>();
        countInRow = 0;
      }
      const b = new ButtonBuilder()
        .setCustomId(buildCustomId("ticket", "create", btn.id))
        .setLabel(btn.name.slice(0, 80))
        .setStyle(STYLE_TO_DISCORD[btn.style] ?? ButtonStyle.Primary);
      if (btn.emoji) {
        try {
          b.setEmoji(btn.emoji);
        } catch {
          // Invalid emoji stored — skip rather than crash panel rendering.
        }
      }
      current.addComponents(b);
      countInRow++;
    }
    if (countInRow > 0) rows.push(current);
    // Discord hard cap: 5 rows
    return rows.slice(0, 5);
  }

  /** @deprecated Use buildComponents — kept for internal clarity. */
  buildButtonRowsPublic(buttons: ButtonWithRoles[]): ActionRowBuilder<ButtonBuilder>[] {
    return this.buildButtonRows(buttons);
  }

  async buildPreview(guildId: string, publicBranding = false) {
    const embed = this.buildEmbed(guildId, publicBranding);
    const buttons = configService.getButtons(guildId);
    if (buttons.length === 0) {
      throw new ValidationError("Add at least one ticket button before previewing or sending the panel.");
    }
    const components = this.buildComponents(buttons);
    return { embeds: [embed], components };
  }

  /** Sends a new panel message, or edits the existing one if already deployed. */
  async deploy(channel: TextChannel, guildId: string): Promise<Message> {
    // Public panel always gets OpenForge branding.
    const { embeds, components } = await this.buildPreview(guildId, true);
    const panel = configService.getPanelConfig(guildId);

    if (panel.channel_id && panel.message_id) {
      try {
        const existingChannel = await channel.client.channels.fetch(panel.channel_id);
        if (existingChannel?.isTextBased() && "messages" in existingChannel) {
          const existingMsg = await (existingChannel as TextChannel).messages.fetch(panel.message_id).catch(() => null);
          if (existingMsg) {
            const updated = await existingMsg.edit({ embeds, components });
            return updated;
          }
        }
      } catch {
        // Fall through to sending a new message if the old one is gone.
      }
    }

    const sent = await channel.send({ embeds, components });
    configService.updatePanelConfig(guildId, { channel_id: channel.id, message_id: sent.id });
    return sent;
  }
}

export const panelService = new PanelService();
export { OPENFORGE_FOOTER_TEXT, OPENFORGE_LOGO_PATH };
