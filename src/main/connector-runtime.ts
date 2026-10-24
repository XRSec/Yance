import { pathToFileURL } from 'node:url'
import type { ConnectorRecord, JsonRecord, SyncJobRecord } from '../shared/types'
import { McpRuntime } from './mcp-runtime'
import { YanceRegistry } from './registry'

interface ConnectorAdapterContext {
  connector: ConnectorRecord
  callTool(toolName: string, args?: JsonRecord): Promise<unknown>
  emit(type: string, payload: unknown): void
}

interface ConnectorAdapterModule {
  invoke?: (
    request: { capabilityId: string; input: JsonRecord; mappedTool: string },
    context: ConnectorAdapterContext,
  ) => Promise<unknown>
  poll?: (request: { job: SyncJobRecord }, context: ConnectorAdapterContext) => Promise<unknown>
}

function isAdapterModule(value: unknown): value is ConnectorAdapterModule {
  return Boolean(value && typeof value === 'object')
}

export class ConnectorRuntime {
  private readonly registry: YanceRegistry
  private readonly mcpRuntime: McpRuntime

  constructor(registry: YanceRegistry, mcpRuntime: McpRuntime) {
    this.registry = registry
    this.mcpRuntime = mcpRuntime
  }

  private context(connector: ConnectorRecord): ConnectorAdapterContext {
    return {
      connector,
      callTool: (toolName, args = {}) => this.mcpRuntime.callTool(connector.mcpServerId, toolName, args),
      emit: (type, payload) => {
        this.registry.addEvent({
          connectorId: connector.id,
          mcpServerId: connector.mcpServerId,
          type,
          payload,
        })
      },
    }
  }

  private async loadAdapter(connector: ConnectorRecord): Promise<ConnectorAdapterModule | null> {
    if (connector.adapterType === 'passthrough') return null
    if (!connector.entryFile) throw new Error(`Connector ${connector.name} has no Node adapter entry file`)

    const url = pathToFileURL(connector.entryFile)
    // A cache-busting query allows a user-authored adapter to be revised during development.
    url.searchParams.set('yanceReload', String(Date.now()))
    const imported = (await import(url.href)) as { default?: unknown }
    const candidate = imported.default ?? imported
    if (!isAdapterModule(candidate)) throw new Error(`Invalid connector adapter module: ${connector.entryFile}`)
    return candidate
  }

  async callTool(connectorId: string, toolName: string, input: JsonRecord = {}): Promise<unknown> {
    const connector = this.registry.getConnector(connectorId)
    return this.mcpRuntime.callTool(connector.mcpServerId, toolName, input)
  }

  async invokeCapability(connectorId: string, capabilityId: string, input: JsonRecord = {}): Promise<unknown> {
    const connector = this.registry.getConnector(connectorId)
    const mapping = this.registry.resolveCapability(connectorId, capabilityId)
    const adapter = await this.loadAdapter(connector)

    if (adapter?.invoke) {
      return adapter.invoke(
        { capabilityId, input, mappedTool: mapping.toolName },
        this.context(connector),
      )
    }

    return this.mcpRuntime.callTool(connector.mcpServerId, mapping.toolName, input)
  }

  async poll(job: SyncJobRecord): Promise<unknown> {
    const connector = this.registry.getConnector(job.connectorId)
    const adapter = await this.loadAdapter(connector)
    if (adapter?.poll) {
      return adapter.poll({ job }, this.context(connector))
    }
    return this.mcpRuntime.callTool(connector.mcpServerId, job.toolName, job.arguments)
  }
}
