import { contextBridge, ipcRenderer } from 'electron'
import type { YanceDesktopApi } from '../src/shared/types'

const api: YanceDesktopApi = {
  getSummary: () => ipcRenderer.invoke('yance:summary'),
  listMcpServers: () => ipcRenderer.invoke('yance:mcp:list'),
  registerMcpServer: (input) => ipcRenderer.invoke('yance:mcp:register', input),
  deleteMcpServer: (id) => ipcRenderer.invoke('yance:mcp:delete', id),
  discoverMcpTools: (id) => ipcRenderer.invoke('yance:mcp:discover', id),
  disconnectMcpServer: (id) => ipcRenderer.invoke('yance:mcp:disconnect', id),
  listMcpTools: (id) => ipcRenderer.invoke('yance:mcp:tools', id),
  listConnectors: () => ipcRenderer.invoke('yance:connector:list'),
  updateConnector: (id, input) => ipcRenderer.invoke('yance:connector:update', id, input),
  addCapabilityMapping: (id, input) => ipcRenderer.invoke('yance:capability:add', id, input),
  deleteCapabilityMapping: (id) => ipcRenderer.invoke('yance:capability:delete', id),
  addSyncJob: (connectorId, input) => ipcRenderer.invoke('yance:sync:add', connectorId, input),
  deleteSyncJob: (id) => ipcRenderer.invoke('yance:sync:delete', id),
  runSyncJob: (id) => ipcRenderer.invoke('yance:sync:run', id),
  listEvents: (limit) => ipcRenderer.invoke('yance:event:list', limit),
  listDatabaseTables: () => ipcRenderer.invoke('yance:db:tables'),
  readDatabaseTable: (table, limit, offset) => ipcRenderer.invoke('yance:db:read', table, limit, offset),
}

contextBridge.exposeInMainWorld('yance', api)
