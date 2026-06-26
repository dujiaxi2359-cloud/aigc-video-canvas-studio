CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  owner_user_id TEXT,
  folder_id TEXT,
  cover_asset_id TEXT,
  name TEXT NOT NULL,
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  created_by_user_id TEXT,
  provider_id TEXT,
  provider TEXT NOT NULL,
  category TEXT,
  display_name TEXT NOT NULL,
  api_base_url TEXT,
  requires_api_base_url INTEGER DEFAULT 0,
  encrypted_api_key TEXT,
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  capabilities_json TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  owner_user_id TEXT,
  name TEXT,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'uploaded',
  folder_id TEXT,
  file_name TEXT,
  original_name TEXT NOT NULL,
  local_path TEXT NOT NULL,
  url TEXT NOT NULL,
  public_url TEXT,
  download_url TEXT,
  cos_url TEXT,
  cdn_url TEXT,
  poster_url TEXT,
  preview_url TEXT,
  downloadable_url TEXT,
  thumbnail_key TEXT,
  poster_key TEXT,
  preview_key TEXT,
  original_storage_provider TEXT,
  preview_storage_provider TEXT,
  public_delivery_provider TEXT,
  size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration REAL,
  fps REAL,
  thumbnail_path TEXT,
  storage_provider TEXT,
  storage_key TEXT,
  storage_bucket TEXT,
  storage_region TEXT,
  storage_file_type TEXT,
  provider_id TEXT,
  model_id TEXT,
  node_id TEXT,
  project_id TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  generation_params_json TEXT,
  deleted_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS asset_folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  parent_id TEXT,
  project_id TEXT,
  deleted_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS generation_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  user_id TEXT,
  generation_type TEXT,
  project_id TEXT,
  node_id TEXT,
  model_config_id TEXT,
  model_display_name TEXT,
  input_mode TEXT,
  prompt TEXT,
  duration INTEGER,
  aspect_ratio TEXT,
  resolution TEXT,
  status TEXT,
  output_path TEXT,
  output_url TEXT,
  thumbnail_url TEXT,
  poster_url TEXT,
  preview_url TEXT,
  cdn_url TEXT,
  cos_url TEXT,
  downloadable_url TEXT,
  error_message TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  user_id TEXT,
  status TEXT,
  provider_status TEXT,
  provider_task_id TEXT,
  canvas_node_id TEXT,
  project_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  provider_video_url TEXT,
  output_url TEXT,
  cdn_url TEXT,
  poster_url TEXT,
  preview_url TEXT,
  downloadable_url TEXT,
  cos_key TEXT,
  file_size INTEGER,
  mime_type TEXT,
  completed_at INTEGER,
  finished_at INTEGER,
  failed_stage TEXT,
  error_code TEXT,
  storage_status TEXT,
  storage_error TEXT,
  raw_create_response TEXT,
  repaired_at INTEGER,
  progress INTEGER,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  invite_status TEXT NOT NULL DEFAULT 'pending',
  default_workspace_id TEXT,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  owner_user_id TEXT,
  plan_id TEXT,
  billing_status TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'personal',
  target_workspace_id TEXT,
  member_role TEXT DEFAULT 'member',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_invites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  invite_code_id TEXT NOT NULL,
  workspace_id TEXT,
  code TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, invite_code_id)
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  max_members INTEGER NOT NULL DEFAULT 1,
  monthly_credits INTEGER NOT NULL DEFAULT 0,
  storage_limit_mb INTEGER NOT NULL DEFAULT 0,
  features_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_balances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  related_generation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  model_provider TEXT,
  model_id TEXT,
  action_type TEXT NOT NULL,
  cost_credits INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, revoked_at);
