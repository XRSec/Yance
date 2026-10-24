import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'streamable-http', 'sse')),
  command TEXT,
  args_json TEXT NOT NULL DEFAULT '[]',
  cwd TEXT,
  url TEXT,
  env_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'registered',
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  adapter_type TEXT NOT NULL DEFAULT 'passthrough' CHECK (adapter_type IN ('passthrough', 'node-module')),
  runtime TEXT NOT NULL DEFAULT 'node',
  entry_file TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  sync_mode TEXT NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('manual', 'poll')),
  status TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  annotations_json TEXT,
  discovered_at TEXT NOT NULL,
  UNIQUE (mcp_server_id, name),
  FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS capability_mappings (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, capability_id, tool_name),
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'tool-poll' CHECK (mode IN ('tool-poll')),
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  interval_ms INTEGER NOT NULL CHECK (interval_ms >= 1000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_run_at TEXT,
  next_run_at TEXT,
  last_error TEXT,
  last_payload_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  connector_id TEXT,
  mcp_server_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE SET NULL,
  FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(mcp_server_id);
CREATE INDEX IF NOT EXISTS idx_capability_connector ON capability_mappings(connector_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_connector ON sync_jobs(connector_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
`

export class YanceDatabase {
  readonly path: string
  readonly connection: Database.Database

  constructor(path: string) {
    this.path = path
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true })
    }
    this.connection = new Database(path)
    this.connection.pragma('foreign_keys = ON')
    if (path !== ':memory:') {
      this.connection.pragma('journal_mode = WAL')
    }
    this.migrate()
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const current = this.connection
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as { version: number } | undefined

    if ((current?.version ?? 0) < 1) {
      const migrate = this.connection.transaction(() => {
        this.connection.exec(MIGRATION_1)
        this.connection
          .prepare('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(1, new Date().toISOString())
      })
      migrate()
    }
  }

  listTables(): string[] {
    const rows = this.connection
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    return rows.map((row) => row.name)
  }

  readTable(table: string, limit = 100, offset = 0): {
    table: string
    columns: string[]
    rows: Record<string, unknown>[]
    total: number
  } {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500)
    const safeOffset = Math.max(Math.trunc(offset), 0)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) || !this.listTables().includes(table)) {
      throw new Error(`Unknown database table: ${table}`)
    }

    const quoted = `"${table}"`
    const rows = this.connection
      .prepare(`SELECT * FROM ${quoted} LIMIT ? OFFSET ?`)
      .all(safeLimit, safeOffset) as Record<string, unknown>[]
    const count = this.connection.prepare(`SELECT COUNT(*) AS total FROM ${quoted}`).get() as { total: number }
    const columns = (this.connection.prepare(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    )

    return { table, columns, rows, total: count.total }
  }

  close(): void {
    this.connection.close()
  }
}
