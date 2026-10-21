import { discordRequest } from "./discord-rest";
import { readJson, writeJson } from "./storage";

type Interaction = {
  type: number; id: string; token: string; guild_id?: string; channel_id?: string;
  message?: { id?: string; content?: string };
  member?: { user?: { id: string; username?: string }; roles?: string[]; permissions?: string };
  user?: { id: string; username?: string };
  data?: { name?: string; options?: Array<{ name: string; value?: string | number; options?: Array<{ name: string; value?: string | number }> }>; custom_id?: string; values?: string[]; components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }> };
};
type TicketRecord = { channelId: string; ownerId: string; claimedBy: string | null; status: "open" | "closed"; createdAt: string; originalChannelName?: string };
type TicketButton = { id: string; label: string; emoji: string | null; style: number; channelName: string; openingMessage: string; staffRoleIds: string[]; enabled: boolean };
type GuildConfig = { guildId: string; categoryId: string | null; panelChannelId: string | null; panelMessageId: string | null; logChannelId: string | null; transcriptChannelId: string | null; transcriptsEnabled: boolean; transcriptIncludeAttachments: boolean; adminRoleIds: string[]; staffRoleIds: string[]; buttons: TicketButton[]; tickets: TicketRecord[] };

const configPath = (guildId: string) => `relay/guilds/${guildId}.json`;
const defaults = (guildId: string): GuildConfig => ({ guildId, categoryId: null, panelChannelId: null, panelMessageId: null, logChannelId: null, transcriptChannelId: null, transcriptsEnabled: false, transcriptIncludeAttachments: true, adminRoleIds: [], staffRoleIds: [], buttons: [{ id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}-{ticket_number}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true }], tickets: [] });
const userId = (i: Interaction) => i.member?.user?.id ?? i.user?.id ?? "";
const username = (i: Interaction) => i.member?.user?.username ?? i.user?.username ?? "user";
const response = (content: string, ephemeral = true, components: unknown[] = []) => ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, components } });
const updateResponse = (content: string, components: unknown[] = []) => ({ type: 7, data: { content, components } });
const button = (custom_id: string, label: string, style = 2) => ({ type: 2, style, custom_id, label });
const row = (...components: unknown[]) => ({ type: 1, components });
const channelSelect = (custom_id: string, placeholder: string, channel_types: number[]) => ({ type: 1, components: [{ type: 8, custom_id, placeholder, min_values: 1, max_values: 1, channel_types }] });
const roleSelect = (custom_id: string, placeholder: string) => ({ type: 1, components: [{ type: 6, custom_id, placeholder, min_values: 0, max_values: 10 }] });
const userSelect = (custom_id: string, placeholder: string) => ({ type: 1, components: [{ type: 5, custom_id, placeholder, min_values: 1, max_values: 5 }] });
const stringSelect = (custom_id: string, placeholder: string, options: Array<{ label: string; value: string; description?: string }>) => ({ type: 1, components: [{ type: 3, custom_id, placeholder, min_values: 1, max_values: 1, options: options.slice(0, 25) }] });
const configMenu = (cfg: GuildConfig) => [
  channelSelect("config:category_select", "Select ticket parent category", [4]),
  channelSelect("config:panel_channel_select", "Select panel destination channel", [0]),
  channelSelect("config:log_channel_select", "Select logging channel", [0]),
  roleSelect("config:admin_roles_select", "Select ticket admin roles"),
  roleSelect("config:staff_roles_select", "Select support staff roles"),
  row(button("config:panel_send", "Publish / Update Panel", 1), button("config:show_config", "Show Config")),
];
function isAdmin(i: Interaction, cfg: GuildConfig): boolean {
  let perms = 0n;
  try { perms = BigInt(i.member?.permissions ?? "0"); } catch { return false; }
  return (perms & 0x8n) !== 0n || (perms & 0x20n) !== 0n || (i.member?.roles ?? []).some((r) => cfg.adminRoleIds.includes(r));
}
const isStaff = (i: Interaction, cfg: GuildConfig) => isAdmin(i, cfg) || (i.member?.roles ?? []).some((r) => cfg.staffRoleIds.includes(r));
const embed = (title: string, description: string, color = 5793266) => ({ title, description, color, footer: { text: "" } });
const BRAND_FOOTER = "Developed by ZeroTech × NISPAX InfoTech";

const v2Text = (content: string, rows: unknown[] = [], accent_color = 5793266) => {
  const hasFooter = content.includes(BRAND_FOOTER);
  const body = content.replace(/\n\n(?:Developed by ZeroTech × NISPAX InfoTech|Developed by ZeroTech × NISPAX InfoTech)$/, "");
  return {
    flags: 32768,
    components: [{
      type: 17,
      accent_color,
      components: [
        { type: 10, content: body },
        ...rows,
        ...(hasFooter ? [{ type: 10, content: BRAND_FOOTER }] : []),
      ],
    }],
    allowed_mentions: { parse: [] },
  };
};
const v2Row = (...components: unknown[]) => ({ type: 1, components });

function panelPayload(cfg: GuildConfig) {
  const active = (cfg.buttons ?? []).filter((b) => b.enabled).slice(0, 125);
  const components: Array<Record<string, unknown>> = [
    { type: 10, content: "## 🎫 Support Tickets\nNeed help? Choose the option that best matches your issue and our team will assist you.\n\n🔒 Your ticket will be private to you and the support team." },
  ];
  if (active.length === 0) active.push({ id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true });
  if (active.length <= 25) {
    const controls = active.map((b) => button(`ticket:open:${b.id}`, `${b.emoji ? `${b.emoji} ` : ""}${b.label}`.slice(0, 80), b.style));
    for (let n = 0; n < controls.length; n += 5) components.push(row(...controls.slice(n, n + 5)));
  } else {
    for (let offset = 0; offset < active.length; offset += 25) {
      const group = active.slice(offset, offset + 25);
      components.push(row({ type: 3, custom_id: `ticket:select:${Math.floor(offset / 25)}`, placeholder: `Choose a ticket type (${offset + 1}-${offset + group.length})`, min_values: 1, max_values: 1, options: group.map((b) => ({ label: b.label.slice(0, 100), value: b.id, ...(b.emoji ? { emoji: { name: b.emoji } } : {}) })) }));
    }
  }
  // Keep attribution as the final component, after every ticket button/select row.
  components.push({ type: 10, content: BRAND_FOOTER });
  return { flags: 32768, components: [{ type: 17, accent_color: 5793266, components }], allowed_mentions: { parse: [] } };
}
async function log(cfg: GuildConfig, title: string, description: string) {
  if (!cfg.logChannelId) return;
  await discordRequest(`/channels/${cfg.logChannelId}/messages`, { method: "POST", body: JSON.stringify(v2Text(`### ${title}\n${description}`, [], 5793266)) }).catch((err) => console.error("[relay log]", err));
}
type DiscordMessage = { id: string; author?: { id?: string; username?: string; global_name?: string; bot?: boolean }; content?: string; timestamp?: string; attachments?: Array<{ url: string; filename: string }>; embeds?: Array<{ title?: string; description?: string }>  };
async function deliverTranscript(cfg: GuildConfig, channelId: string, ownerId: string): Promise<void> {
  if (!cfg.transcriptsEnabled || !cfg.transcriptChannelId) return;
  // Keep export fast enough to finish within Discord's interaction deadline.
  const newestFirst = await discordRequest<DiscordMessage[]>(`/channels/${channelId}/messages?limit=100`);
  const ordered = [...newestFirst].reverse();
  const date = (value?: string) => {
    if (!value) return "Unknown time";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace("T", " ").replace("Z", " UTC");
  };
  const lines = [
    "WINDY SUPPORT TICKET TRANSCRIPT",
    "=".repeat(72),
    `Ticket channel: #${channelId}`,
    `Ticket owner: ${ownerId}`,
    `Exported: ${new Date().toISOString()}`,
    `Messages included: ${ordered.length}`,
    newestFirst.length === 100 ? "NOTE: Discord export includes the latest 100 messages." : "",
    "=".repeat(72),
    "",
  ].filter((line) => line !== undefined);
  for (const m of ordered) {
    const author = m.author?.global_name ?? m.author?.username ?? "Unknown user";
    lines.push(`[${date(m.timestamp)}] ${author}${m.author?.username ? " (@" + m.author.username + ")" : ""}${m.author?.id ? " [ID: " + m.author.id + "]" : ""}`);
    if (m.author?.bot) lines.push("  [BOT MESSAGE]");
    lines.push(m.content?.trim() || (m.attachments?.length ? "[No text content]" : "[Empty message]"));
    for (const e of m.embeds ?? []) {
      if (e.title) lines.push(`  [EMBED TITLE] ${e.title}`);
      if (e.description) lines.push(`  [EMBED] ${e.description}`);
    }
    if (cfg.transcriptIncludeAttachments) {
      for (const attachment of m.attachments ?? []) {
        lines.push(`  [ATTACHMENT] ${attachment.filename}: ${attachment.url}`);
      }
    }
    lines.push("");
  }
  const textContent = lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
  const filename = `windy-transcript-${channelId}-${new Date().toISOString().slice(0, 10)}.txt`;
  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content: `📄 **Ticket transcript** — <#${channelId}> (owner <@${ownerId}>)`,
    allowed_mentions: { parse: [] },
  }));
  form.append("files[0]", new Blob([textContent], { type: "text/plain; charset=utf-8" }), filename);
  await discordRequest(`/channels/${cfg.transcriptChannelId}/messages`, { method: "POST", body: form });
}
async function openTicket(i: Interaction, cfg: GuildConfig, buttonId = "general") {
  const ticketButton = (cfg.buttons ?? []).find((b) => b.id === buttonId && b.enabled) ?? (buttonId === "general" ? { id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true } : null);
  if (!ticketButton) return response("That ticket option is no longer available. Ask an administrator to update the panel.");
  const guildId = i.guild_id!;
  const uid = userId(i);
  if (!uid) return response("I couldn't identify your Discord account.");
  const existing = cfg.tickets.find((t) => t.ownerId === uid && t.status === "open");
  if (existing) return response(`You already have an open ticket: <#${existing.channelId}>`);
  // Keep Discord username underscores intact. Do not infer ticket numbers from channel-name suffixes:
  // usernames can themselves end in digits (e.g. "nishit_2009").
  const safeName = username(i).toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 70) || "user";
  const ticketNumber = cfg.tickets.length + 1;
  const channelName = `ticket-${safeName}-${ticketNumber}`.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 100);
  const overwrites: Array<Record<string, unknown>> = [
    { id: guildId, type: 0, deny: "1024" },
    { id: uid, type: 1, allow: "68608" },
  ];
  const botId = process.env.DISCORD_APPLICATION_ID;
  if (botId) overwrites.push({ id: botId, type: 1, allow: "3072" });
  for (const roleId of [...new Set([...cfg.staffRoleIds, ...ticketButton.staffRoleIds])]) overwrites.push({ id: roleId, type: 0, allow: "3072" });
  for (const roleId of cfg.adminRoleIds) overwrites.push({ id: roleId, type: 0, allow: "3072" });
  const created = await discordRequest<{ id: string; name: string }>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name: channelName.slice(0, 100), type: 0, ...(cfg.categoryId ? { parent_id: cfg.categoryId } : {}), topic: `Windy ticket • owner:${uid}`, permission_overwrites: overwrites }),
  });
  const ticket: TicketRecord = { channelId: created.id, ownerId: uid, claimedBy: null, status: "open", createdAt: new Date().toISOString(), originalChannelName: created.name };
  cfg.tickets.push(ticket);
  try {
    await writeJson(configPath(guildId), cfg);
    const ticketPanel = await discordRequest<{ id: string }>(`/channels/${created.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        ...v2Text(`## 🎫 ${ticketButton.label}\n<@${uid}> ${ticketButton.openingMessage || "Thanks for contacting support! Please describe your issue below."}\n\n> 🔒 Private support channel\n> Staff can claim this ticket or close it when resolved.\n\nDeveloped by ZeroTech × NISPAX InfoTech`, [
          v2Row(button(`ticket:claim:${created.id}`, "Claim Ticket", 3), button(`ticket:close:${created.id}`, "Close Ticket", 4)),
          userSelect(`ticket:addmember:${created.id}`, "Add members to this ticket"),
          userSelect(`ticket:removemember:${created.id}`, "Remove members from this ticket"),
        ], 5793266),
        allowed_mentions: { parse: [], users: [uid] },
      }),
    });
    try {
      await discordRequest(`/channels/${created.id}/pins/${ticketPanel.id}`, { method: "PUT" });
    } catch (pinError) {
      console.error("[relay ticket panel pin]", {
        guildId,
        channelId: created.id,
        messageId: ticketPanel.id,
        error: pinError instanceof Error ? pinError.message : String(pinError),
      });
    }
  } catch (error) {
    cfg.tickets = cfg.tickets.filter((t) => t.channelId !== created.id);
    await writeJson(configPath(guildId), cfg).catch((rollbackError) => console.error("[relay ticket rollback]", rollbackError));
    await discordRequest(`/channels/${created.id}`, { method: "DELETE" }).catch((rollbackError) => console.error("[relay channel rollback]", rollbackError));
    throw error;
  }
  await log(cfg, "Ticket Opened", `Ticket <#${created.id}> opened by <@${uid}>.`);
  return response(`Your ticket has been created: <#${created.id}>`);
}

export async function handleHttpInteraction(i: Interaction): Promise<unknown> {
  if (i.type === 1) return { type: 1 };
  const guildId = i.guild_id;
  if (!guildId) return response("Windy commands can only be used inside a server.");
  const cfg = await readJson<GuildConfig>(configPath(guildId), defaults(guildId));
  const data = i.data ?? {};
  if (i.type === 2 && data.name === "ticket") {
    const subcommand = data.options?.[0];
    const sub = subcommand?.name;
    const options = subcommand?.options ?? [];
    if (!isAdmin(i, cfg)) return response("Only server administrators or configured ticket admins can configure Windy.");
    if (sub === "setup") return response("**Windy Setup**\nChoose the parent category for new tickets, then choose where the public ticket panel should be posted. You can rerun `/ticket setup` any time.", true, [
      channelSelect("config:category_select", "Select ticket parent category", [4]),
      channelSelect("config:panel_channel_select", "Select panel destination channel", [0]),
      row(button("config:panel_send", "Publish / Update Panel", 1)),
    ]);
    if (sub === "config") return response(`**Windy Configuration**\n• Ticket category: ${cfg.categoryId ? `<#${cfg.categoryId}>` : "not configured"}\n• Panel channel: ${cfg.panelChannelId ? `<#${cfg.panelChannelId}>` : "not configured"}\n• Logging channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not configured"}\n• Transcript channel: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "not configured"}\n• Transcripts enabled: ${cfg.transcriptsEnabled ? "yes" : "no"}\n• Admin roles: ${cfg.adminRoleIds.length}\n• Staff roles: ${cfg.staffRoleIds.length}\n• Open tickets tracked: ${cfg.tickets.filter((t) => t.status === "open").length}`);
    if (sub === "panel") {
      const action = options.find((o) => o.name === "action")?.value;
      if (action === "preview") return { type: 4, data: { ...panelPayload(cfg), flags: 32768 | 64 } };
      const channelOpt = options.find((o) => o.name === "channel")?.value;
      const channelId = typeof channelOpt === "string" ? channelOpt : cfg.panelChannelId ?? i.channel_id;
      if (!channelId) return response("Choose a panel channel with `/ticket setup` first.");
      const payload = panelPayload(cfg);
      let messageId = cfg.panelMessageId;
      if (cfg.panelChannelId === channelId && messageId) await discordRequest(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else {
        const sent = await discordRequest<{ id: string }>(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(payload) });
        messageId = sent.id;
      }
      cfg.panelChannelId = channelId; cfg.panelMessageId = messageId ?? null;
      await writeJson(configPath(guildId), cfg);
      let pinNotice = "";
      if (messageId) {
        try {
          await discordRequest(`/channels/${channelId}/pins/${messageId}`, { method: "PUT" });
        } catch (error) {
          pinNotice = " The panel was published, but I couldn't pin it; check that Windy has Manage Messages permission in that channel.";
          console.error("[relay panel pin]", { guildId, channelId, messageId, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return response(`Ticket panel published in <#${channelId}>.${pinNotice}`);
    }
    if (sub === "reset") {
      cfg.categoryId = null; cfg.panelChannelId = null; cfg.panelMessageId = null; cfg.logChannelId = null; cfg.transcriptChannelId = null; cfg.transcriptsEnabled = false; cfg.transcriptIncludeAttachments = true; cfg.adminRoleIds = []; cfg.staffRoleIds = []; cfg.buttons = [{ id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true }];
      await writeJson(configPath(guildId), cfg);
      return response("Windy configuration reset. Existing ticket channels have not been deleted.");
    }
    if (sub === "staff") return response("**Staff Role Manager**\nSelect global staff roles. Staff can claim tickets and access ticket channels.", true, [roleSelect("config:staff_roles_select", "Select support staff roles"), roleSelect("config:admin_roles_select", "Select ticket admin roles")]);
    if (sub === "logs") return response("**Logging Settings**\nSelect a channel for ticket lifecycle logs.", true, [channelSelect("config:log_channel_select", "Select logging channel", [0])]);
    if (sub === "transcripts") return response(`**Transcript Settings**\n• Enabled: ${cfg.transcriptsEnabled ? "yes" : "no"}\n• Destination: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "not set"}\n• Include attachments: ${cfg.transcriptIncludeAttachments ? "yes" : "no"}\n\nWhen enabled, Windy captures the latest 100 messages on ticket close and sends them to the selected channel.`, true, [
      channelSelect("config:transcript_channel_select", "Select transcript destination", [0]),
      row(button("config:transcript_toggle", cfg.transcriptsEnabled ? "Disable Transcripts" : "Enable Transcripts", cfg.transcriptsEnabled ? 4 : 3), button("config:transcript_attachments_toggle", cfg.transcriptIncludeAttachments ? "Exclude Attachments" : "Include Attachments")),
    ]);
    if (sub === "buttons") return response(`**Ticket Button Manager**\n${(cfg.buttons ?? []).map((b, n) => `${n + 1}. ${b.enabled ? "🟢" : "⚪"} ${b.emoji ?? ""} **${b.label}** — ${b.id}`).join("\n") || "No buttons configured."}\n\nAdd ticket types, select any type to edit/reorder/enable/delete it, then publish the panel.`, true, [row(button("buttons:add-custom", "➕ Add Custom", 1), button("buttons:add:general", "Add General"), button("buttons:add:billing", "Add Billing"), button("buttons:add:technical", "Add Technical")), ...((cfg.buttons ?? []).length ? [stringSelect("buttons:select", "Choose a ticket type to manage", (cfg.buttons ?? []).map((b) => ({ label: b.label, value: b.id, description: `${b.enabled ? "Enabled" : "Disabled"} · ${b.id}` })))] : []), row(button("buttons:publish", "Publish / Update Panel", 1))]);
    return response("Unknown /ticket subcommand.");
  }
  if (i.type === 5) {
    const customId = data.custom_id ?? "";
    if (customId === "buttons:add-submit") {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can add panel buttons.");
      const fields = new Map((data.components ?? []).flatMap((r) => r.components ?? []).map((c) => [c.custom_id ?? "", c.value ?? ""]));
      const label = (fields.get("label") ?? "").trim().slice(0, 80);
      if (!label) return response("Button label cannot be empty.");
      if ((cfg.buttons ?? []).length >= 125) return response("Windy supports up to 125 ticket types on a panel.");
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || `type-${Date.now()}`;
      if ((cfg.buttons ?? []).some((b) => b.id === id)) return response("A button with a similar name already exists. Choose a different label.");
      const styleValue = Number(fields.get("style") ?? "1");
      cfg.buttons.push({ id, label, emoji: fields.get("emoji")?.trim().slice(0, 20) || null, style: [1, 2, 3, 4].includes(styleValue) ? styleValue : 1, channelName: (fields.get("channel_name") ?? "ticket-{username}").trim().slice(0, 90) || "ticket-{username}", openingMessage: (fields.get("opening_message") ?? "Thanks for reaching out! Support will be with you shortly.").trim().slice(0, 1500), staffRoleIds: [], enabled: true });
      await writeJson(configPath(guildId), cfg);
      return response(`Added ticket type **${label}**. Use /ticket buttons to publish the updated panel.`);
    }
    if (!customId.startsWith("buttons:edit-submit:")) return response("Unknown Windy form.");
    if (!customId.startsWith("buttons:edit-submit:")) return response("Unknown Windy form.");
    if (!isAdmin(i, cfg)) return response("Only ticket administrators can edit panel buttons.");
    const id = customId.split(":")[2];
    const target = (cfg.buttons ?? []).find((b) => b.id === id);
    if (!target) return response("Button not found.");
    const fields = new Map((data.components ?? []).flatMap((r) => r.components ?? []).map((c) => [c.custom_id ?? "", c.value ?? ""]));
    const label = (fields.get("label") ?? target.label).trim().slice(0, 80);
    if (!label) return response("Button label cannot be empty.");
    target.label = label;
    target.channelName = (fields.get("channel_name") ?? target.channelName).trim().slice(0, 90) || target.channelName;
    target.openingMessage = (fields.get("opening_message") ?? target.openingMessage).trim().slice(0, 1500) || target.openingMessage;
    const style = Number(fields.get("style"));
    if ([1, 2, 3, 4].includes(style)) target.style = style;
    await writeJson(configPath(guildId), cfg);
    return response(`Updated "${target.label}". Set its staff roles below, then use /ticket buttons to republish the panel.`, true, [roleSelect(`buttons:staff:${id}`, "Select staff roles for this ticket type")]);
  }
  if (i.type === 3) {
    const customId = data.custom_id ?? "";
    if (customId.startsWith("config:")) {
      if (!isAdmin(i, cfg)) return response("Only server administrators or configured ticket admins can change Windy settings.");
      if (customId === "config:admin_roles_select" || customId === "config:staff_roles_select") {
        const selected = data.values ?? [];
        if (customId === "config:admin_roles_select") cfg.adminRoleIds = selected;
        else cfg.staffRoleIds = selected;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(customId === "config:admin_roles_select" ? `Ticket admin roles updated (${selected.length}).` : `Support staff roles updated (${selected.length}).`, [
          roleSelect("config:admin_roles_select", "Select ticket admin roles"),
          roleSelect("config:staff_roles_select", "Select support staff roles"),
        ]);
      }
      if (customId === "config:log_channel_select") {
        const selected = data.values?.[0];
        if (!selected) return response("Select a logging channel.");
        cfg.logChannelId = selected;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(`Logging channel set to <#${selected}>.`);
      }
      if (customId === "config:transcript_channel_select") {
        const selected = data.values?.[0];
        if (!selected) return response("Select a transcript destination channel.");
        cfg.transcriptChannelId = selected;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(`Transcript destination saved as <#${selected}>.`);
      }
      if (customId === "config:transcript_toggle") {
        cfg.transcriptsEnabled = !cfg.transcriptsEnabled;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(`Transcript delivery ${cfg.transcriptsEnabled ? "enabled" : "disabled"}.`, [
          channelSelect("config:transcript_channel_select", "Select transcript destination", [0]),
          row(button("config:transcript_toggle", cfg.transcriptsEnabled ? "Disable Transcripts" : "Enable Transcripts", cfg.transcriptsEnabled ? 4 : 3), button("config:transcript_attachments_toggle", cfg.transcriptIncludeAttachments ? "Exclude Attachments" : "Include Attachments")),
        ]);
      }
      if (customId === "config:transcript_attachments_toggle") {
        cfg.transcriptIncludeAttachments = !cfg.transcriptIncludeAttachments;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(`Transcript attachment preference saved: ${cfg.transcriptIncludeAttachments ? "included" : "excluded"}. Export is not active yet.`);
      }
      if (customId === "config:show_config") {
        return updateResponse(`**Windy Configuration**\n• Ticket category: ${cfg.categoryId ? `<#${cfg.categoryId}>` : "not configured"}\n• Panel channel: ${cfg.panelChannelId ? `<#${cfg.panelChannelId}>` : "not configured"}\n• Logging channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not configured"}\n• Admin roles: ${cfg.adminRoleIds.length}\n• Staff roles: ${cfg.staffRoleIds.length}\n• Open tickets: ${cfg.tickets.filter((t) => t.status === "open").length}`);
      }
      if (customId === "config:category_select" || customId === "config:panel_channel_select") {
        const selected = data.values?.[0];
        if (!selected) return response("No channel selected.");
        if (customId === "config:category_select") cfg.categoryId = selected;
        else cfg.panelChannelId = selected;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(customId === "config:category_select" ? `Ticket parent category set to <#${selected}>.` : `Panel destination set to <#${selected}>.`, [
          channelSelect("config:category_select", "Select ticket parent category", [4]),
          channelSelect("config:panel_channel_select", "Select panel destination channel", [0]),
          row(button("config:panel_send", "Publish / Update Panel", 1)),
        ]);
      }
      if (customId === "config:panel_send") {
        if (!cfg.panelChannelId) return response("Select a panel channel first.");
        const payload = panelPayload(cfg);
        let messageId = cfg.panelMessageId;
        if (messageId) await discordRequest(`/channels/${cfg.panelChannelId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify(payload) });
        else {
          const sent = await discordRequest<{ id: string }>(`/channels/${cfg.panelChannelId}/messages`, { method: "POST", body: JSON.stringify(payload) });
          messageId = sent.id;
        }
        cfg.panelMessageId = messageId ?? null;
        await writeJson(configPath(guildId), cfg);
        let pinNotice = "";
        if (messageId) {
          try {
            await discordRequest(`/channels/${cfg.panelChannelId}/pins/${messageId}`, { method: "PUT" });
          } catch (error) {
            pinNotice = " The panel was published, but I couldn't pin it; check that Windy has Manage Messages permission in that channel.";
            console.error("[relay panel pin]", { guildId, channelId: cfg.panelChannelId, messageId, error: error instanceof Error ? error.message : String(error) });
          }
        }
        return updateResponse(`Panel published in <#${cfg.panelChannelId}>.${pinNotice}`);
      }
    }
    if (customId === "ticket:open" || customId.startsWith("ticket:open:")) return await openTicket(i, cfg, customId.split(":")[2] || "general");
    if (customId.startsWith("ticket:select:") && data.values?.[0]) return await openTicket(i, cfg, data.values[0]);
    if (customId.startsWith("buttons:staff:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can configure ticket-type staff roles.");
      const id = customId.split(":")[2];
      const target = (cfg.buttons ?? []).find((b) => b.id === id);
      if (!target) return response("Button not found.");
      target.staffRoleIds = data.values ?? [];
      await writeJson(configPath(guildId), cfg);
      return updateResponse(`Staff roles saved for ${target.label} (${target.staffRoleIds.length} role(s)).`);
    }
    if (customId === "buttons:add-custom") {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can add panel buttons.");
      return { type: 9, data: { custom_id: "buttons:add-submit", title: "Add Ticket Type", components: [
        { type: 1, components: [{ type: 4, custom_id: "label", label: "Button label", style: 1, required: true, max_length: 80 }] },
        { type: 1, components: [{ type: 4, custom_id: "emoji", label: "Emoji (optional)", style: 1, required: false, max_length: 20 }] },
        { type: 1, components: [{ type: 4, custom_id: "channel_name", label: "Channel name ({username})", style: 1, required: false, max_length: 90, value: "ticket-{username}" }] },
        { type: 1, components: [{ type: 4, custom_id: "opening_message", label: "Opening message", style: 2, required: false, max_length: 1500, value: "Thanks for reaching out! Support will be with you shortly." }] },
        { type: 1, components: [{ type: 4, custom_id: "style", label: "Style 1=blue, 2=grey, 3=green, 4=red", style: 1, required: true, max_length: 1, value: "1" }] },
      ] } };
    }
    if (customId.startsWith("buttons:edit:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can add panel buttons.");
      return { type: 9, data: { custom_id: "buttons:add-submit", title: "Add Ticket Type", components: [
        { type: 1, components: [{ type: 4, custom_id: "label", label: "Button label", style: 1, required: true, max_length: 80 }] },
        { type: 1, components: [{ type: 4, custom_id: "emoji", label: "Emoji (optional)", style: 1, required: false, max_length: 20 }] },
        { type: 1, components: [{ type: 4, custom_id: "channel_name", label: "Channel name ({username})", style: 1, required: false, max_length: 90, value: "ticket-{username}" }] },
        { type: 1, components: [{ type: 4, custom_id: "opening_message", label: "Opening message", style: 2, required: false, max_length: 1500, value: "Thanks for reaching out! Support will be with you shortly." }] },
        { type: 1, components: [{ type: 4, custom_id: "style", label: "Style 1=blue, 2=grey, 3=green, 4=red", style: 1, required: true, max_length: 1, value: "1" }] },
      ] } };
    }
    if (customId.startsWith("buttons:edit:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can edit panel buttons.");
      const id = customId.split(":")[2];
      const target = (cfg.buttons ?? []).find((b) => b.id === id);
      if (!target) return response("Button not found.");
      return { type: 9, data: { custom_id: `buttons:edit-submit:${id}`, title: `Edit ${target.label}`.slice(0, 45), components: [
        { type: 1, components: [{ type: 4, custom_id: "label", label: "Button label", style: 1, required: true, max_length: 80, value: target.label }] },
        { type: 1, components: [{ type: 4, custom_id: "emoji", label: "Emoji (optional)", style: 1, required: false, max_length: 20, value: target.emoji ?? "" }] },
        { type: 1, components: [{ type: 4, custom_id: "channel_name", label: "Channel name ({username})", style: 1, required: false, max_length: 90, value: target.channelName }] },
        { type: 1, components: [{ type: 4, custom_id: "opening_message", label: "Opening message", style: 2, required: false, max_length: 1500, value: target.openingMessage }] },
        { type: 1, components: [{ type: 4, custom_id: "style", label: "Style 1=blue, 2=grey, 3=green, 4=red", style: 1, required: true, max_length: 1, value: String(target.style) }] },
      ] } };
    }
    if (customId.startsWith("buttons:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can manage panel buttons.");
      const [, action, value] = customId.split(":");
      cfg.buttons ??= [];
      if (action === "select") {
        const selectedId = data.values?.[0];
        const selected = cfg.buttons.find((b) => b.id === selectedId);
        if (!selected) return response("Button not found.");
        return updateResponse(`**${selected.emoji ?? "🔘"} ${selected.label}**\nStatus: ${selected.enabled ? "Enabled" : "Disabled"}\nChannel format: \`${selected.channelName}\``, [row(button(`buttons:edit:${selected.id}`, "Edit", 1), button(`buttons:up:${selected.id}`, "Move Up"), button(`buttons:down:${selected.id}`, "Move Down"), button(`buttons:toggle:${selected.id}`, selected.enabled ? "Disable" : "Enable", selected.enabled ? 4 : 3), button(`buttons:delete:${selected.id}`, "Delete", 4)), row(button("buttons:publish", "Publish / Update Panel", 1))]);
      }
      if (action === "add") {
        if (cfg.buttons.length >= 125) return response("Windy supports up to 125 ticket types.");
        if (cfg.buttons.some((b) => b.id === value)) return response("That button type already exists.");
        const presets: Record<string, Omit<TicketButton, "enabled">> = {
          general: { id: "general", label: "General Support", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [] },
          billing: { id: "billing", label: "Billing Support", emoji: "💳", style: 2, channelName: "billing-{username}", openingMessage: "Please describe your billing question and include relevant details.", staffRoleIds: [] },
          technical: { id: "technical", label: "Technical Support", emoji: "🛠️", style: 3, channelName: "technical-{username}", openingMessage: "Please describe the technical issue and what you have tried.", staffRoleIds: [] },
        };
        const preset = presets[value]; if (!preset) return response("Unknown ticket button preset."); cfg.buttons.push({ ...preset, enabled: true });
      } else if (action === "toggle") { const b = cfg.buttons.find((x) => x.id === value); if (!b) return response("Button not found."); b.enabled = !b.enabled; }
      else if (action === "up" || action === "down") { const idx = cfg.buttons.findIndex((b) => b.id === value); if (idx < 0) return response("Button not found."); const next = action === "up" ? idx - 1 : idx + 1; if (next >= 0 && next < cfg.buttons.length) [cfg.buttons[idx], cfg.buttons[next]] = [cfg.buttons[next], cfg.buttons[idx]]; }
      else if (action === "delete") { if (cfg.buttons.length <= 1) return response("Keep at least one ticket button configured."); cfg.buttons = cfg.buttons.filter((b) => b.id !== value); }
      else if (action === "publish") {
        if (!cfg.panelChannelId) return response("Select a panel channel with `/ticket setup` first.");
        const payload = panelPayload(cfg); let mid = cfg.panelMessageId;
        if (mid) { try { await discordRequest(`/channels/${cfg.panelChannelId}/messages/${mid}`, { method: "PATCH", body: JSON.stringify(payload) }); } catch { const sent = await discordRequest<{id:string}>(`/channels/${cfg.panelChannelId}/messages`, { method: "POST", body: JSON.stringify(payload) }); mid = sent.id; } }
        else { const sent = await discordRequest<{id:string}>(`/channels/${cfg.panelChannelId}/messages`, { method: "POST", body: JSON.stringify(payload) }); mid = sent.id; }
        cfg.panelMessageId = mid ?? null;
        if (mid) {
          try {
            await discordRequest(`/channels/${cfg.panelChannelId}/pins/${mid}`, { method: "PUT" });
          } catch (error) {
            console.error("[relay panel pin]", { guildId, channelId: cfg.panelChannelId, messageId: mid, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      await writeJson(configPath(guildId), cfg);
      return updateResponse(`Ticket buttons updated.\n${cfg.buttons.map((b,n)=>`${n+1}. ${b.enabled ? "🟢" : "⚪"} ${b.label}`).join("\n")}`, [row(button("buttons:add:general", "Add General", 1), button("buttons:add:billing", "Add Billing"), button("buttons:add:technical", "Add Technical")), ...cfg.buttons.slice(0,4).map((b)=>row(button(`buttons:toggle:${b.id}`, `${b.enabled ? "Disable" : "Enable"}: ${b.label}`.slice(0,80), b.enabled ? 4 : 3), button(`buttons:delete:${b.id}`, "Delete", 4))), row(button("buttons:publish", "Publish / Update Panel", 1))]);
    }
    if (customId.startsWith("ticket:")) {
      const [, action, channelId] = customId.split(":");
      const ticket = cfg.tickets.find((t) => t.channelId === channelId);
      if (!ticket) return response("This ticket is not tracked by Windy.");
      if (ticket.status !== "open" && action !== "reopen" && action !== "delete") return response("This ticket is closed. Reopen it before using ticket controls.");
      const uid = userId(i);
      if (action === "removemember") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can remove ticket members.");
        const selected = data.values ?? [];
        if (!selected.length) return response("Select at least one member.");
        if (selected.includes(ticket.ownerId)) return response("The ticket creator cannot be removed from their own ticket.");
        const current = await discordRequest<{ permission_overwrites?: Array<{ id: string; type: number; allow?: string; deny?: string }> }>(`/channels/${channelId}`);
        const overwrites = (current.permission_overwrites ?? []).filter((o) => !(o.type === 1 && selected.includes(o.id)));
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ permission_overwrites: overwrites }) });
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`### 👤 Members Removed\nRemoved from this ticket: ${selected.map((id) => `<@${id}>`).join(", ")}.`, [], 15548997), allowed_mentions: { parse: [], users: selected } }) });
        await log(cfg, "Ticket Members Removed", `${selected.map((id) => `<@${id}>`).join(", ")} removed from <#${channelId}> by <@${uid}>.`);
        return response(`Removed ${selected.length} member(s) from the ticket.`);
      }
      if (action === "addmember") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can add members to this ticket.");
        const selected = data.values ?? [];
        if (!selected.length) return response("Select at least one member.");
        const current = await discordRequest<{ permission_overwrites?: Array<{ id: string; type: number; allow?: string; deny?: string }> }>(`/channels/${channelId}`);
        const overwrites = (current.permission_overwrites ?? []).filter((o) => !selected.includes(o.id));
        for (const memberId of selected) overwrites.push({ id: memberId, type: 1, allow: "3072" });
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ permission_overwrites: overwrites }) });
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`### 👤 Members Added\nAdded to this ticket: ${selected.map((id) => `<@${id}>`).join(", ")}.`, [], 5763719), allowed_mentions: { parse: [], users: selected } }) });
        await log(cfg, "Ticket Members Added", `${selected.map((id) => `<@${id}>`).join(", ")} added to <#${channelId}> by <@${uid}>.`);
        return response(`Added ${selected.length} member(s) to the ticket.`);
      }
      if (action === "unclaim") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can unclaim tickets.");
        if (ticket.claimedBy !== uid) return response("Only the staff member who claimed this ticket can unclaim it.");
        ticket.claimedBy = null;
        await writeJson(configPath(guildId), cfg);
        if (i.message?.id && i.channel_id) {
          await discordRequest(`/channels/${i.channel_id}/messages/${i.message.id}`, { method: "PATCH", body: JSON.stringify({
            ...v2Text(`## 🎫 Ticket Controls\nThis ticket is currently unclaimed. A staff member can claim it when ready.\n\nDeveloped by ZeroTech × NISPAX InfoTech`, [
              v2Row(button(`ticket:claim:${channelId}`, "Claim Ticket", 3), button(`ticket:close:${channelId}`, "Close Ticket", 4)),
              userSelect(`ticket:addmember:${channelId}`, "Add members to this ticket"),
              userSelect(`ticket:removemember:${channelId}`, "Remove members from this ticket"),
            ]),
          }) });
        }
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`### Ticket Unclaimed\n<@${uid}> released this ticket back to the support team.`, [], 5793266), allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Unclaimed", `Ticket <#${channelId}> unclaimed by <@${uid}>.`);
        return response("Ticket unclaimed.");
      }
      if (action === "claim") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can claim tickets.");
        if (ticket.claimedBy && ticket.claimedBy !== uid) return response(`This ticket is already claimed by <@${ticket.claimedBy}>.`);
        if (ticket.claimedBy === uid) return response("You have already claimed this ticket.");
        ticket.claimedBy = uid;
        await writeJson(configPath(guildId), cfg);
        const claimedLabel = button(`ticket:unclaim:${channelId}`, "Unclaim Ticket", 2);
        if (i.message?.id && i.channel_id) {
          const currentContent = i.message.content ?? "";
          const suffix = `\n\nClaimed by ${username(i)}`;
          await discordRequest(`/channels/${i.channel_id}/messages/${i.message.id}`, { method: "PATCH", body: JSON.stringify({
            ...v2Text(`## 🎫 Ticket Controls\n${currentContent.replace(/\n\nClaimed by .*/, "").replace(/^.*?Thanks for contacting support!/, "Thanks for contacting support!")}\n\n> 🟢 Claimed by <@${uid}>\n\nDeveloped by ZeroTech × NISPAX InfoTech`, [
              v2Row(claimedLabel, button(`ticket:close:${channelId}`, "Close Ticket", 4)),
              userSelect(`ticket:addmember:${channelId}`, "Add members to this ticket"),
              userSelect(`ticket:removemember:${channelId}`, "Remove members from this ticket"),
            ]),
            allowed_mentions: { parse: [], users: [uid] },
          }) });
        }
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`### Ticket Claimed\n<@${uid}> (${username(i)}) is handling this ticket.`, [], 5763719), allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Claimed", `Ticket <#${channelId}> claimed by <@${uid}>.`);
        return response("Ticket claimed.");
      }
      if (action === "delete") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can delete ticket channels.");
        await log(cfg, "Ticket Channel Deleted", `Ticket channel #${ticket.originalChannelName ?? channelId} deleted by <@${uid}>.`);
        cfg.tickets = cfg.tickets.filter((t) => t.channelId !== channelId);
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}`, { method: "DELETE" });
        return response("Ticket channel deleted.");
      }
      if (action === "reopen") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can reopen this ticket.");
        ticket.status = "open";
        const reopenOverwrites = [{ id: guildId, type: 0, deny: "1024" }, { id: ticket.ownerId, type: 1, allow: "3072" }, ...[...new Set([...cfg.staffRoleIds, ...cfg.adminRoleIds])].map((id) => ({ id, type: 0, allow: "3072" }))];
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ name: ticket.originalChannelName ?? `ticket-${ticket.ownerId.slice(-6)}`, permission_overwrites: reopenOverwrites }) });
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`## 🔓 Ticket Reopened\nReopened by <@${uid}>. The conversation can continue below.\n\nDeveloped by ZeroTech × NISPAX InfoTech`, [
          v2Row(button(`ticket:claim:${channelId}`, "Claim Ticket", 3), button(`ticket:close:${channelId}`, "Close Ticket", 4)),
          userSelect(`ticket:addmember:${channelId}`, "Add members to this ticket"),
          userSelect(`ticket:removemember:${channelId}`, "Remove members from this ticket"),
        ], 5763719), allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Reopened", `Ticket <#${channelId}> reopened by <@${uid}>.`);
        return response("Ticket reopened.");
      }
      if (action === "close") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can close this ticket.");
        await deliverTranscript(cfg, channelId, ticket.ownerId).catch((err) => console.error("[relay transcript]", err));
        ticket.status = "closed";
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ ...v2Text(`## 🔒 Ticket Closed\nClosed by <@${uid}>. This ticket is now read-only for the ticket creator.\n\nYou can reopen it if more help is needed, or delete the channel when finished.\n\nDeveloped by ZeroTech × NISPAX InfoTech`, [
          v2Row(button(`ticket:reopen:${channelId}`, "Reopen Ticket", 3), button(`ticket:delete:${channelId}`, "Delete Channel", 4)),
        ], 15548997), allowed_mentions: { parse: [], users: [uid] } }) });
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ name: ticket.originalChannelName ?? `ticket-${ticket.ownerId.slice(-6)}`, permission_overwrites: [
          { id: guildId, type: 0, deny: "1024" }, { id: ticket.ownerId, type: 1, deny: "2048" },
          ...cfg.staffRoleIds.map((id) => ({ id, type: 0, allow: "3072" })),
          ...cfg.adminRoleIds.map((id) => ({ id, type: 0, allow: "3072" })),
        ] }) });
        await log(cfg, "Ticket Closed", `Ticket <#${channelId}> closed by <@${uid}>.`);
        return response("Ticket closed.");
      }
    }
    return response("Unknown Windy component.");
  }
  return response("Unsupported Windy interaction.");
}
