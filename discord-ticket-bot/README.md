# Relay

**Relay** is a production-ready, fully Discord-configurable ticket bot by [OpenForge](https://github.com).  
No web dashboard — every setting is configured through slash commands, buttons, select menus, and modals inside Discord.

Version **1.1.0** — fixes, hardening, and OpenForge branding.

## Stack

- Node.js + TypeScript
- discord.js v14
- SQLite (better-sqlite3), per-guild isolated data
- Modular architecture: commands → interactions → services → database
- Lightweight SQL migration system (`src/database/migrations/`)

## Features

- `/ticket setup` — full ephemeral configuration menu (panel, buttons, staff, logs, transcripts, permissions, reset)
- Fully custom ticket panel: title, description, color, banner, thumbnail — preview before sending, update in place
- **OpenForge branding** on the main public ticket panel only (`Developed by OpenForge` footer)
- Unlimited custom ticket types per server (uses select menus automatically when >25 buttons)
- Per-button: category, staff roles, ping roles, channel name template, opening message, style (Primary/Secondary/Success/Danger), max tickets, cooldown, **reorderable position**
- Global staff roles receive channel access on every new ticket
- Ticket control panel: **Claim / Unclaim**, Add User, Remove User, Close, Reopen, Transcript, Delete
- Server-side protection: cannot remove the ticket creator from their own ticket
- Atomic ticket creation (channel + DB with rollback on failure)
- Configurable logging & transcript delivery (transcripts paginated, safety limit: 10,000 messages)
- Multi-server isolation by `guild_id`
- Centralized `PermissionService` — application-level auth (Ticket Admin roles work even without Manage Guild)

## Quick start

```bash
cp .env.example .env
# Fill DISCORD_TOKEN and CLIENT_ID
npm install
npm run deploy   # register slash commands
npm run dev      # or: npm run build && npm start
```

## Project layout

```
src/
├── commands/           /ticket slash command
├── interactions/
│   ├── buttons/        config UI + ticket controls
│   ├── modals/
│   ├── selectMenus/
│   └── setupMenus.ts   shared embed/component builders
├── services/
│   ├── ConfigService.ts
│   ├── PermissionService.ts
│   ├── PanelService.ts      # panel + OpenForge branding + >25 select menus
│   ├── TicketService.ts     # create/claim/unclaim/close + permission overwrites
│   ├── TranscriptService.ts
│   └── LoggingService.ts
├── database/
│   ├── schema.sql
│   ├── db.ts                # WAL, FKs, migration runner
│   └── migrations/
assets/
└── openforge-logo.png       # Official OpenForge logo (panel branding)
```

## OpenForge branding

The text **Developed by OpenForge** appears only on the main public ticket panel that users use to open tickets. It does **not** appear on ticket control panels, configuration menus, logs, transcripts, or error messages.

## License

Private / OpenForge — all rights reserved unless otherwise stated.
