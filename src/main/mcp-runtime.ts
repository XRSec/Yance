import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JsonRecord, McpToolRecord } from '../shared/types'
import { YanceRegistry } from './registry'

interface RuntimeConnection {
  client: Client
  transport: Transport
}

export class McpRuntime {
  private readonly registry: YanceRegistry
  private readonly connections = new Map<string, RuntimeConnection>()

  constructor(registry: YanceRegistry) {
    this.registry = registry
  }

  private async createConnection(mcpServerId: string): Promise<RuntimeConnection> {
    const server = this.registry.getMcp(mcpServerId)
    const client = new Client({ name: 'yance-server', version: '0.1.0' }, { capabilities: {} })
    let transport: Transport

    if (server.transport === 'stdio') {
      transport = new StdioClientTransport({
        command: server.command!,
        args: server.args ?? [],
        cwd: server.cwd,
        env: { ...getDefaultEnvironment(), ...(server.env ?? {}) },
        stderr: 'pipe',
      })
    } else if (server.transport === 'streamable-http') {
      transport = new StreamableHTTPClientTransport(new URL(server.url!))
    } else {
      transport = new SSEClientTransport(new URL(server.url!))
    }

    try {
      await client.connect(transport)
      this.registry.setMcpStatus(mcpServerId, 'connected')
      return { client, transport }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.registry.setMcpStatus(mcpServerId, 'error', message)
      try {
        await transport.close()
      } catch {
        // Nothing else to clean up after a failed connection.
      }
      throw error
    }
  }

  async connect(mcpServerId: string): Promise<Client> {
    const existing = this.connections.get(mcpServerId)
    if (existing) return existing.client
    const connection = await this.createConnection(mcpServerId)
    this.connections.set(mcpServerId, connection)
    return connection.client
  }

  async discoverTools(mcpServerId: string): Promise<McpToolRecord[]> {
    try {
      const client = await this.connect(mcpServerId)
      const result = await client.listTools()
      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      }))
      const records = this.registry.replaceTools(mcpServerId, tools)
      this.registry.setMcpStatus(mcpServerId, 'connected')
      this.registry.addEvent({
        mcpServerId,
        type: 'mcp.tools.discovered',
        payload: { count: records.length, tools: records.map((tool) => tool.name) },
      })
      return records
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.registry.setMcpStatus(mcpServerId, 'error', message)
      throw error
    }
  }

  async callTool(mcpServerId: string, toolName: string, args: JsonRecord = {}): Promise<unknown> {
    const client = await this.connect(mcpServerId)
    return client.callTool({ name: toolName, arguments: args })
  }

  async disconnect(mcpServerId: string): Promise<void> {
    const connection = this.connections.get(mcpServerId)
    if (connection) {
      this.connections.delete(mcpServerId)
      await connection.client.close()
    }
    try {
      this.registry.setMcpStatus(mcpServerId, 'registered')
    } catch {
      // MCP may have already been deleted from the registry.
    }
  }

  async closeAll(): Promise<void> {
    const ids = [...this.connections.keys()]
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }
}
