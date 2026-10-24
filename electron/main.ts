import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { ConnectorRuntime } from '../src/main/connector-runtime'
import { YanceDatabase } from '../src/main/database'
import { McpRuntime } from '../src/main/mcp-runtime'
import { PollingScheduler } from '../src/main/polling-scheduler'
import { YanceRegistry } from '../src/main/registry'
import type {
  CapabilityMappingInput,
  ConnectorUpdateInput,
  McpServerInput,
  SyncJobInput,
} from '../src/shared/types'

let mainWindow: BrowserWindow | null = null
let database: YanceDatabase | null = null
let registry: YanceRegistry | null = null
let runtime: McpRuntime | null = null
let connectorRuntime: ConnectorRuntime | null = null
let scheduler: PollingScheduler | null = null
let shutdownStarted = false

function requiredServices() {
  if (!database || !registry || !runtime || !connectorRuntime || !scheduler) throw new Error('Yance services are not initialized')
  return { database, registry, runtime, connectorRuntime, scheduler }
}

function initializeServices(): void {
  const dataDir = process.env.YANCE_DATA_DIR || app.getPath('userData')
  database = new YanceDatabase(join(dataDir, 'yance.sqlite3'))
  registry = new YanceRegistry(database)
  runtime = new McpRuntime(registry)
  connectorRuntime = new ConnectorRuntime(registry, runtime)
  scheduler = new PollingScheduler(registry, connectorRuntime)
  scheduler.start()
}

function registerIpcHandlers(): void {
  ipcMain.handle('yance:summary', () => requiredServices().registry.summary())

  ipcMain.handle('yance:mcp:list', () => requiredServices().registry.listMcp())
  ipcMain.handle('yance:mcp:register', (_event, input: McpServerInput) => requiredServices().registry.registerMcp(input))
  ipcMain.handle('yance:mcp:delete', async (_event, id: string) => {
    const { runtime: mcpRuntime, registry: mcpRegistry } = requiredServices()
    await mcpRuntime.disconnect(id)
    mcpRegistry.deleteMcp(id)
  })
  ipcMain.handle('yance:mcp:discover', (_event, id: string) => requiredServices().runtime.discoverTools(id))
  ipcMain.handle('yance:mcp:disconnect', (_event, id: string) => requiredServices().runtime.disconnect(id))
  ipcMain.handle('yance:mcp:tools', (_event, id: string) => requiredServices().registry.listTools(id))

  ipcMain.handle('yance:connector:list', () => requiredServices().registry.listConnectors())
  ipcMain.handle('yance:connector:update', (_event, id: string, input: ConnectorUpdateInput) =>
    requiredServices().registry.updateConnector(id, input),
  )
  ipcMain.handle('yance:capability:add', (_event, connectorId: string, input: CapabilityMappingInput) =>
    requiredServices().registry.addCapability(connectorId, input),
  )
  ipcMain.handle('yance:capability:delete', (_event, id: string) => requiredServices().registry.deleteCapability(id))

  ipcMain.handle('yance:sync:add', (_event, connectorId: string, input: SyncJobInput) => {
    const services = requiredServices()
    const job = services.registry.addSyncJob(connectorId, input)
    services.scheduler.refresh()
    return job
  })
  ipcMain.handle('yance:sync:delete', (_event, id: string) => {
    const services = requiredServices()
    services.registry.deleteSyncJob(id)
    services.scheduler.refresh()
  })
  ipcMain.handle('yance:sync:run', (_event, id: string) => requiredServices().scheduler.runJob(id))

  ipcMain.handle('yance:event:list', (_event, limit?: number) => requiredServices().registry.listEvents(limit))
  ipcMain.handle('yance:db:tables', () => requiredServices().database.listTables())
  ipcMain.handle('yance:db:read', (_event, table: string, limit?: number, offset?: number) =>
    requiredServices().database.readTable(table, limit, offset),
  )
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Yance Server',
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  initializeServices()
  registerIpcHandlers()
  createWindow()

  const smokeExitMs = Number(process.env.YANCE_SMOKE_EXIT_MS || 0)
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) {
    setTimeout(() => app.quit(), smokeExitMs)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('SIGTERM', () => app.quit())
process.on('SIGINT', () => app.quit())

app.on('before-quit', (event) => {
  if (shutdownStarted) return
  shutdownStarted = true
  event.preventDefault()
  scheduler?.stop()
  void (async () => {
    await runtime?.closeAll()
    database?.close()
    app.quit()
  })()
})
