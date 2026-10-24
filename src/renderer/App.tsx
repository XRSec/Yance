import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ConnectorRecord,
  DashboardSummary,
  DatabaseTableData,
  EventRecord,
  JsonRecord,
  McpServerInput,
  McpServerRecord,
  McpToolRecord,
} from '../shared/types'

type Page = 'dashboard' | 'mcp' | 'connectors' | 'events' | 'database'

const NAV: Array<{ id: Page; label: string; description: string }> = [
  { id: 'dashboard', label: '概览', description: 'Server Core 状态' },
  { id: 'mcp', label: 'MCP', description: '注册与工具发现' },
  { id: 'connectors', label: 'Connectors', description: '适配与轮询' },
  { id: 'events', label: 'Events', description: '运行事件流' },
  { id: 'database', label: 'Database', description: 'SQLite 明文查看' },
]

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseJsonObject(value: string, label: string): JsonRecord {
  const parsed = JSON.parse(value || '{}') as unknown
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`${label} 必须是 JSON object`)
  return parsed as JsonRecord
}

function parseJsonArray(value: string, label: string): string[] {
  const parsed = JSON.parse(value || '[]') as unknown
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) throw new Error(`${label} 必须是字符串数组`)
  return parsed
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = useCallback(async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setError(null)
    try {
      const result = await action()
      if (success) setNotice(success)
      return result
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    }
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">言</div>
          <div>
            <strong>Yance Server</strong>
            <span>Connector Runtime</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}>
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>MVP</strong>
          <p>每个 MCP 注册时强制生成一个 Connector。大脑以后只接 Connector Capability。</p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{NAV.find((item) => item.id === page)?.label}</h1>
            <p>{NAV.find((item) => item.id === page)?.description}</p>
          </div>
          <div className="runtime-pill"><span /> Local Server</div>
        </header>

        {error && <div className="banner error">{error}<button onClick={() => setError(null)}>关闭</button></div>}
        {notice && <div className="banner success">{notice}<button onClick={() => setNotice(null)}>关闭</button></div>}

        {page === 'dashboard' && <Dashboard run={run} />}
        {page === 'mcp' && <McpPage run={run} />}
        {page === 'connectors' && <ConnectorPage run={run} />}
        {page === 'events' && <EventsPage run={run} />}
        {page === 'database' && <DatabasePage run={run} />}
      </main>
    </div>
  )
}

type Runner = <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>

function Dashboard({ run }: { run: Runner }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const refresh = useCallback(async () => {
    const value = await run(() => window.yance.getSummary())
    if (value) setSummary(value)
  }, [run])

  useEffect(() => { void refresh() }, [refresh])

  if (!summary) return <section className="panel">正在读取本地 Server Core…</section>

  return (
    <>
      <section className="stat-grid">
        <Stat label="MCP Servers" value={summary.mcpServers} />
        <Stat label="Connectors" value={summary.connectors} />
        <Stat label="Discovered Tools" value={summary.tools} />
        <Stat label="Polling Jobs" value={summary.pollingJobs} />
        <Stat label="Events" value={summary.events} />
      </section>
      <section className="panel hero-panel">
        <div>
          <span className="eyebrow">CURRENT ARCHITECTURE</span>
          <h2>MCP → Connector → Capability → Brain</h2>
          <p>原始 MCP 不直接成为 Yance 大脑接口。即使 MCP 可以直接使用，也会先生成 passthrough Connector。</p>
        </div>
        <button className="secondary" onClick={() => void refresh()}>刷新状态</button>
      </section>
      <section className="panel">
        <h3>SQLite 数据文件</h3>
        <code className="path-code">{summary.databasePath}</code>
        <p className="muted">当前 MVP 使用普通 SQLite 文件，数据库页面可直接查看表和原始字段。凭据隔离会在后续安全阶段单独处理。</p>
      </section>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>
}

function McpPage({ run }: { run: Runner }) {
  const [servers, setServers] = useState<McpServerRecord[]>([])
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolRecord[]>>({})
  const [form, setForm] = useState({
    name: '', transport: 'stdio' as McpServerInput['transport'], command: '', args: '[]', cwd: '', url: '', env: '{}',
  })

  const refresh = useCallback(async () => {
    const value = await run(() => window.yance.listMcpServers())
    if (value) setServers(value)
  }, [run])
  useEffect(() => { void refresh() }, [refresh])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await run(async () => {
      const input: McpServerInput = {
        name: form.name,
        transport: form.transport,
        command: form.transport === 'stdio' ? form.command : undefined,
        args: form.transport === 'stdio' ? parseJsonArray(form.args, 'args') : undefined,
        cwd: form.transport === 'stdio' ? form.cwd || undefined : undefined,
        url: form.transport === 'stdio' ? undefined : form.url,
        env: form.transport === 'stdio' ? (parseJsonObject(form.env, 'env') as Record<string, string>) : undefined,
      }
      return window.yance.registerMcpServer(input)
    }, 'MCP 已注册，并自动创建 Connector')
    if (result) {
      setForm({ name: '', transport: 'stdio', command: '', args: '[]', cwd: '', url: '', env: '{}' })
      await refresh()
    }
  }

  async function discover(server: McpServerRecord) {
    const tools = await run(() => window.yance.discoverMcpTools(server.id), `${server.name} 工具发现完成`)
    if (tools) {
      setToolsByServer((current) => ({ ...current, [server.id]: tools }))
      await refresh()
    }
  }

  async function toggleTools(server: McpServerRecord) {
    if (toolsByServer[server.id]) {
      setToolsByServer((current) => {
        const copy = { ...current }
        delete copy[server.id]
        return copy
      })
      return
    }
    const tools = await run(() => window.yance.listMcpTools(server.id))
    if (tools) setToolsByServer((current) => ({ ...current, [server.id]: tools }))
  }

  return (
    <div className="two-column">
      <section className="panel form-panel">
        <span className="eyebrow">REGISTER</span>
        <h2>添加 MCP Server</h2>
        <form onSubmit={submit} className="form-stack">
          <label>名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 WeChat MCP" required /></label>
          <label>Transport<select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as McpServerInput['transport'] })}>
            <option value="stdio">stdio</option><option value="streamable-http">Streamable HTTP</option><option value="sse">SSE (legacy)</option>
          </select></label>
          {form.transport === 'stdio' ? <>
            <label>Command<input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="node / npm / python…" required /></label>
            <label>Args<textarea value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} rows={3} /></label>
            <label>Working directory<input value={form.cwd} onChange={(e) => setForm({ ...form, cwd: e.target.value })} placeholder="可选" /></label>
            <label>Environment<textarea value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} rows={3} /></label>
          </> : <label>MCP URL<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://host.example/mcp" required /></label>}
          <button className="primary" type="submit">注册 MCP + Connector</button>
        </form>
      </section>

      <section className="stack">
        {servers.length === 0 && <div className="panel empty">尚未注册 MCP。</div>}
        {servers.map((server) => <article key={server.id} className="panel server-card">
          <div className="card-head">
            <div><h3>{server.name}</h3><p>{server.transport} · {server.connectorName}</p></div>
            <Status value={server.status} />
          </div>
          <dl className="meta-grid">
            <div><dt>Tools</dt><dd>{server.toolCount}</dd></div>
            <div><dt>Connector</dt><dd>{server.connectorId.slice(0, 8)}</dd></div>
            <div><dt>Endpoint</dt><dd>{server.transport === 'stdio' ? server.command : server.url}</dd></div>
          </dl>
          {server.lastError && <pre className="error-block">{server.lastError}</pre>}
          <div className="actions">
            <button className="primary small" onClick={() => void discover(server)}>连接并发现 Tools</button>
            <button className="secondary small" onClick={() => void toggleTools(server)}>{toolsByServer[server.id] ? '收起 Tools' : '查看 Tools'}</button>
            <button className="secondary small" onClick={async () => { await run(() => window.yance.disconnectMcpServer(server.id), '已断开'); await refresh() }}>断开</button>
            <button className="danger small" onClick={async () => { await run(() => window.yance.deleteMcpServer(server.id), 'MCP 与关联 Connector 已删除'); await refresh() }}>删除</button>
          </div>
          {toolsByServer[server.id] && <div className="tool-list">{toolsByServer[server.id].map((tool) => <div key={tool.id} className="tool-row"><div><strong>{tool.name}</strong><p>{tool.description || '无描述'}</p></div><details><summary>Schema</summary><pre>{json(tool.inputSchema)}</pre></details></div>)}</div>}
        </article>)}
      </section>
    </div>
  )
}

function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value}</span>
}

function ConnectorPage({ run }: { run: Runner }) {
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([])
  const [tools, setTools] = useState<Record<string, McpToolRecord[]>>({})

  const refresh = useCallback(async () => {
    const value = await run(() => window.yance.listConnectors())
    if (!value) return
    setConnectors(value)
    const entries = await Promise.all(value.map(async (connector) => [connector.id, await window.yance.listMcpTools(connector.mcpServerId)] as const))
    setTools(Object.fromEntries(entries))
  }, [run])
  useEffect(() => { void refresh() }, [refresh])

  return <section className="stack">
    <div className="panel hero-panel">
      <div><span className="eyebrow">CONNECTOR CONTRACT</span><h2>每个 MCP 必须经过 Connector</h2><p>默认 passthrough；需要补齐轮询、定位会话或平台特殊逻辑时，可切换为 Node module Adapter。</p></div>
    </div>
    {connectors.length === 0 && <div className="panel empty">注册 MCP 后会自动生成 Connector。</div>}
    {connectors.map((connector) => <ConnectorCard key={connector.id} connector={connector} tools={tools[connector.id] ?? []} run={run} refresh={refresh} />)}
  </section>
}

function ConnectorCard({ connector, tools, run, refresh }: { connector: ConnectorRecord; tools: McpToolRecord[]; run: Runner; refresh: () => Promise<void> }) {
  const [adapterType, setAdapterType] = useState(connector.adapterType)
  const [entryFile, setEntryFile] = useState(connector.entryFile ?? '')
  const [capabilityId, setCapabilityId] = useState('conversation.read')
  const [capabilityTool, setCapabilityTool] = useState(tools[0]?.name ?? '')
  const [pollName, setPollName] = useState('Recent messages poll')
  const [pollTool, setPollTool] = useState(tools[0]?.name ?? '')
  const [pollArgs, setPollArgs] = useState('{}')
  const [interval, setIntervalValue] = useState('5000')

  useEffect(() => {
    if (!capabilityTool && tools[0]) setCapabilityTool(tools[0].name)
    if (!pollTool && tools[0]) setPollTool(tools[0].name)
  }, [tools, capabilityTool, pollTool])

  return <article className="panel connector-card">
    <div className="card-head"><div><h3>{connector.name}</h3><p>MCP: {connector.mcpServerName}</p></div><Status value={connector.status} /></div>
    <div className="connector-sections">
      <div className="subpanel">
        <h4>Adapter</h4>
        <label>类型<select value={adapterType} onChange={(e) => setAdapterType(e.target.value as ConnectorRecord['adapterType'])}><option value="passthrough">passthrough</option><option value="node-module">node-module</option></select></label>
        {adapterType === 'node-module' && <label>Node entry file<input value={entryFile} onChange={(e) => setEntryFile(e.target.value)} placeholder="/path/to/connector/index.js" /></label>}
        <button className="secondary small" onClick={async () => { await run(() => window.yance.updateConnector(connector.id, { adapterType, entryFile: entryFile || null }), 'Connector 配置已保存'); await refresh() }}>保存 Adapter</button>
        <p className="muted">node-module 会以当前用户权限运行，当前尚未沙箱化；只应配置你信任的本地 Adapter。</p>
      </div>

      <div className="subpanel">
        <h4>Capability Mapping</h4>
        <label>Yance Capability<input value={capabilityId} onChange={(e) => setCapabilityId(e.target.value)} placeholder="conversation.read" /></label>
        <label>MCP Tool<select value={capabilityTool} onChange={(e) => setCapabilityTool(e.target.value)}>{tools.map((tool) => <option key={tool.id}>{tool.name}</option>)}</select></label>
        <button className="secondary small" disabled={!capabilityTool} onClick={async () => { await run(() => window.yance.addCapabilityMapping(connector.id, { capabilityId, toolName: capabilityTool }), 'Capability 已映射'); await refresh() }}>添加映射</button>
        <div className="chip-list">{connector.capabilities.map((cap) => <span className="chip" key={cap.id}>{cap.capabilityId} ← {cap.toolName}<button onClick={async () => { await run(() => window.yance.deleteCapabilityMapping(cap.id)); await refresh() }}>×</button></span>)}</div>
      </div>

      <div className="subpanel">
        <h4>Polling / Hook Fallback</h4>
        <label>任务名称<input value={pollName} onChange={(e) => setPollName(e.target.value)} /></label>
        <label>调用 Tool<select value={pollTool} onChange={(e) => setPollTool(e.target.value)}>{tools.map((tool) => <option key={tool.id}>{tool.name}</option>)}</select></label>
        <div className="inline-fields"><label>间隔 ms<input type="number" min="1000" value={interval} onChange={(e) => setIntervalValue(e.target.value)} /></label><label>Arguments<textarea rows={2} value={pollArgs} onChange={(e) => setPollArgs(e.target.value)} /></label></div>
        <button className="primary small" disabled={!pollTool} onClick={async () => { await run(() => window.yance.addSyncJob(connector.id, { name: pollName, toolName: pollTool, arguments: parseJsonObject(pollArgs, 'Arguments'), intervalMs: Number(interval) }), 'Polling Job 已创建'); await refresh() }}>创建轮询任务</button>
        <div className="job-list">{connector.jobs.map((job) => <div className="job" key={job.id}><div><strong>{job.name}</strong><small>{job.toolName} · 每 {job.intervalMs} ms</small><small>last: {job.lastRunAt || 'never'} {job.lastError ? `· ${job.lastError}` : ''}</small></div><div className="actions"><button className="secondary small" onClick={async () => { await run(() => window.yance.runSyncJob(job.id), '已手动执行一次'); await refresh() }}>Run</button><button className="danger small" onClick={async () => { await run(() => window.yance.deleteSyncJob(job.id)); await refresh() }}>删除</button></div></div>)}</div>
      </div>
    </div>
  </article>
}

function EventsPage({ run }: { run: Runner }) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const refresh = useCallback(async () => {
    const value = await run(() => window.yance.listEvents(200))
    if (value) setEvents(value)
  }, [run])
  useEffect(() => { void refresh() }, [refresh])
  return <section className="panel"><div className="section-head"><div><h2>Connector Event Stream</h2><p>轮询结果、错误与工具发现都会写入事件表。</p></div><button className="secondary" onClick={() => void refresh()}>刷新</button></div><div className="event-list">{events.map((event) => <details key={event.id} className="event"><summary><span>{event.type}</span><time>{event.createdAt}</time></summary><pre>{json(event.payload)}</pre></details>)}{events.length === 0 && <div className="empty">暂无事件。</div>}</div></section>
}

function DatabasePage({ run }: { run: Runner }) {
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState('')
  const [data, setData] = useState<DatabaseTableData | null>(null)

  const refreshTables = useCallback(async () => {
    const value = await run(() => window.yance.listDatabaseTables())
    if (!value) return
    setTables(value)
    setTable((current) => current || value[0] || '')
  }, [run])
  useEffect(() => { void refreshTables() }, [refreshTables])
  useEffect(() => {
    if (!table) return
    void run(() => window.yance.readDatabaseTable(table, 200, 0)).then((value) => { if (value) setData(value) })
  }, [table, run])

  const visibleRows = useMemo(() => data?.rows ?? [], [data])
  return <section className="panel database-panel">
    <div className="section-head"><div><span className="eyebrow">PLAIN SQLITE</span><h2>Database Explorer</h2><p>这里直接展示 SQLite 中实际保存的字段，不做 ORM 美化。</p></div><select className="table-select" value={table} onChange={(e) => setTable(e.target.value)}>{tables.map((item) => <option key={item}>{item}</option>)}</select></div>
    {data && <><div className="table-meta">{data.table} · {data.total} rows · 当前显示 {visibleRows.length}</div><div className="table-scroll"><table><thead><tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={index}>{data.columns.map((column) => <td key={column}><Cell value={row[column]} /></td>)}</tr>)}</tbody></table></div></>}
  </section>
}

function Cell({ value }: { value: unknown }) {
  if (value == null) return <span className="null">NULL</span>
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return <span title={text}>{text.length > 180 ? `${text.slice(0, 180)}…` : text}</span>
}

export default App
