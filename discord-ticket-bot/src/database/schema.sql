PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL UNIQUE REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id TEXT,
  message_id TEXT,
  title TEXT NOT NULL DEFAULT 'Support Tickets',
  description TEXT NOT NULL DEFAULT 'Click a button below to open a ticket.',
  color TEXT NOT NULL DEFAULT '#5865F2',
  image TEXT,
  thumbnail TEXT,
  footer_text TEXT,
  footer_icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_buttons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  style TEXT NOT NULL DEFAULT 'Primary',
  category_id TEXT,
  channel_name TEXT NOT NULL DEFAULT 'ticket-{username}',
  opening_message TEXT NOT NULL DEFAULT 'Thanks for reaching out! Support will be with you shortly.',
  max_tickets INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_buttons_guild ON ticket_buttons(guild_id);

CREATE TABLE IF NOT EXISTS button_staff_roles (
  button_id INTEGER NOT NULL REFERENCES ticket_buttons(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  PRIMARY KEY (button_id, role_id)
);

CREATE TABLE IF NOT EXISTS button_ping_roles (
  button_id INTEGER NOT NULL REFERENCES ticket_buttons(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  PRIMARY KEY (button_id, role_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  button_id INTEGER REFERENCES ticket_buttons(id) ON DELETE SET NULL,
  claimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  closed_by TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(guild_id, user_id, status);

CREATE TABLE IF NOT EXISTS ticket_members (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY REFERENCES guilds(guild_id) ON DELETE CASCADE,
  log_channel_id TEXT,
  transcript_channel_id TEXT,
  transcripts_enabled INTEGER NOT NULL DEFAULT 1,
  transcript_include_attachments INTEGER NOT NULL DEFAULT 1,
  admin_role_ids TEXT NOT NULL DEFAULT '[]',
  staff_role_ids TEXT NOT NULL DEFAULT '[]',
  close_removes_creator_send INTEGER NOT NULL DEFAULT 1,
  ticket_category_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple per-user, per-button cooldown tracking
CREATE TABLE IF NOT EXISTS cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  button_id INTEGER NOT NULL,
  last_created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, button_id)
);
