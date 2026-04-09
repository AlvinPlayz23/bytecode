CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL,
  root_path TEXT NOT NULL DEFAULT '/workspace',
  minecraft_version TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  mod_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'openrouter',
  sandbox_timeout_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  tool_events TEXT NOT NULL DEFAULT '[]',
  file_changes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compilations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failure')),
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  jar_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
