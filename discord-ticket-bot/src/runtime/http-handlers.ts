import { discordRequest } from "./discord-rest";
import { readJson, writeJson } from "./storage";

type Interaction = {
  type: number; id: string; token: string; guild_id?: string; channel_id?: string;
  member?: { user?: { id: string; username?: string }; roles?: string[]; permissions?: string };
  user?: { id: string; username?: string };
  data?: { name?: string; options?: Array<{ name: string; value?: string | number; options?: Array<{ name: string; value?: string | number }> }>; custom_id?: string; values?: string[] };
};
type TicketRecord = { channelId: string; ownerId: string; claimedBy: string | null; status: "open" | "closed"; createdAt: string };
type GuildConfig = { guildId: string; categoryId: string | null; panelChannelId: string | null; panelMessageId: string | null; logChannelId: string | null; transcriptChannelId: string | null; transcriptsEnabled: boolean; transcriptIncludeAttachments: boolean; adminRoleIds: string[]; staffRoleIds: string[]; tickets: TicketRecord[] };

const configPath = (guildId: string) => `relay/guilds/${guildId}.json`;
const defaults = (guildId: string): GuildConfig => ({ guildId, categoryId: null, panelChannelId: null, panelMessageId: null, logChannelId: null, transcriptChannelId: null, transcriptsEnabled: false, transcriptIncludeAttachments: true, adminRoleIds: [], staffRoleIds: [], tickets: [] });
const userId = (i: Interaction) => i.member?.user?.id ?? i.user?.id ?? "";
const username = (i: Interaction) => i.member?.user?.username ?? i.user?.username ?? "user";
const response = (content: string, ephemeral = true, components: unknown[] = []) => ({ type: 4, data: { content, flags: ephemeral ? 64 : 0, components } });
const updateResponse = (content: string, components: unknown[] = []) => ({ type: 7, data: { content, components } });
const button = (custom_id: string, label: string, style = 2) => ({ type: 2, style, custom_id, label });
const row = (...components: unknown[]) => ({ type: 1, components });
const channelSelect = (custom_id: string, placeholder: string, channel_types: number[]) => ({ type: 1, components: [{ type: 8, custom_id, placeholder, min_values: 1, max_values: 1, channel_types }] });
const roleSelect = (custom_id: string, placeholder: string) => ({ type: 1, components: [{ type: 6, custom_id, placeholder, min_values: 0, max_values: 10 }] });
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
function panelPayload() {
  return { embeds: [embed("🎫 Support Tickets", "Need help? Click **Open a Ticket** below and our team will assist you.\n\nYour ticket will be private to you and the support team.")], components: [row(button("ticket:open", "Open a Ticket", 1))], allowed_mentions: { parse: [] } };
}
async function log(cfg: GuildConfig, title: string, description: string) {
  if (!cfg.logChannelId) return;
  await discordRequest(`/channels/${cfg.logChannelId}/messages`, { method: "POST", body: JSON.stringify({ embeds: [embed(title, description)], allowed_mentions: { parse: [] } }) }).catch((err) => console.error("[relay log]", err));
}
async function openTicket(i: Interaction, cfg: GuildConfig) {
  const guildId = i.guild_id!;
  const uid = userId(i);
  if (!uid) return response("I couldn't identify your Discord account.");
  const existing = cfg.tickets.find((t) => t.ownerId === uid && t.status === "open");
  if (existing) return response(`You already have an open ticket: <#${existing.channelId}>`);
  const safeName = username(i).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "user";
  const overwrites: Array<Record<string, unknown>> = [
    { id: guildId, type: 0, deny: "1024" },
    { id: uid, type: 1, allow: "3072" },
  ];
  const botId = process.env.DISCORD_APPLICATION_ID;
  if (botId) overwrites.push({ id: botId, type: 1, allow: "3072" });
  for (const roleId of cfg.staffRoleIds) overwrites.push({ id: roleId, type: 0, allow: "3072" });
  for (const roleId of cfg.adminRoleIds) overwrites.push({ id: roleId, type: 0, allow: "3072" });
  const created = await discordRequest<{ id: string; name: string }>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name: `ticket-${safeName}`.slice(0, 100), type: 0, ...(cfg.categoryId ? { parent_id: cfg.categoryId } : {}), topic: `Relay ticket • owner:${uid}`, permission_overwrites: overwrites }),
  });
  const ticket: TicketRecord = { channelId: created.id, ownerId: uid, claimedBy: null, status: "open", createdAt: new Date().toISOString() };
  cfg.tickets.push(ticket);
  try {
    await writeJson(configPath(guildId), cfg);
    await discordRequest(`/channels/${created.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: `<@${uid}> thanks for contacting support! Please describe your issue below.\n\nStaff can claim this ticket or close it when resolved.`,
        embeds: [embed("Ticket Controls", "Use the controls below. Claiming is limited to configured staff.")],
        components: [row(button(`ticket:claim:${created.id}`, "Claim", 3), button(`ticket:close:${created.id}`, "Close Ticket", 4))],
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
      if (action === "preview") return { type: 4, data: { ...panelPayload(), flags: 64 } };
      const channelOpt = options.find((o) => o.name === "channel")?.value;
      const channelId = typeof channelOpt === "string" ? channelOpt : cfg.panelChannelId ?? i.channel_id;
      if (!channelId) return response("Choose a panel channel with `/ticket setup` first.");
      const payload = panelPayload();
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
      cfg.categoryId = null; cfg.panelChannelId = null; cfg.panelMessageId = null; cfg.logChannelId = null; cfg.transcriptChannelId = null; cfg.transcriptsEnabled = false; cfg.transcriptIncludeAttachments = true; cfg.adminRoleIds = []; cfg.staffRoleIds = [];
      await writeJson(configPath(guildId), cfg);
      return response("Relay configuration reset. Existing ticket channels have not been deleted.");
    }
    if (sub === "staff") return response("**Staff Role Manager**\\nSelect global staff roles. Staff can claim tickets and access ticket channels.", true, [roleSelect("config:staff_roles_select", "Select support staff roles"), roleSelect("config:admin_roles_select", "Select ticket admin roles")]);
    if (sub === "logs") return response("**Logging Settings**\\nSelect a channel for ticket lifecycle logs.", true, [channelSelect("config:log_channel_select", "Select logging channel", [0])]);
    if (sub === "transcripts") return response(`**Transcript Settings**\\n• Enabled: ${cfg.transcriptsEnabled ? "yes" : "no"}\\n• Destination: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "not set"}\\n• Include attachments: ${cfg.transcriptIncludeAttachments ? "yes" : "no"}\\n\\nTranscript delivery is not active yet; these settings are saved for the transcript exporter.`, true, [
      channelSelect("config:transcript_channel_select", "Select transcript destination", [0]),
      row(button("config:transcript_toggle", cfg.transcriptsEnabled ? "Disable Transcripts" : "Enable Transcripts", cfg.transcriptsEnabled ? 4 : 3), button("config:transcript_attachments_toggle", cfg.transcriptIncludeAttachments ? "Exclude Attachments" : "Include Attachments")),
    ]);
    if (sub === "buttons") return response("**Ticket Button Manager**\\nThis runtime currently supports the default Open a Ticket button only. Custom ticket types, button editing, ordering, and per-button rules are not implemented yet, so this manager is intentionally unavailable rather than implying those controls work.");
    return response("Unknown /ticket subcommand.");
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
        return updateResponse(`Transcript destination saved as <#${selected}>. Transcript export is not active yet.`);
      }
      if (customId === "config:transcript_toggle") {
        cfg.transcriptsEnabled = !cfg.transcriptsEnabled;
        await writeJson(configPath(guildId), cfg);
        return updateResponse(`Transcript setting saved: ${cfg.transcriptsEnabled ? "enabled" : "disabled"}. Export is not active yet.`, [
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
        const payload = panelPayload();
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
    if (customId === "ticket:open") return await openTicket(i, cfg);
    if (customId.startsWith("ticket:")) {
      const [, action, channelId] = customId.split(":");
      const ticket = cfg.tickets.find((t) => t.channelId === channelId && t.status === "open");
      if (!ticket) return response("This ticket is no longer open or is not tracked by Relay.");
      const uid = userId(i);
      if (action === "claim") {
        if (!isStaff(i, cfg)) return response("Only configured support staff can claim tickets.");
        if (ticket.claimedBy && ticket.claimedBy !== uid) return response(`This ticket is already claimed by <@${ticket.claimedBy}>.`);
        ticket.claimedBy = uid;
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket claimed by <@${uid}>.`, allowed_mentions: { parse: [], users: [uid] } }) });
        await log(cfg, "Ticket Claimed", `Ticket <#${channelId}> claimed by <@${uid}>.`);
        return response("Ticket claimed.");
      }
      if (action === "close") {
        if (ticket.ownerId !== uid && !isStaff(i, cfg)) return response("Only the ticket creator or authorized staff can close this ticket.");
        ticket.status = "closed";
        await writeJson(configPath(guildId), cfg);
        await discordRequest(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `Ticket closed by <@${uid}>.`, allowed_mentions: { parse: [], users: [uid] } }) });
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
