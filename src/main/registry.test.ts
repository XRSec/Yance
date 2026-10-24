import { describe, expect, it } from 'vitest'
import { YanceDatabase } from './database'
import { YanceRegistry } from './registry'

describe('YanceRegistry', () => {
  it('creates exactly one connector for every registered MCP', () => {
    const db = new YanceDatabase(':memory:')
    const registry = new YanceRegistry(db)

    const server = registry.registerMcp({
      name: 'Test MCP',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    })

    const connectors = registry.listConnectors()
    expect(connectors).toHaveLength(1)
    expect(connectors[0].mcpServerId).toBe(server.id)
    expect(connectors[0].adapterType).toBe('passthrough')
    expect(connectors[0].runtime).toBe('node')

    db.close()
  })

  it('persists tools, capability mappings and polling jobs in plain SQLite tables', () => {
    const db = new YanceDatabase(':memory:')
    const registry = new YanceRegistry(db)
    const server = registry.registerMcp({ name: 'Test MCP', transport: 'stdio', command: 'node' })
    const connector = registry.listConnectors()[0]

    registry.replaceTools(server.id, [
      { name: 'get_messages', description: 'read messages', inputSchema: { type: 'object' } },
    ])
    const capability = registry.addCapability(connector.id, {
      capabilityId: 'conversation.read',
      toolName: 'get_messages',
    })
    const job = registry.addSyncJob(connector.id, {
      name: '5 second poll',
      toolName: 'get_messages',
      intervalMs: 5000,
      arguments: { limit: 20 },
    })

    expect(capability.capabilityId).toBe('conversation.read')
    expect(job.intervalMs).toBe(5000)
    expect(db.listTables()).toContain('mcp_servers')
    expect(db.listTables()).toContain('connectors')
    expect(db.listTables()).toContain('sync_jobs')
    expect(db.readTable('sync_jobs').rows[0].arguments_json).toBe('{"limit":20}')

    db.close()
  })

  it('cascades connector state when an MCP is deleted', () => {
    const db = new YanceDatabase(':memory:')
    const registry = new YanceRegistry(db)
    const server = registry.registerMcp({ name: 'Test MCP', transport: 'stdio', command: 'node' })
    registry.deleteMcp(server.id)
    expect(registry.listMcp()).toHaveLength(0)
    expect(registry.listConnectors()).toHaveLength(0)
    db.close()
  })
})
