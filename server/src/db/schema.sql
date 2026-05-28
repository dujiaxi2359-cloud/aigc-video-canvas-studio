CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
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
  size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration REAL,
  fps REAL,
  thumbnail_path TEXT,
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
  name TEXT NOT NULL,
  parent_id TEXT,
  project_id TEXT,
  deleted_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS generation_history (
  id TEXT PRIMARY KEY,
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
  error_message TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  status TEXT,
  progress INTEGER,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
