-- ============================================================
-- KatChat Supabase Schema v2.1
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ROLES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#888888',
  icon TEXT NOT NULL DEFAULT 'fa-solid fa-user',
  permissions JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, color, icon, permissions, is_system) VALUES
('member', '#888888', 'fa-solid fa-user', '{"canChat":true,"canGlobalChat":true,"canViewAnnouncements":true,"canCommentAnnouncements":true}', true),
('admin', '#06b6d4', 'fa-solid fa-shield-halved', '{"canChat":true,"canGlobalChat":true,"canViewAnnouncements":true,"canCommentAnnouncements":true,"canCreateAnnouncements":true,"canDeleteMessages":true,"canBanUsers":true,"canAccessAdminPanel":true,"canUseCommands":true}', true),
('owner', '#ef4444', 'fa-solid fa-crown', '{"canChat":true,"canGlobalChat":true,"canViewAnnouncements":true,"canCommentAnnouncements":true,"canCreateAnnouncements":true,"canDeleteMessages":true,"canBanUsers":true,"canAccessAdminPanel":true,"canManageRoles":true,"canManageUsers":true,"canUseCommands":true}', true)
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'prefer-not-to-say',
  pronouns TEXT DEFAULT 'they/them',
  profile_picture TEXT,
  profile_color TEXT DEFAULT '#22c55e',
  role TEXT NOT NULL DEFAULT 'member' REFERENCES roles(name) ON UPDATE CASCADE,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_banned_from_global BOOLEAN DEFAULT false,
  ban_reason TEXT DEFAULT NULL,
  banned_by UUID REFERENCES users(id),
  temp_ban_until TIMESTAMPTZ DEFAULT NULL,
  must_change_password BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'dark',
  intro_seen BOOLEAN DEFAULT false,
  -- sage_history stores either flat message array (legacy) or array of chat objects {id, title, messages, updated_at, preview}
  sage_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── FRIENDS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- ── MESSAGES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  images TEXT[] DEFAULT '{}',
  type TEXT NOT NULL DEFAULT 'private',
  conversation_id TEXT,
  reply_to UUID REFERENCES messages(id),
  mentions UUID[] DEFAULT '{}',
  deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  is_owner_message BOOLEAN DEFAULT false,
  read_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image TEXT,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANNOUNCEMENT COMMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── IMAGE UPLOAD TRACKING (daily limit enforcement) ────────────
CREATE TABLE IF NOT EXISTS image_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, upload_date)
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(is_banned_from_global);
CREATE INDEX IF NOT EXISTS idx_ann_comments_ann ON announcement_comments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_image_uploads_user_date ON image_uploads(user_id, upload_date);

-- ── Migrations for existing deployments ───────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_ban_until TIMESTAMPTZ DEFAULT NULL;

-- Case-insensitive unique index on email
DROP INDEX IF EXISTS idx_users_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- ── DISABLE RLS (service key bypasses anyway) ─────────────────
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE friends DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE image_uploads DISABLE ROW LEVEL SECURITY;

-- ── Chat retention: delete oldest 5 when conversation reaches 20 ──
CREATE OR REPLACE FUNCTION cleanup_chat_messages()
RETURNS TRIGGER AS $$
DECLARE
  msg_count INTEGER;
  oldest_ids UUID[];
  conv_id TEXT;
BEGIN
  conv_id := NEW.conversation_id;
  SELECT COUNT(*) INTO msg_count FROM messages 
    WHERE conversation_id = conv_id AND deleted = false;
  
  IF msg_count > 20 THEN
    SELECT ARRAY(
      SELECT id FROM messages 
      WHERE conversation_id = conv_id AND deleted = false
      ORDER BY created_at ASC LIMIT 5
    ) INTO oldest_ids;
    UPDATE messages SET deleted = true, images = '{}' 
    WHERE id = ANY(oldest_ids);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_chat ON messages;
CREATE TRIGGER trigger_cleanup_chat
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.type = 'private')
EXECUTE FUNCTION cleanup_chat_messages();

-- ── Auto-cleanup: delete oldest global msgs when > 200 ────────
-- Supabase free tier handles 40 concurrent users fine.
-- We only clean up if messages exceed 200 to keep DB lean.
CREATE OR REPLACE FUNCTION cleanup_global_messages()
RETURNS TRIGGER AS $$
DECLARE
  msg_count INTEGER;
  oldest_ids UUID[];
BEGIN
  SELECT COUNT(*) INTO msg_count FROM messages WHERE type = 'global' AND deleted = false;
  IF msg_count > 200 THEN
    SELECT ARRAY(
      SELECT id FROM messages WHERE type = 'global' AND deleted = false
      ORDER BY created_at ASC LIMIT 30
    ) INTO oldest_ids;
    UPDATE messages SET deleted = true WHERE id = ANY(oldest_ids);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_global ON messages;
CREATE TRIGGER trigger_cleanup_global
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.type = 'global')
EXECUTE FUNCTION cleanup_global_messages();

SELECT 'KatChat schema v2.1 created successfully!' as status;
