import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectorRuntime } from './connector-runtime'
import { YanceDatabase } from './database'
import { McpRuntime } from './mcp-runtime'
import { PollingScheduler } from './polling-scheduler'
import { YanceRegistry } from './registry'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('McpRuntime', () => {
  it('discovers real stdio MCP tools and can poll a tool through its connector', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yance-test-'))
    tempDirs.push(dir)
    const db = new YanceDatabase(join(dir, 'yance.sqlite3'))
    const registry = new YanceRegistry(db)
    const runtime = new McpRuntime(registry)
    const connectorRuntime = new ConnectorRuntime(registry, runtime)
    const scheduler = new PollingScheduler(registry, connectorRuntime)

    const server = registry.registerMcp({
      name: 'Synthetic MCP',
      transport: 'stdio',
      command: process.execPath,
      args: [resolve(process.cwd(), 'scripts/test-mcp-server.mjs')],
    })

    const tools = await runtime.discoverTools(server.id)
    expect(tools.map((tool) => tool.name)).toEqual(['get_chat_history', 'list_recent_messages'])

    const connector = registry.getConnector(server.connectorId)
    registry.addCapability(connector.id, {
      capabilityId: 'conversation.read',
      toolName: 'get_chat_history',
    })
    const capabilityResult = await connectorRuntime.invokeCapability(connector.id, 'conversation.read')
    expect(capabilityResult).toMatchObject({ content: [{ type: 'text', text: 'synthetic history' }] })

    registry.updateConnector(connector.id, {
      adapterType: 'node-module',
      entryFile: resolve(process.cwd(), 'examples/connectors/passthrough-with-hooks.mjs'),
    })
    const adapterResult = await connectorRuntime.invokeCapability(connector.id, 'conversation.read')
    expect(adapterResult).toMatchObject({ content: [{ type: 'text', text: 'synthetic history' }] })
    expect(registry.listEvents().some((entry) => entry.type === 'connector.adapter.invoke')).toBe(true)

    const job = registry.addSyncJob(connector.id, {
      name: 'Recent message poll',
      toolName: 'list_recent_messages',
      intervalMs: 5000,
    })
    const event = await scheduler.runJob(job.id)

    expect(event.type).toBe('connector.poll.result')
    expect(registry.getSyncJob(job.id).lastPayloadHash).toMatch(/^[a-f0-9]{64}$/)
    expect(registry.listEvents().some((entry) => entry.type === 'mcp.tools.discovered')).toBe(true)

    scheduler.stop()
    await runtime.closeAll()
    db.close()
  }, 15_000)
})
