export type McpTransport = 'stdio' | 'streamable-http' | 'sse'

export type JsonRecord = Record<string, unknown>

export interface McpServerInput {
  name: string
  transport: McpTransport
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  env?: Record<string, string>
}

export interface McpServerRecord extends McpServerInput {
  id: string
  status: string
  lastError: string | null
  createdAt: string
  updatedAt: string
  connectorId: string
  connectorName: string
  toolCount: number
}

export interface McpToolRecord {
  id: string
  mcpServerId: string
  name: string
  description: string | null
  inputSchema: JsonRecord
  annotations: JsonRecord | null
  discoveredAt: string
}

export type ConnectorAdapterType = 'passthrough' | 'node-module'
export type ConnectorSyncMode = 'manual' | 'poll'

export interface ConnectorRecord {
  id: string
  mcpServerId: string
  mcpServerName: string
  name: string
  adapterType: ConnectorAdapterType
  runtime: 'node'
  entryFile: string | null
  config: JsonRecord
  syncMode: ConnectorSyncMode
  status: string
  createdAt: string
  updatedAt: string
  capabilities: CapabilityMappingRecord[]
  jobs: SyncJobRecord[]
}

export interface ConnectorUpdateInput {
  name?: string
  adapterType?: ConnectorAdapterType
  entryFile?: string | null
  config?: JsonRecord
  syncMode?: ConnectorSyncMode
}

export interface CapabilityMappingRecord {
  id: string
  connectorId: string
  capabilityId: string
  toolName: string
  enabled: boolean
  verified: boolean
  config: JsonRecord
  createdAt: string
  updatedAt: string
}

export interface CapabilityMappingInput {
  capabilityId: string
  toolName: string
  enabled?: boolean
  config?: JsonRecord
}

export interface SyncJobRecord {
  id: string
  connectorId: string
  name: string
  mode: 'tool-poll'
  toolName: string
  arguments: JsonRecord
  intervalMs: number
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastError: string | null
  lastPayloadHash: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncJobInput {
  name: string
  toolName: string
  arguments?: JsonRecord
  intervalMs: number
  enabled?: boolean
}

export interface EventRecord {
  id: string
  connectorId: string | null
  mcpServerId: string | null
  type: string
  payload: unknown
  createdAt: string
}

export interface DatabaseTableData {
  table: string
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
}

export interface DashboardSummary {
  mcpServers: number
  connectors: number
  tools: number
  pollingJobs: number
  events: number
  databasePath: string
}

export interface YanceDesktopApi {
  getSummary(): Promise<DashboardSummary>
  listMcpServers(): Promise<McpServerRecord[]>
  registerMcpServer(input: McpServerInput): Promise<McpServerRecord>
  deleteMcpServer(id: string): Promise<void>
  discoverMcpTools(id: string): Promise<McpToolRecord[]>
  disconnectMcpServer(id: string): Promise<void>
  listMcpTools(id: string): Promise<McpToolRecord[]>
  listConnectors(): Promise<ConnectorRecord[]>
  updateConnector(id: string, input: ConnectorUpdateInput): Promise<ConnectorRecord>
  addCapabilityMapping(id: string, input: CapabilityMappingInput): Promise<CapabilityMappingRecord>
  deleteCapabilityMapping(id: string): Promise<void>
  addSyncJob(connectorId: string, input: SyncJobInput): Promise<SyncJobRecord>
  deleteSyncJob(id: string): Promise<void>
  runSyncJob(id: string): Promise<EventRecord>
  listEvents(limit?: number): Promise<EventRecord[]>
  listDatabaseTables(): Promise<string[]>
  readDatabaseTable(table: string, limit?: number, offset?: number): Promise<DatabaseTableData>
}
