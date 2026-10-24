import { createHash } from 'node:crypto'
import type { EventRecord } from '../shared/types'
import { ConnectorRuntime } from './connector-runtime'
import { YanceRegistry } from './registry'

export class PollingScheduler {
  private readonly registry: YanceRegistry
  private readonly connectorRuntime: ConnectorRuntime
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(registry: YanceRegistry, connectorRuntime: ConnectorRuntime) {
    this.registry = registry
    this.connectorRuntime = connectorRuntime
  }

  start(): void {
    this.stop()
    for (const job of this.registry.listEnabledSyncJobs()) {
      this.schedule(job.id, job.intervalMs)
    }
  }

  refresh(): void {
    this.start()
  }

  private schedule(jobId: string, intervalMs: number): void {
    const timer = setInterval(() => {
      void this.runJob(jobId).catch(() => {
        // Error state is persisted by runJob; the scheduler must keep running.
      })
    }, intervalMs)
    timer.unref?.()
    this.timers.set(jobId, timer)
  }

  async runJob(jobId: string): Promise<EventRecord> {
    const job = this.registry.getSyncJob(jobId)
    const connector = this.registry.getConnector(job.connectorId)
    try {
      const result = await this.connectorRuntime.poll(job)
      const serialized = JSON.stringify(result)
      const hash = createHash('sha256').update(serialized).digest('hex')
      this.registry.markSyncJobRun(job.id, hash)
      return this.registry.addEvent({
        connectorId: connector.id,
        mcpServerId: connector.mcpServerId,
        type: 'connector.poll.result',
        payload: {
          jobId: job.id,
          toolName: job.toolName,
          payloadHash: hash,
          result,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.registry.markSyncJobRun(job.id, null, message)
      this.registry.addEvent({
        connectorId: connector.id,
        mcpServerId: connector.mcpServerId,
        type: 'connector.poll.error',
        payload: { jobId: job.id, toolName: job.toolName, error: message },
      })
      throw error
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer)
    this.timers.clear()
  }
}
