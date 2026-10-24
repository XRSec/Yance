import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  CapabilityMappingInput,
  CapabilityMappingRecord,
  ConnectorRecord,
  ConnectorUpdateInput,
  EventRecord,
  JsonRecord,
  McpServerInput,
  McpServerRecord,
  McpToolRecord,
  SyncJobInput,
  SyncJobRecord,
} from '../shared/types'
import { YanceDatabase } from './database'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {})
}

function now(): string {
  return new Date().toISOString()
}

interface McpRow {
  id: string
  name: string
  transport: McpServerInput['transport']
  command: string | null
  args_json: string
  cwd: string | null
  url: string | null
  env_json: string
  status: string
  last_error: string | null
  created_at: string
  updated_at: string
  connector_id?: string
  connector_name?: string
  tool_count?: number
}

interface ConnectorRow {
  id: string
  mcp_server_id: string
  mcp_server_name?: string
  name: string
  adapter_type: ConnectorRecord['adapterType']
  runtime: 'node'
  entry_file: string | null
  config_json: string
  sync_mode: ConnectorRecord['syncMode']
  status: string
  created_at: string
  updated_at: string
}

interface CapabilityRow {
  id: string
  connector_id: string
  capability_id: string
  tool_name: string
  enabled: number
  verified: number
  config_json: string
  created_at: string
  updated_at: string
}

interface SyncJobRow {
  id: string
  connector_id: string
  name: string
  mode: 'tool-poll'
  tool_name: string
  arguments_json: string
  interval_ms: number
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  last_error: string | null
  last_payload_hash: string | null
  created_at: string
  updated_at: string
}

export class YanceRegistry {
  private readonly db: YanceDatabase
  private readonly sql: Database.Database

  constructor(db: YanceDatabase) {
    this.db = db
    this.sql = db.connection
  }

  registerMcp(input: McpServerInput): McpServerRecord {
    const normalized = this.validateMcpInput(input)
    const mcpId = randomUUID()
    const connectorId = randomUUID()
    const timestamp = now()

    const insert = this.sql.transaction(() => {
      this.sql
        .prepare(`
          INSERT INTO mcp_servers(
            id, name, transport, command, args_json, cwd, url, env_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, ?)
        `)
        .run(
          mcpId,
          normalized.name,
          normalized.transport,
          normalized.command ?? null,
          stringify(normalized.args ?? []),
          normalized.cwd ?? null,
          normalized.url ?? null,
          stringify(normalized.env ?? {}),
          timestamp,
          timestamp,
        )

      this.sql
        .prepare(`
          INSERT INTO connectors(
            id, mcp_server_id, name, adapter_type, runtime, config_json, sync_mode, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'passthrough', 'node', '{}', 'manual', 'registered', ?, ?)
        `)
        .run(connectorId, mcpId, `${normalized.name} Connector`, timestamp, timestamp)
    })

    insert()
    return this.getMcp(mcpId)
  }

  private validateMcpInput(input: McpServerInput): McpServerInput {
    const name = input.name?.trim()
    if (!name) throw new Error('MCP name is required')
    if (!['stdio', 'streamable-http', 'sse'].includes(input.transport)) {
      throw new Error(`Unsupported MCP transport: ${input.transport}`)
    }
    if (input.transport === 'stdio' && !input.command?.trim()) {
      throw new Error('stdio MCP requires a command')
    }
    if (input.transport !== 'stdio') {
      if (!input.url?.trim()) throw new Error(`${input.transport} MCP requires a URL`)
      const parsed = new URL(input.url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('MCP URL must use http or https')
    }
    return {
      ...input,
      name,
      command: input.command?.trim() || undefined,
      cwd: input.cwd?.trim() || undefined,
      url: input.url?.trim() || undefined,
      args: input.args ?? [],
      env: input.env ?? {},
    }
  }

  listMcp(): McpServerRecord[] {
    const rows = this.sql
      .prepare(`
        SELECT m.*, c.id AS connector_id, c.name AS connector_name,
               (SELECT COUNT(*) FROM mcp_tools t WHERE t.mcp_server_id = m.id) AS tool_count
        FROM mcp_servers m
        JOIN connectors c ON c.mcp_server_id = m.id
        ORDER BY m.created_at DESC
      `)
      .all() as McpRow[]
    return rows.map((row) => this.mapMcp(row))
  }

  getMcp(id: string): McpServerRecord {
    const row = this.sql
      .prepare(`
        SELECT m.*, c.id AS connector_id, c.name AS connector_name,
               (SELECT COUNT(*) FROM mcp_tools t WHERE t.mcp_server_id = m.id) AS tool_count
        FROM mcp_servers m
        JOIN connectors c ON c.mcp_server_id = m.id
        WHERE m.id = ?
      `)
      .get(id) as McpRow | undefined
    if (!row) throw new Error(`MCP server not found: ${id}`)
    return this.mapMcp(row)
  }

  private mapMcp(row: McpRow): McpServerRecord {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command ?? undefined,
      args: parseJson<string[]>(row.args_json, []),
      cwd: row.cwd ?? undefined,
      url: row.url ?? undefined,
      env: parseJson<Record<string, string>>(row.env_json, {}),
      status: row.status,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      connectorId: row.connector_id ?? '',
      connectorName: row.connector_name ?? '',
      toolCount: row.tool_count ?? 0,
    }
  }

  deleteMcp(id: string): void {
    const result = this.sql.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`MCP server not found: ${id}`)
  }

  setMcpStatus(id: string, status: string, lastError: string | null = null): void {
    this.sql
      .prepare('UPDATE mcp_servers SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(status, lastError, now(), id)
  }

  replaceTools(
    mcpServerId: string,
    tools: Array<{ name: string; description?: string; inputSchema?: unknown; annotations?: unknown }>,
  ): McpToolRecord[] {
    const timestamp = now()
    const replace = this.sql.transaction(() => {
      this.sql.prepare('DELETE FROM mcp_tools WHERE mcp_server_id = ?').run(mcpServerId)
      const statement = this.sql.prepare(`
        INSERT INTO mcp_tools(
          id, mcp_server_id, name, description, input_schema_json, annotations_json, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const tool of tools) {
        statement.run(
          randomUUID(),
          mcpServerId,
          tool.name,
          tool.description ?? null,
          stringify(tool.inputSchema ?? {}),
          tool.annotations == null ? null : stringify(tool.annotations),
          timestamp,
        )
      }
    })
    replace()
    return this.listTools(mcpServerId)
  }

  listTools(mcpServerId: string): McpToolRecord[] {
    const rows = this.sql
      .prepare('SELECT * FROM mcp_tools WHERE mcp_server_id = ? ORDER BY name')
      .all(mcpServerId) as Array<{
      id: string
      mcp_server_id: string
      name: string
      description: string | null
      input_schema_json: string
      annotations_json: string | null
      discovered_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      mcpServerId: row.mcp_server_id,
      name: row.name,
      description: row.description,
      inputSchema: parseJson<JsonRecord>(row.input_schema_json, {}),
      annotations: row.annotations_json ? parseJson<JsonRecord>(row.annotations_json, {}) : null,
      discoveredAt: row.discovered_at,
    }))
  }

  listConnectors(): ConnectorRecord[] {
    const rows = this.sql
      .prepare(`
        SELECT c.*, m.name AS mcp_server_name
        FROM connectors c
        JOIN mcp_servers m ON m.id = c.mcp_server_id
        ORDER BY c.created_at DESC
      `)
      .all() as ConnectorRow[]
    return rows.map((row) => this.mapConnector(row))
  }

  getConnector(id: string): ConnectorRecord {
    const row = this.sql
      .prepare(`
        SELECT c.*, m.name AS mcp_server_name
        FROM connectors c
        JOIN mcp_servers m ON m.id = c.mcp_server_id
        WHERE c.id = ?
      `)
      .get(id) as ConnectorRow | undefined
    if (!row) throw new Error(`Connector not found: ${id}`)
    return this.mapConnector(row)
  }

  private mapConnector(row: ConnectorRow): ConnectorRecord {
    return {
      id: row.id,
      mcpServerId: row.mcp_server_id,
      mcpServerName: row.mcp_server_name ?? '',
      name: row.name,
      adapterType: row.adapter_type,
      runtime: row.runtime,
      entryFile: row.entry_file,
      config: parseJson<JsonRecord>(row.config_json, {}),
      syncMode: row.sync_mode,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      capabilities: this.listCapabilities(row.id),
      jobs: this.listSyncJobs(row.id),
    }
  }

  updateConnector(id: string, input: ConnectorUpdateInput): ConnectorRecord {
    const current = this.getConnector(id)
    const timestamp = now()
    const name = input.name?.trim() || current.name
    const adapterType = input.adapterType ?? current.adapterType
    const entryFile = input.entryFile === undefined ? current.entryFile : input.entryFile?.trim() || null
    const config = input.config ?? current.config
    const syncMode = input.syncMode ?? current.syncMode
    if (adapterType === 'node-module' && !entryFile) {
      throw new Error('node-module connector requires an entry file')
    }
    this.sql
      .prepare(`
        UPDATE connectors
        SET name = ?, adapter_type = ?, entry_file = ?, config_json = ?, sync_mode = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(name, adapterType, entryFile, stringify(config), syncMode, timestamp, id)
    return this.getConnector(id)
  }

  addCapability(connectorId: string, input: CapabilityMappingInput): CapabilityMappingRecord {
    const connector = this.getConnector(connectorId)
    const capabilityId = input.capabilityId.trim()
    const toolName = input.toolName.trim()
    if (!capabilityId || !toolName) throw new Error('Capability ID and tool name are required')
    const exists = this.listTools(connector.mcpServerId).some((tool) => tool.name === toolName)
    if (!exists) throw new Error(`Tool is not registered for this MCP: ${toolName}`)
    const id = randomUUID()
    const timestamp = now()
    this.sql
      .prepare(`
        INSERT INTO capability_mappings(
          id, connector_id, capability_id, tool_name, enabled, verified, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
      `)
      .run(id, connectorId, capabilityId, toolName, input.enabled === false ? 0 : 1, stringify(input.config ?? {}), timestamp, timestamp)
    return this.getCapability(id)
  }

  listCapabilities(connectorId: string): CapabilityMappingRecord[] {
    const rows = this.sql
      .prepare('SELECT * FROM capability_mappings WHERE connector_id = ? ORDER BY capability_id, tool_name')
      .all(connectorId) as CapabilityRow[]
    return rows.map((row) => this.mapCapability(row))
  }

  resolveCapability(connectorId: string, capabilityId: string): CapabilityMappingRecord {
    const matches = this.listCapabilities(connectorId).filter(
      (mapping) => mapping.capabilityId === capabilityId && mapping.enabled,
    )
    if (matches.length === 0) {
      throw new Error(`No enabled mapping for capability: ${capabilityId}`)
    }
    if (matches.length > 1) {
      throw new Error(`Capability mapping is ambiguous: ${capabilityId}`)
    }
    return matches[0]
  }

  private getCapability(id: string): CapabilityMappingRecord {
    const row = this.sql.prepare('SELECT * FROM capability_mappings WHERE id = ?').get(id) as CapabilityRow | undefined
    if (!row) throw new Error(`Capability mapping not found: ${id}`)
    return this.mapCapability(row)
  }

  private mapCapability(row: CapabilityRow): CapabilityMappingRecord {
    return {
      id: row.id,
      connectorId: row.connector_id,
      capabilityId: row.capability_id,
      toolName: row.tool_name,
      enabled: Boolean(row.enabled),
      verified: Boolean(row.verified),
      config: parseJson<JsonRecord>(row.config_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  deleteCapability(id: string): void {
    const result = this.sql.prepare('DELETE FROM capability_mappings WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`Capability mapping not found: ${id}`)
  }

  addSyncJob(connectorId: string, input: SyncJobInput): SyncJobRecord {
    const connector = this.getConnector(connectorId)
    if (!input.name.trim() || !input.toolName.trim()) throw new Error('Polling job name and tool name are required')
    if (!Number.isFinite(input.intervalMs) || input.intervalMs < 1000) throw new Error('Polling interval must be at least 1000 ms')
    const exists = this.listTools(connector.mcpServerId).some((tool) => tool.name === input.toolName.trim())
    if (!exists) throw new Error(`Tool is not registered for this MCP: ${input.toolName}`)
    const id = randomUUID()
    const timestamp = now()
    const nextRunAt = input.enabled === false ? null : new Date(Date.now() + input.intervalMs).toISOString()
    this.sql
      .prepare(`
        INSERT INTO sync_jobs(
          id, connector_id, name, mode, tool_name, arguments_json, interval_ms, enabled,
          next_run_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'tool-poll', ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        connectorId,
        input.name.trim(),
        input.toolName.trim(),
        stringify(input.arguments ?? {}),
        Math.trunc(input.intervalMs),
        input.enabled === false ? 0 : 1,
        nextRunAt,
        timestamp,
        timestamp,
      )
    this.sql.prepare("UPDATE connectors SET sync_mode = 'poll', updated_at = ? WHERE id = ?").run(timestamp, connectorId)
    return this.getSyncJob(id)
  }

  getSyncJob(id: string): SyncJobRecord {
    const row = this.sql.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id) as SyncJobRow | undefined
    if (!row) throw new Error(`Sync job not found: ${id}`)
    return this.mapSyncJob(row)
  }

  listSyncJobs(connectorId?: string): SyncJobRecord[] {
    const rows = (connectorId
      ? this.sql.prepare('SELECT * FROM sync_jobs WHERE connector_id = ? ORDER BY created_at').all(connectorId)
      : this.sql.prepare('SELECT * FROM sync_jobs ORDER BY created_at').all()) as SyncJobRow[]
    return rows.map((row) => this.mapSyncJob(row))
  }

  listEnabledSyncJobs(): SyncJobRecord[] {
    const rows = this.sql.prepare('SELECT * FROM sync_jobs WHERE enabled = 1 ORDER BY created_at').all() as SyncJobRow[]
    return rows.map((row) => this.mapSyncJob(row))
  }

  private mapSyncJob(row: SyncJobRow): SyncJobRecord {
    return {
      id: row.id,
      connectorId: row.connector_id,
      name: row.name,
      mode: row.mode,
      toolName: row.tool_name,
      arguments: parseJson<JsonRecord>(row.arguments_json, {}),
      intervalMs: row.interval_ms,
      enabled: Boolean(row.enabled),
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      lastError: row.last_error,
      lastPayloadHash: row.last_payload_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  markSyncJobRun(id: string, payloadHash: string | null, error: string | null = null): void {
    const job = this.getSyncJob(id)
    const timestamp = now()
    const nextRunAt = job.enabled ? new Date(Date.now() + job.intervalMs).toISOString() : null
    this.sql
      .prepare(`
        UPDATE sync_jobs
        SET last_run_at = ?, next_run_at = ?, last_error = ?, last_payload_hash = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(timestamp, nextRunAt, error, payloadHash, timestamp, id)
  }

  deleteSyncJob(id: string): void {
    const row = this.sql.prepare('SELECT connector_id FROM sync_jobs WHERE id = ?').get(id) as { connector_id: string } | undefined
    if (!row) throw new Error(`Sync job not found: ${id}`)
    this.sql.prepare('DELETE FROM sync_jobs WHERE id = ?').run(id)
    const remaining = this.sql.prepare('SELECT COUNT(*) AS total FROM sync_jobs WHERE connector_id = ?').get(row.connector_id) as {
      total: number
    }
    if (remaining.total === 0) {
      this.sql.prepare("UPDATE connectors SET sync_mode = 'manual', updated_at = ? WHERE id = ?").run(now(), row.connector_id)
    }
  }

  addEvent(input: {
    connectorId?: string | null
    mcpServerId?: string | null
    type: string
    payload: unknown
  }): EventRecord {
    const id = randomUUID()
    const createdAt = now()
    this.sql
      .prepare('INSERT INTO events(id, connector_id, mcp_server_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.connectorId ?? null, input.mcpServerId ?? null, input.type, stringify(input.payload), createdAt)
    return {
      id,
      connectorId: input.connectorId ?? null,
      mcpServerId: input.mcpServerId ?? null,
      type: input.type,
      payload: input.payload,
      createdAt,
    }
  }

  listEvents(limit = 100): EventRecord[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500)
    const rows = this.sql
      .prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as Array<{
      id: string
      connector_id: string | null
      mcp_server_id: string | null
      type: string
      payload_json: string
      created_at: string
    }>
    return rows.map((row) => ({
      id: row.id,
      connectorId: row.connector_id,
      mcpServerId: row.mcp_server_id,
      type: row.type,
      payload: parseJson<unknown>(row.payload_json, null),
      createdAt: row.created_at,
    }))
  }

  summary(): {
    mcpServers: number
    connectors: number
    tools: number
    pollingJobs: number
    events: number
    databasePath: string
  } {
    const count = (table: string): number => {
      const row = this.sql.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }
      return row.total
    }
    return {
      mcpServers: count('mcp_servers'),
      connectors: count('connectors'),
      tools: count('mcp_tools'),
      pollingJobs: count('sync_jobs'),
      events: count('events'),
      databasePath: this.db.path,
    }
  }
}
