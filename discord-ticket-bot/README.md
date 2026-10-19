# Relay — HTTP Runtime Migration

Relay is a Discord ticket bot being migrated from a long-running Discord Gateway client to an HTTP interactions endpoint suitable for serverless hosting.

> **Migration status: in progress — not production-ready.** This branch contains the initial Next.js HTTP runtime, Discord request-signature verification, a Discord REST helper, and a private Vercel Blob JSON-storage utility. Existing ticket commands and component handlers have **not yet** been fully ported to the HTTP runtime. Do not configure this branch as the live Discord interactions endpoint until that work and the checks below are complete.

## Intended architecture

- **Runtime:** Next.js route handlers deployed as serverless functions.
- **Discord interactions:** `POST /api/discord/interactions`.
- **Request security:** verify Discord's Ed25519 signature against the exact raw request body; reject invalid and stale signatures.
- **Discord API:** outgoing operations use the Discord REST API, not a Gateway connection.
- **Configuration storage:** private Vercel Blob JSON objects (no SQL database).
- **Web page:** a small service landing page at `/`.

## Current status

- [x] Next.js application shell and interaction route.
- [x] Discord PING handshake for endpoint validation.
- [x] Ed25519 request-signature verification.
- [x] Minimal Discord REST helper.
- [x] Private Vercel Blob JSON read/write/delete utility.
- [ ] Port `/ticket` slash-command handlers to raw HTTP interaction payloads.
- [ ] Port buttons, select menus, and modal submissions.
- [ ] Replace all SQLite-backed configuration, ticket, cooldown, and claim operations with Blob-backed JSON documents.
- [ ] Preserve authorization checks, claim/unclaim race protection, guild isolation, logs, transcripts, and rollback/error handling.
- [ ] Register/verify global slash commands and configure Discord's Interactions Endpoint URL.
- [ ] Run lint/type checks, build, and integration tests before deployment.

## Requirements

- Node.js 20.9 or newer.
- A Discord application and bot token.
- A private Vercel Blob store connected to the deployment project.

## Environment variables

Configure these in the deployment environment. Never commit real values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_APPLICATION_ID` | Yes | Discord application ID for command registration. |
| `DISCORD_BOT_TOKEN` | Yes | Bot token for Discord REST API calls and command registration. |
| `DISCORD_PUBLIC_KEY` | Yes | Application public key used to verify signed interaction requests. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token; supplied by Vercel when the Blob store is connected. |

See `.env.example` for the variable names.

## Local development

From this directory:

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run typecheck
npm run build
```

The HTTP route is `/api/discord/interactions`. A GET request is a basic health check; Discord interaction delivery uses POST.

## Discord setup (after the migration is complete)

1. Deploy the Next.js project to the chosen serverless host.
2. Set the environment variables and connect a **private** Vercel Blob store.
3. In the Discord Developer Portal, set the Interactions Endpoint URL to `https://YOUR_DOMAIN/api/discord/interactions`.
4. Register the slash commands using the project's command-registration workflow.
5. Validate PING, slash commands, buttons, select menus, modals, permissions, and ticket lifecycle behavior in a test server.

**Do not point a production application at this branch yet.** At present, non-PING interactions return a temporary migration message instead of executing the existing ticket features.

## Repository

- GitHub: https://github.com/xxSwar4jxx/Relay
- Migration branch: `feat/http-serverless-runtime`

## License

MIT License. See [LICENSE](LICENSE).
