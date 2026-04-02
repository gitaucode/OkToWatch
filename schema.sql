-- ClearView D1 Schema
-- Apply with: wrangler d1 execute clearview --file=./schema.sql
-- Remote:     wrangler d1 execute clearview --file=./schema.sql --remote

-- ── Profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id             TEXT NOT NULL,
  name                TEXT NOT NULL,
  age                 INTEGER NOT NULL CHECK (age >= 1 AND age <= 17),
  emoji               TEXT DEFAULT '👧',
  sensitivity_preset  TEXT CHECK (sensitivity_preset IN ('balanced', 'cautious', 'sensitive', NULL)),
  blocked_categories  TEXT,                    -- JSON array of category names to flag for this child
  notes               TEXT,                    -- Parent notes about this child's preferences
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── History ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  year        TEXT,
  poster      TEXT,
  profile_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  searched_at TEXT DEFAULT (datetime('now'))
);

-- ── Lists ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lists (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title      TEXT NOT NULL,
  year       TEXT,
  poster     TEXT,
  list_type  TEXT NOT NULL CHECK (list_type IN ('approved', 'blocked', 'watchlater')),
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  note       TEXT,
  saved_at   TEXT DEFAULT (datetime('now'))
);

-- ── Analysis cache ────────────────────────────────────────────────────────
-- Keyed on tmdb_id + media_type + season (NULL = whole show / movie).
-- result_json stores the parsed breakdown object as a JSON string.
-- Expires after 90 days so content advisories stay reasonably fresh.
CREATE TABLE IF NOT EXISTS analysis_cache (
  id          TEXT PRIMARY KEY,           -- "{tmdb_id}:{media_type}:{season|all}"
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL,
  season      INTEGER,                    -- NULL = whole show or movie
  result_json TEXT NOT NULL,
  cached_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cache_lookup ON analysis_cache(tmdb_id, media_type, season);

-- ── Banned users ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_users (
  user_id    TEXT PRIMARY KEY,
  reason     TEXT,
  banned_by  TEXT NOT NULL,
  banned_at  TEXT DEFAULT (datetime('now'))
);

-- ── Announcements (sitewide banners) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

-- ── Admin audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_log (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admin_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  target_id  TEXT,
  detail     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Sharing tokens (public share links) ────────────────────────────────────
-- Token-based sharing for public access to content breakdowns.
-- Expires after 30 days by default; can be revoked by owner.
CREATE TABLE IF NOT EXISTS sharing_tokens (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  season     INTEGER,                    -- NULL = whole show or movie
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+30 days'))
);

-- ── Issue Reports (user feedback on verdicts) ──────────────────────────────
-- Users can report inaccuracies or missing content in breakdowns.
-- This builds trust and helps improve analysis quality.
CREATE TABLE IF NOT EXISTS issue_reports (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  season     INTEGER,                    -- NULL = whole show or movie
  category   TEXT CHECK (category IN ('inaccurate', 'missing', 'unclear', 'other')),
  message    TEXT NOT NULL,
  resolved   INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Shared Notes (family collaboration) ────────────────────────────────────
-- Family members can share notes, decisions, and discussions about titles.
-- These are shared within the family account for co-parent collaboration.
CREATE TABLE IF NOT EXISTS shared_notes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id    TEXT NOT NULL,              -- Author of the note
  family_id  TEXT NOT NULL,              -- Family account (derived from parent user_id)
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  note_type  TEXT CHECK (note_type IN ('observation', 'approval', 'caution')) DEFAULT 'observation',
  message    TEXT NOT NULL,
  is_pinned  INTEGER DEFAULT 0,          -- Show this note prominently
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── Episode Analysis (TV episode-level verdicts) ────────────────────────────
-- Cache verdicts for individual TV episodes so parents can see which episodes
-- are risky for their child's age. Keyed on tmdb_id:season:episode format.
-- Expires after 90 days to keep content warnings reasonably fresh.
CREATE TABLE IF NOT EXISTS episode_analysis (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  cache_key  TEXT NOT NULL UNIQUE,       -- tv_id:season:episode format (e.g. 1399:1:1)
  tmdb_id    INTEGER NOT NULL,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  result_json TEXT NOT NULL,             -- Full breakdown JSON for this episode
  cached_at  TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+90 days'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_history_user     ON history(user_id, searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_tmdb     ON history(user_id, tmdb_id);
CREATE INDEX IF NOT EXISTS idx_lists_user       ON lists(user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_lists_type       ON lists(user_id, list_type);
CREATE INDEX IF NOT EXISTS idx_profiles_user    ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_announcements    ON announcements(active, expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_log        ON admin_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sharing_tokens   ON sharing_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sharing_lookup   ON sharing_tokens(id, expires_at);
CREATE INDEX IF NOT EXISTS idx_issue_reports    ON issue_reports(tmdb_id, media_type, resolved);
CREATE INDEX IF NOT EXISTS idx_issue_user       ON issue_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_notes     ON shared_notes(family_id, tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_shared_notes_user ON shared_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episode_analysis ON episode_analysis(tmdb_id, season_number, episode_number);
CREATE INDEX IF NOT EXISTS idx_episode_cache_key ON episode_analysis(cache_key);

-- ── Subscriptions (billing & feature gating) ──────────────────────────────
-- Tracks paid subscriptions via Dodo Payments.
-- Status: active, cancelled, expired
-- Tier: free (no record), pro, family
-- Stores payment details for billing and chargeback handling.
CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL UNIQUE,
  dodo_customer_id TEXT,                    -- Dodo Payments customer ID
  dodo_order_id   TEXT UNIQUE,              -- Dodo Order ID (most recent)
  tier            TEXT NOT NULL CHECK (tier IN ('pro', 'family')),
  billing_cycle   TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  price_cents     INTEGER NOT NULL,         -- Price in cents (e.g., 499 = $4.99)
  trial_ends_at   TEXT,                     -- When 30-day trial expires (NULL if no trial)
  renews_at       TEXT NOT NULL,            -- Next billing date or expiration date
  cancelled_at    TEXT,                     -- When user cancelled (remains on subscription until renews_at)
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dodo ON subscriptions(dodo_order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status, renews_at);

