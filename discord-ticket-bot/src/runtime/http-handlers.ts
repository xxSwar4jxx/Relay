import { discordRequest } from "./discord-rest";
import { readJson, writeJson } from "./storage";

type Interaction = {
  type: number; id: string; token: string; guild_id?: string; channel_id?: string;
  member?: { user?: { id: string; username?: string }; roles?: string[]; permissions?: string };
  user?: { id: string; username?: string };
  data?: { name?: string; options?: Array<{ name: string; value?: string | number; options?: Array<{ name: string; value?: string | number }> }>; custom_id?: string; values?: string[]; components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }> };
};
type TicketRecord = { channelId: string; ownerId: string; claimedBy: string | null; status: "open" | "closed"; createdAt: string };
type TicketButton = { id: string; label: string; emoji: string | null; style: number; channelName: string; openingMessage: string; staffRoleIds: string[]; enabled: boolean };
type GuildConfig = { guildId: string; categoryId: string | null; panelChannelId: string | null; panelMessageId: string | null; logChannelId: string | null; transcriptChannelId: string | null; transcriptsEnabled: boolean; transcriptIncludeAttachments: boolean; adminRoleIds: string[]; staffRoleIds: string[]; buttons: TicketButton[]; tickets: TicketRecord[] };

const configPath = (guildId: string) => `relay/guilds/${guildId}.json`;
const defaults = (guildId: string): GuildConfig => ({ guildId, categoryId: null, panelChannelId: null, panelMessageId: null, logChannelId: null, transcriptChannelId: null, transcriptsEnabled: false, transcriptIncludeAttachments: true, adminRoleIds: [], staffRoleIds: [], buttons: [{ id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true }], tickets: [] });
const userId = (i: Interaction) => i.member?.user?.id ?? i.user?.id ?? "";
const username = (i: Interaction) => i.member?.user?.username ?? i.user?.username ?? "user";
const response = (content: string, ephemeral = true, components: unknown[] = []) => ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, components } });
const updateResponse = (content: string, components: unknown[] = []) => ({ type: 7, data: { content, components } });
const button = (custom_id: string, label: string, style = 2) => ({ type: 2, style, custom_id, label });
const row = (...components: unknown[]) => ({ type: 1, components });
const channelSelect = (custom_id: string, placeholder: string, channel_types: number[]) => ({ type: 1, components: [{ type: 8, custom_id, placeholder, min_values: 1, max_values: 1, channel_types }] });
const roleSelect = (custom_id: string, placeholder: string) => ({ type: 1, components: [{ type: 6, custom_id, placeholder, min_values: 0, max_values: 10 }] });
const userSelect = (custom_id: string, placeholder: string) => ({ type: 1, components: [{ type: 5, custom_id, placeholder, min_values: 1, max_values: 5 }] });
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
const embed = (title: string, description: string, color = 5793266) => ({ title, description, color, footer: { text: "Relay • ZeroTech" } });
function panelPayload(cfg: GuildConfig) {
  const active = (cfg.buttons ?? []).filter((b) => b.enabled).slice(0, 25);
  const controls = active.length ? active.map((b) => button(`ticket:open:${b.id}`, `${b.emoji ? `${b.emoji} ` : ""}${b.label}`.slice(0, 80), b.style)) : [button("ticket:open:general", "Open a Ticket", 1)];
  const components = [];
  for (let n = 0; n < controls.length; n += 5) components.push(row(...controls.slice(n, n + 5)));
  return { embeds: [embed("🎫 Support Tickets", "Need help? Click a button below and our team will assist you.\n\nYour ticket will be private to you and the support team.")], components, allowed_mentions: { parse: [] } };
}
async function log(cfg: GuildConfig, title: string, description: string) {
  if (!cfg.logChannelId) return;
  await discordRequest(`/channels/${cfg.logChannelId}/messages`, { method: "POST", body: JSON.stringify({ embeds: [embed(title, description)], allowed_mentions: { parse: [] } }) }).catch((err) => console.error("[relay log]", err));
}
type DiscordMessage = { id: string; author?: { username?: string; global_name?: string; bot?: boolean }; content?: string; timestamp?: string; attachments?: Array<{ url: string; filename: string }> };
async function deliverTranscript(cfg: GuildConfig, channelId: string, ownerId: string): Promise<void> {
  if (!cfg.transcriptsEnabled || !cfg.transcriptChannelId) return;
  const messages = await discordRequest<DiscordMessage[]>(`/channels/${channelId}/messages?limit=100`);
  const ordered = [...messages].reverse();
  const lines = ordered.map((m) => {
    const attachments = cfg.transcriptIncludeAttachments ? (m.attachments ?? []).map((a) => ` [attachment: ${a.filename} ${a.url}]`).join("") : "";
    return `[${m.timestamp ?? "unknown time"}] ${m.author?.global_name ?? m.author?.username ?? "Unknown"}: ${(m.content ?? "").replace(/\n/g, " ")}${attachments}`;
  });
  const header = `Relay transcript for channel ${channelId} (ticket owner ${ownerId})\nMessages captured: ${ordered.length}\n\n`;
  const chunks: string[] = [];
  let current = header;
  for (const line of lines) {
    if (current.length + line.length + 1 > 1800) { chunks.push(current); current = ""; }
    current += line + "\n";
  }
  if (current.trim()) chunks.push(current);
  for (let n = 0; n < chunks.length; n++) {
    await discordRequest(`/channels/${cfg.transcriptChannelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket transcript ${channelId} — part ${n + 1}/${chunks.length}\n${chunks[n].slice(0, 1800)}`, allowed_mentions: { parse: [] } }) });
  }
}
async function openTicket(i: Interaction, cfg: GuildConfig, buttonId = "general") {
  const ticketButton = (cfg.buttons ?? []).find((b) => b.id === buttonId && b.enabled) ?? (buttonId === "general" ? { id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true } : null);
  if (!ticketButton) return response("That ticket option is no longer available. Ask an administrator to update the panel.");
  const guildId = i.guild_id!;
  const uid = userId(i);
  if (!uid) return response("I couldn't identify your Discord account.");
  const existing = cfg.tickets.find((t) => t.ownerId === uid && t.status === "open");
  if (existing) return response(`You already have an open ticket: <#${existing.channelId}>`);
  const safeName = username(i).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "user";
  const channelName = ticketButton.channelName.replace(/\{username\}/g, safeName).replace(/\{user\}/g, uid).replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 90) || `ticket-${safeName}`;
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
    body: JSON.stringify({ name: channelName.slice(0, 100), type: 0, ...(cfg.categoryId ? { parent_id: cfg.categoryId } : {}), topic: `Relay ticket • owner:${uid}`, permission_overwrites: overwrites }),
  });
  const ticket: TicketRecord = { channelId: created.id, ownerId: uid, claimedBy: null, status: "open", createdAt: new Date().toISOString() };
  cfg.tickets.push(ticket);
  try {
    await writeJson(configPath(guildId), cfg);
    await discordRequest(`/channels/${created.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: `<@${uid}> ${ticketButton.openingMessage || "Thanks for contacting support! Please describe your issue below."}\n\nStaff can claim this ticket or close it when resolved.`,
        embeds: [embed("Ticket Controls", "Use the controls below. Claiming is limited to configured staff.")],
        components: [row(button(`ticket:claim:${created.id}`, "Claim", 3), button(`ticket:close:${created.id}`, "Close Ticket", 4)), userSelect(`ticket:addmember:${created.id}`, "Add members to this ticket"), userSelect(`ticket:removemember:${created.id}`, "Remove members from this ticket")],
        allowed_mentions: { parse: [], users: [uid] },
      }),
    });
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
  if (!guildId) return response("Relay commands can only be used inside a server.");
  const cfg = await readJson<GuildConfig>(configPath(guildId), defaults(guildId));
  const data = i.data ?? {};
  if (i.type === 2 && data.name === "ticket") {
    const subcommand = data.options?.[0];
    const sub = subcommand?.name;
    const options = subcommand?.options ?? [];
    if (!isAdmin(i, cfg)) return response("Only server administrators or configured ticket admins can configure Relay.");
    if (sub === "setup") return response("**Relay Setup**\nChoose the parent category for new tickets, then choose where the public ticket panel should be posted. You can rerun `/ticket setup` any time.", true, [
      channelSelect("config:category_select", "Select ticket parent category", [4]),
      channelSelect("config:panel_channel_select", "Select panel destination channel", [0]),
      row(button("config:panel_send", "Publish / Update Panel", 1)),
    ]);
    if (sub === "config") return response(`**Relay Configuration**\n• Ticket category: ${cfg.categoryId ? `<#${cfg.categoryId}>` : "not configured"}\n• Panel channel: ${cfg.panelChannelId ? `<#${cfg.panelChannelId}>` : "not configured"}\n• Logging channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not configured"}\n• Transcript channel: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "not configured"}\n• Transcripts enabled: ${cfg.transcriptsEnabled ? "yes" : "no"}\n• Admin roles: ${cfg.adminRoleIds.length}\n• Staff roles: ${cfg.staffRoleIds.length}\n• Open tickets tracked: ${cfg.tickets.filter((t) => t.status === "open").length}`);
    if (sub === "panel") {
      const action = options.find((o) => o.name === "action")?.value;
      if (action === "preview") return { type: 4, data: { ...panelPayload(cfg), flags: 64 } };
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
      return response(`Ticket panel published in <#${channelId}>.`);
    }
    if (sub === "reset") {
      cfg.categoryId = null; cfg.panelChannelId = null; cfg.panelMessageId = null; cfg.logChannelId = null; cfg.transcriptChannelId = null; cfg.transcriptsEnabled = false; cfg.transcriptIncludeAttachments = true; cfg.adminRoleIds = []; cfg.staffRoleIds = []; cfg.buttons = [{ id: "general", label: "Open a Ticket", emoji: "🎫", style: 1, channelName: "ticket-{username}", openingMessage: "Thanks for contacting support! Please describe your issue below.", staffRoleIds: [], enabled: true }];
      await writeJson(configPath(guildId), cfg);
      return response("Relay configuration reset. Existing ticket channels have not been deleted.");
    }
    if (sub === "staff") return response("**Staff Role Manager**\\nSelect global staff roles. Staff can claim tickets and access ticket channels.", true, [roleSelect("config:staff_roles_select", "Select support staff roles"), roleSelect("config:admin_roles_select", "Select ticket admin roles")]);
    if (sub === "logs") return response("**Logging Settings**\\nSelect a channel for ticket lifecycle logs.", true, [channelSelect("config:log_channel_select", "Select logging channel", [0])]);
    if (sub === "transcripts") return response(`**Transcript Settings**\\n• Enabled: ${cfg.transcriptsEnabled ? "yes" : "no"}\\n• Destination: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "not set"}\\n• Include attachments: ${cfg.transcriptIncludeAttachments ? "yes" : "no"}\\n\\nWhen enabled, Relay captures the latest 100 messages on ticket close and sends them to the selected channel.`, true, [
      channelSelect("config:transcript_channel_select", "Select transcript destination", [0]),
      row(button("config:transcript_toggle", cfg.transcriptsEnabled ? "Disable Transcripts" : "Enable Transcripts", cfg.transcriptsEnabled ? 4 : 3), button("config:transcript_attachments_toggle", cfg.transcriptIncludeAttachments ? "Exclude Attachments" : "Include Attachments")),
    ]);
    if (sub === "buttons") return response(`**Ticket Button Manager**\n${(cfg.buttons ?? []).map((b, n) => `${n + 1}. ${b.enabled ? "🟢" : "⚪"} ${b.emoji ?? ""} **${b.label}** — ${b.id}`).join("\n") || "No buttons configured."}\n\nAdd common ticket types, toggle them, delete them, or republish the panel.`, true, [row(button("buttons:add:general", "Add General", 1), button("buttons:add:billing", "Add Billing"), button("buttons:add:technical", "Add Technical")), ...(cfg.buttons ?? []).slice(0, 4).map((b, idx) => row(button(`buttons:edit:${b.id}`, "Edit", 1), button(`buttons:up:${b.id}`, "↑", 2), button(`buttons:down:${b.id}`, "↓", 2), button(`buttons:toggle:${b.id}`, b.enabled ? "Disable" : "Enable", b.enabled ? 4 : 3), button(`buttons:delete:${b.id}`, "Delete", 4))), row(button("buttons:publish", "Publish / Update Panel", 1))]);
    return response("Unknown /ticket subcommand.");
  }
  if (i.type === 5) {
    const customId = data.custom_id ?? "";
    if (!customId.startsWith("buttons:edit-submit:")) return response("Unknown Relay form.");
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
      if (!isAdmin(i, cfg)) return response("Only server administrators or configured ticket admins can change Relay settings.");
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
        return updateResponse(`**Relay Configuration**\n• Ticket category: ${cfg.categoryId ? `<#${cfg.categoryId}>` : "not configured"}\n• Panel channel: ${cfg.panelChannelId ? `<#${cfg.panelChannelId}>` : "not configured"}\n• Logging channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not configured"}\n• Admin roles: ${cfg.adminRoleIds.length}\n• Staff roles: ${cfg.staffRoleIds.length}\n• Open tickets: ${cfg.tickets.filter((t) => t.status === "open").length}`);
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
        return updateResponse(`Panel published in <#${cfg.panelChannelId}>.`);
      }
    }
    if (customId === "ticket:open" || customId.startsWith("ticket:open:")) return await openTicket(i, cfg, customId.split(":")[2] || "general");
    if (customId.startsWith("buttons:staff:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can configure ticket-type staff roles.");
      const id = customId.split(":")[2];
      const target = (cfg.buttons ?? []).find((b) => b.id === id);
      if (!target) return response("Button not found.");
      target.staffRoleIds = data.values ?? [];
      await writeJson(configPath(guildId), cfg);
      return updateResponse(`Staff roles saved for ${target.label} (${target.staffRoleIds.length} role(s)).`);
    }
    if (customId.startsWith("buttons:edit:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can edit panel buttons.");
      const id = customId.split(":")[2];
      const target = (cfg.buttons ?? []).find((b) => b.id === id);
      if (!target) return response("Button not found.");
      return { type: 9, data: { custom_id: `buttons:edit-submit:${id}`, title: `Edit ${target.label}`.slice(0, 45), components: [
        { type: 1, components: [{ type: 4, custom_id: "label", label: "Button label", style: 1, required: true, max_length: 80, value: target.label }] },
        { type: 1, components: [{ type: 4, custom_id: "channel_name", label: "Channel name ({username})", style: 1, required: false, max_length: 90, value: target.channelName }] },
        { type: 1, components: [{ type: 4, custom_id: "opening_message", label: "Opening message", style: 2, required: false, max_length: 1500, value: target.openingMessage }] },
        { type: 1, components: [{ type: 4, custom_id: "style", label: "Style 1=blue, 2=grey, 3=green, 4=red", style: 1, required: true, max_length: 1, value: String(target.style) }] },
      ] } };
    }
    if (customId.startsWith("buttons:")) {
      if (!isAdmin(i, cfg)) return response("Only ticket administrators can manage panel buttons.");
      const [, action, value] = customId.split(":");
      cfg.buttons ??= [];
      if (action === "add") {
        if (cfg.buttons.length >= 25) return response("Discord panels support at most 25 buttons.");
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
      }
      await writeJson(configPath(guildId), cfg);
      return updateResponse(`Ticket buttons updated.\n${cfg.buttons.map((b,n)=>`${n+1}. ${b.enabled ? "🟢" : "⚪"} ${b.label}`).join("\n")}`, [row(button("buttons:add:general", "Add General", 1), button("buttons:add:billing", "Add Billing"), button("buttons:add:technical", "Add Technical")), ...cfg.buttons.slice(0,4).map((b)=>row(button(`buttons:toggle:${b.id}`, `${b.enabled ? "Disable" : "Enable"}: ${b.label}`.slice(0,80), b.enabled ? 4 : 3), button(`buttons:delete:${b.id}`, "Delete", 4))), row(button("buttons:publish", "Publish / Update Panel", 1))]);
    }
    if (customId.startsWith("ticket:")) {
      const [, action, channelId] = customId.split(":");
      const ticket = cfg.tickets.find((t) => t.channelId === channelId);
      if (!ticket) return response("This ticket is not tracked by Relay.");
      if (ticket.status !== "open" && action !== "reopen") return response("This ticket is closed. Reopen it before using ticket controls.");
      const uid = userId(i);
      if (action === "removemember") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can remove ticket members.");
        const selected = data.values ?? [];
        if (!selected.length) return response("Select at least one member.");
        if (selected.includes(ticket.ownerId)) return response("The ticket creator cannot be removed from their own ticket.");
        const current = await discordRequest<{ permission_overwrites?: Array<{ id: string; type: number; allow?: string; deny?: string }> }>(`/channels/${channelId}`);
        const overwrites = (current.permission_overwrites ?? []).filter((o) => !(o.type === 1 && selected.includes(o.id)));
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ permission_overwrites: overwrites }) });
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Removed from ticket: ${selected.map((id) => `<@${id}>`).join(", ")}.`, allowed_mentions: { parse: [], users: selected } }) });
        await log(cfg, "Ticket Members Removed", `${selected.map((id) => `<@${id}>`).join(", ")} removed from <#${channelId}> by <@${uid}>.`);
        return response(`Removed ${selected.length} member(s) from the ticket.`);
      }
      if (action === "addmember") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can add members.");
        const selected = data.values ?? [];
        if (!selected.length) return response("Select at least one member.");
        const current = await discordRequest<{ permission_overwrites?: Array<{ id: string; type: number; allow?: string; deny?: string }> }>(`/channels/${channelId}`);
        const overwrites = (current.permission_overwrites ?? []).filter((o) => !selected.includes(o.id));
        for (const memberId of selected) overwrites.push({ id: memberId, type: 1, allow: "3072" });
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ permission_overwrites: overwrites }) });
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Added to ticket: ${selected.map((id) => `<@${id}>`).join(", ")}.`, allowed_mentions: { parse: [], users: selected } }) });
        await log(cfg, "Ticket Members Added", `${selected.map((id) => `<@${id}>`).join(", ")} added to <#${channelId}> by <@${uid}>.`);
        return response(`Added ${selected.length} member(s) to the ticket.`);
      }
      if (action === "claim") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can claim tickets.");
        if (ticket.claimedBy && ticket.claimedBy !== uid) return response(`This ticket is already claimed by <@${ticket.claimedBy}>.`);
        ticket.claimedBy = uid;
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket claimed by <@${uid}>.`, allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Claimed", `Ticket <#${channelId}> claimed by <@${uid}>.`);
        return response("Ticket claimed.");
      }
      if (action === "reopen") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can reopen this ticket.");
        ticket.status = "open";
        const reopenOverwrites = [{ id: guildId, type: 0, deny: "1024" }, { id: ticket.ownerId, type: 1, allow: "3072" }, ...[...new Set([...cfg.staffRoleIds, ...cfg.adminRoleIds])].map((id) => ({ id, type: 0, allow: "3072" }))];
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ name: `ticket-${ticket.ownerId.slice(-6)}`, permission_overwrites: reopenOverwrites }) });
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket reopened by <@${uid}>.`, components: [row(button(`ticket:claim:${channelId}`, "Claim", 3), button(`ticket:close:${channelId}`, "Close Ticket", 4)), userSelect(`ticket:addmember:${channelId}`, "Add members to this ticket"), userSelect(`ticket:removemember:${channelId}`, "Remove members from this ticket")], allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Reopened", `Ticket <#${channelId}> reopened by <@${uid}>.`);
        return response("Ticket reopened.");
      }
      if (action === "close") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can close this ticket.");
        await deliverTranscript(cfg, channelId, ticket.ownerId).catch((err) => console.error("[relay transcript]", err));
        ticket.status = "closed";
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket closed by <@${uid}>.`, components: [row(button(`ticket:reopen:${channelId}`, "Reopen Ticket", 3))], allowed_mentions: { parse: [], users: [uid] } }) });
        await discordRequest(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ name: `closed-${channelId.slice(-6)}`, permission_overwrites: [
          { id: guildId, type: 0, deny: "1024" }, { id: ticket.ownerId, type: 1, deny: "2048" },
          ...cfg.staffRoleIds.map((id) => ({ id, type: 0, allow: "3072" })),
          ...cfg.adminRoleIds.map((id) => ({ id, type: 0, allow: "3072" })),
        ] }) });
        await log(cfg, "Ticket Closed", `Ticket <#${channelId}> closed by <@${uid}>.`);
        return response("Ticket closed.");
      }
    }
    return response("Unknown Relay component.");
  }
  return response("Unsupported Relay interaction.");
}
