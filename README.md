# Relay

**Relay** is a production-ready Discord ticket bot.  
Everything is configured **inside Discord** — slash commands, buttons, select menus, and modals. No external dashboard required.

**Version:** 1.1.0  
**Author:** [ZeroTech](https://swar4j.space) · [xxSwar4jxx](https://github.com/xxSwar4jxx)

[![Add to Discord](https://img.shields.io/badge/Add%20to%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1539725899253940396&permissions=5629878028397568&integration_type=0&scope=applications.commands+bot)

---

## Features

- **Full in-Discord setup** via `/ticket setup` (panel, types, staff, logs, transcripts, permissions, reset)
- **Custom ticket panels** — title, description, color, banner, thumbnail; preview before send; update in place
- **Unlimited ticket types** per server (automatically switches to select menus above 25 types)
- Per-type options: style, staff roles, ping roles, channel name template, opening message, max open tickets, cooldown, reorder
- **Ticket category** — new tickets open under a configured Discord category (fails clearly if missing)
- **Claim / Unclaim** — first successful claim wins; only the claimant can unclaim (admins can override; override is logged)
- Control panel: Claim / Unclaim, Add User, Remove User, Close, Reopen, Transcript, Delete
- Ticket owner cannot be removed from their own ticket
- Atomic ticket creation (channel + database, with rollback on failure)
- Optional **logging** and **transcripts** (paginated, 10,000-message safety cap)
- Multi-server isolation by `guild_id`
- Centralized **PermissionService** — Ticket Admin roles can use `/ticket` without Manage Guild
- **OpenForge branding** on the public ticket panel only (`Developed by OpenForge`)

---

## Stack

| Piece       | Detail                                                |
| ----------- | ----------------------------------------------------- |
| Runtime     | Node.js ≥ 18.17                                       |
| Language    | TypeScript                                            |
| Discord API | discord.js v14                                        |
| Database    | SQLite (`better-sqlite3`), WAL + foreign keys         |
| Migrations  | Lightweight SQL files under `src/database/migrations/` |

---

## Repository layout

```
Relay/
├── discord-ticket-bot/          # Bot source (run the bot from here)
│   ├── src/
│   │   ├── commands/            /ticket slash command
│   │   ├── interactions/        buttons, modals, select menus, setup UI
│   │   ├── services/            Config, Panel, Ticket, Permissions, Logs, Transcripts
│   │   ├── database/            schema, migrations, db runner
│   │   ├── events/
│   │   └── deploy-commands.ts
│   ├── assets/                  openforge-logo.png (panel footer)
│   ├── .env.example
│   └── package.json
└── web/relay-website/           Optional static marketing page
```

---

## Quick start

### 1. Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create an application → Bot → copy the **token**
3. Copy the **Application (Client) ID**
4. Enable the intents your host requires (the bot must be able to join guilds and manage channels/messages for tickets)

### 2. Install and configure

```bash
cd discord-ticket-bot
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id

# Optional: guild ID for instant command deploy while developing
DEV_GUILD_ID=

# Optional: SQLite path (default ./data/tickets.sqlite)
DATABASE_PATH=

# Optional: debug | info | warn | error
LOG_LEVEL=info
```

```bash
npm install
npm run deploy    # register /ticket slash commands
npm run dev       # development (tsx watch)
# or
npm run build && npm start
```

### 3. Invite the bot

Use the invite button at the top of this README, or build your own with the Client ID and the permissions your server needs (Manage Channels, View Channels, Send Messages, Embed Links, Manage Roles / channel overwrites, etc.).

### 4. Configure in Discord

In a server where the bot is present:

```
/ticket setup
```

Use the ephemeral menu to set the panel, ticket types, staff roles, log channel, transcripts, and ticket category. Then:

```
/ticket panel action:Send / Update
```

---

## Commands

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `/ticket setup`       | Full configuration menu                       |
| `/ticket panel`       | Preview or send/update the public panel       |
| `/ticket config`      | View current configuration                    |
| `/ticket buttons`     | Create, edit, style, and reorder ticket types |
| `/ticket staff`       | Global staff roles                            |
| `/ticket logs`        | Logging channel                               |
| `/ticket transcripts` | Transcript settings                           |
| `/ticket reset`       | Reset this server’s ticket configuration      |

Ticket Admins (configured in-app) can use `/ticket` even without Discord’s Manage Guild permission.

---

## Claim system

1. A member opens a ticket from the public panel  
2. Staff presses **Claim Ticket** — ownership is written on the embed  
3. Only the current claimant can **Unclaim Ticket**  
4. Guild administrators may force-unclaim; the override is written to the log channel  
5. The first successful claim wins (atomic DB update)

---

## OpenForge branding

The footer **Developed by OpenForge** appears **only** on the main public ticket panel.  
It does **not** appear on ticket control panels, setup menus, logs, transcripts, or errors.

---

## Environment variables

| Variable        | Required | Description                                           |
| --------------- | -------- | ----------------------------------------------------- |
| `DISCORD_TOKEN` | Yes      | Bot token                                             |
| `CLIENT_ID`     | Yes      | Application ID (slash command deploy)                 |
| `DEV_GUILD_ID`  | No       | Guild-scoped command deploy (faster while developing) |
| `DATABASE_PATH` | No       | SQLite file path (default `./data/tickets.sqlite`)    |
| `LOG_LEVEL`     | No       | `debug` \| `info` \| `warn` \| `error`                |

Never commit a real `.env` or bot token.

---

## Scripts

| Script           | Action                                          |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | Run with hot reload (`tsx watch`)               |
| `npm run build`  | Compile TypeScript + copy SQL assets to `dist/` |
| `npm start`      | Run compiled bot from `dist/`                   |
| `npm run deploy` | Register slash commands with Discord            |

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Links

- **GitHub:** [https://github.com/xxSwar4jxx/Relay](https://github.com/xxSwar4jxx/Relay)
- **OpenForge:** [https://swar4j.space](https://swar4j.space)
- **Invite:** [Add Relay](https://discord.com/oauth2/authorize?client_id=1539725899253940396&permissions=5629878028397568&integration_type=0&scope=applications.commands+bot)
