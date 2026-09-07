import { useDeferredValue, useState } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Hash,
  MapPin,
  MessageSquareText,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Signal,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import './App.css'
import { useMonitorData } from './hooks/useMonitorData'
import { analyzeSnapshot, RANGE_OPTIONS } from './lib/analytics'
import { API_BASE_URL } from './lib/api'
import type { HeardMessage, HeardNode, MonitorStatus, RangeKey } from './types'

const numberFormatter = new Intl.NumberFormat()
const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const tooltipStyle = {
  background: '#17201d',
  border: '0',
  borderRadius: '6px',
  color: '#f8faf7',
  fontFamily: 'Manrope Variable, sans-serif',
  fontSize: '12px',
  boxShadow: '0 12px 28px rgba(23, 32, 29, 0.18)',
}

function formatRelative(value: string | null): string {
  if (!value) return 'never'
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000))
  if (elapsedSeconds < 10) return 'just now'
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDateTime(value: string | null): string {
  if (!value) return 'No activity'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function nodeName(node: HeardNode): string {
  return node.longName || node.shortName || node.nodeId
}

function messageSource(message: HeardMessage, nodesById: Map<string, HeardNode>): string {
  const node = nodesById.get(message.fromId)
  return node ? nodeName(node) : message.fromId
}

function messageSummary(message: HeardMessage): string {
  if (message.text) return message.text
  if (message.encrypted) return 'Encrypted payload'
  if (message.portName) return message.portName.replace(/_APP$/, '').replaceAll('_', ' ')
  return 'Unknown payload'
}

function signalTone(rssi: number | null): string {
  if (rssi === null) return 'neutral'
  if (rssi >= -90) return 'strong'
  if (rssi >= -110) return 'fair'
  return 'weak'
}

interface SidebarProps {
  status: MonitorStatus | null
}

function Sidebar({ status }: SidebarProps) {
  const isOnline = status?.storage.connected === true
  return (
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Camillia mesh analytics home">
        <span className="brand-mark" aria-hidden="true">
          <Radio size={20} strokeWidth={2.2} />
        </span>
        <span>
          <strong>Camillia</strong>
          <small>Mesh analytics</small>
        </span>
      </a>

      <nav className="primary-nav" aria-label="Dashboard sections">
        <a href="#overview"><Activity size={17} />Overview</a>
        <a href="#mesh"><Signal size={17} />Mesh</a>
        <a href="#traffic"><MessageSquareText size={17} />Traffic</a>
        <a href="#mqtt"><Wifi size={17} />MQTT</a>
      </nav>

      <div className="sidebar-status">
        <div className={`service-indicator ${isOnline ? 'online' : 'offline'}`}>
          <span className="status-dot" />
          <span>{isOnline ? 'Ingestor online' : 'Ingestor offline'}</span>
        </div>
        {status ? <p>v{status.version} · {status.storage.driver}</p> : <p>{API_BASE_URL}</p>}
      </div>
    </aside>
  )
}

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: 'teal' | 'blue' | 'amber' | 'coral'
}

function MetricCard({ icon: Icon, label, value, detail, tone }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-heading">
        <span>{label}</span>
        <Icon size={18} aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="empty-chart">
      <CircleDot size={20} />
      <span>{label}</span>
    </div>
  )
}

function LoadingDashboard() {
  return (
    <div className="loading-dashboard" aria-label="Loading analytics">
      <div className="skeleton skeleton-title" />
      <div className="metric-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton skeleton-metric" key={index} />
        ))}
      </div>
      <div className="skeleton-grid">
        <div className="skeleton skeleton-chart" />
        <div className="skeleton skeleton-chart" />
      </div>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <section className="error-state" role="alert">
      <span className="error-icon"><Server size={24} /></span>
      <p className="eyebrow">Connection unavailable</p>
      <h2>Ingestor data is out of reach</h2>
      <p>{message}</p>
      <code>{API_BASE_URL}</code>
      <button className="primary-button" type="button" onClick={onRetry}>
        <RefreshCw size={16} />Retry connection
      </button>
    </section>
  )
}

function App() {
  const [range, setRange] = useState<RangeKey>('24h')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [nodeQuery, setNodeQuery] = useState('')
  const [nodePage, setNodePage] = useState(0)
  const deferredNodeQuery = useDeferredValue(nodeQuery)
  const { snapshot, error, isLoading, isRefreshing, refresh } = useMonitorData(range, autoRefresh)

  const analytics = snapshot ? analyzeSnapshot(snapshot, range) : null
  const rangeTitle = RANGE_OPTIONS.find((option) => option.key === range)?.title ?? ''
  const normalizedQuery = deferredNodeQuery.trim().toLowerCase()
  const filteredNodes = (snapshot?.nodes ?? []).filter((node) => {
    if (!normalizedQuery) return true
    return [node.longName, node.shortName, node.nodeId, node.hwModel, node.role, node.preset]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery))
  })
  const pageSize = 8
  const nodePageCount = Math.max(1, Math.ceil(filteredNodes.length / pageSize))
  const safeNodePage = Math.min(nodePage, nodePageCount - 1)
  const visibleNodes = filteredNodes.slice(safeNodePage * pageSize, (safeNodePage + 1) * pageSize)
  const nodesById = new Map((snapshot?.nodes ?? []).map((node) => [node.nodeId, node]))
  const recentMessages = snapshot?.messages.slice(0, 8) ?? []
  const topChannels = snapshot?.mqttChannels.slice(0, 7).reverse() ?? []

  return (
    <div className="app-shell">
      <Sidebar status={snapshot?.status ?? null} />

      <main className="dashboard">
        <header className="page-header" id="overview">
          <div>
            <p className="eyebrow">Live mesh · {snapshot?.status.environment ?? 'waiting for data'}</p>
            <h1>Network overview</h1>
            <p className="page-subtitle">
              {snapshot
                ? `Snapshot synced ${formatRelative(snapshot.fetchedAt)} · ${rangeTitle}`
                : 'Connecting to the monitor ingestor'}
            </p>
          </div>

          <div className="header-controls">
            <div className="range-control" aria-label="Analytics time range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={range === option.key ? 'active' : ''}
                  aria-pressed={range === option.key}
                  title={option.title}
                  key={option.key}
                  onClick={() => {
                    setRange(option.key)
                    setNodePage(0)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="auto-refresh">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              <span aria-hidden="true" />
              Auto
            </label>
            <button
              className="icon-button"
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              aria-label="Refresh analytics"
              title="Refresh analytics"
            >
              <RefreshCw className={isRefreshing ? 'spinning' : ''} size={18} />
            </button>
          </div>
        </header>

        {error && snapshot ? (
          <div className="inline-alert" role="alert">
            <Server size={17} />
            <span><strong>Latest refresh failed.</strong> Showing the last successful snapshot. {error}</span>
            <button type="button" onClick={refresh}>Retry</button>
          </div>
        ) : null}

        {isLoading ? <LoadingDashboard /> : null}
        {!isLoading && !snapshot && error ? <ErrorState message={error} onRetry={refresh} /> : null}

        {snapshot && analytics ? (
          <div className="dashboard-content">
            <section className="metric-grid" aria-label="Network summary">
              <MetricCard
                icon={Radio}
                label="Nodes heard"
                value={numberFormatter.format(analytics.activeNodes)}
                detail={`${numberFormatter.format(snapshot.status.mesh.knownNodes)} known overall`}
                tone="teal"
              />
              <MetricCard
                icon={MessageSquareText}
                label="Packets"
                value={numberFormatter.format(snapshot.messages.length)}
                detail={`${compactFormatter.format(snapshot.messageTotal)} stored · ${analytics.messageRate.toFixed(1)}/hr`}
                tone="blue"
              />
              <MetricCard
                icon={Signal}
                label="Direct RF reach"
                value={`${Math.round(analytics.directShare)}%`}
                detail={`${analytics.directNodes} direct · ${analytics.mqttNodes} via MQTT`}
                tone="amber"
              />
              <MetricCard
                icon={Hash}
                label="Active topics"
                value={numberFormatter.format(analytics.activeTopics)}
                detail={`${snapshot.mqttTopicTotal} stored · ${analytics.activeChannels} channels active`}
                tone="coral"
              />
            </section>

            <section className="analytics-grid" aria-label="Traffic analytics">
              <article className="panel traffic-chart-panel">
                <div className="panel-heading">
                  <div><p className="section-kicker">Traffic cadence</p><h2>Packet activity</h2></div>
                  <div className="chart-legend" aria-label="Chart legend">
                    <span><i className="legend-teal" />Packets</span>
                    <span><i className="legend-blue" />Receptions</span>
                  </div>
                </div>
                {snapshot.messages.length > 0 ? (
                  <div className="chart-frame" role="img" aria-label="Packets and receptions over time">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.activity} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="packetsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#e4e8e4" strokeDasharray="3 4" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 11 }} minTickGap={22} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 11 }} />
                        <ChartTooltip contentStyle={tooltipStyle} cursor={{ stroke: '#aab3ae', strokeDasharray: '3 3' }} />
                        <Area type="monotone" dataKey="receptions" name="Receptions" stroke="#3b6ea8" strokeWidth={1.5} fill="transparent" />
                        <Area type="monotone" dataKey="messages" name="Packets" stroke="#0f766e" strokeWidth={2.5} fill="url(#packetsFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart label="No packet activity in this window" />}
              </article>

              <article className="panel pulse-panel">
                <div className="panel-heading">
                  <div><p className="section-kicker">Link health</p><h2>Mesh pulse</h2></div>
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div className="pulse-primary">
                  <strong>{analytics.medianRssi === null ? '—' : `${analytics.medianRssi.toFixed(0)} dBm`}</strong>
                  <span>Median RSSI</span>
                </div>
                <div className="signal-stack" aria-label="Signal quality distribution">
                  {analytics.signalMix.map((item) => (
                    <span
                      key={item.name}
                      style={{ backgroundColor: item.color, flexGrow: item.value, display: item.value === 0 ? 'none' : undefined }}
                      title={`${item.name}: ${item.value}`}
                    />
                  ))}
                </div>
                <div className="signal-legend">
                  {analytics.signalMix.map((item) => (
                    <div key={item.name}><i style={{ backgroundColor: item.color }} /><span>{item.name}</span><strong>{item.value}</strong></div>
                  ))}
                </div>
                <dl className="pulse-stats">
                  <div><dt>Median SNR</dt><dd>{analytics.medianSnr === null ? '—' : `${analytics.medianSnr.toFixed(1)} dB`}</dd></div>
                  <div><dt>Average hops</dt><dd>{analytics.averageHops === null ? '—' : analytics.averageHops.toFixed(1)}</dd></div>
                  <div><dt>RF redundancy</dt><dd>{analytics.redundancy.toFixed(1)}×</dd></div>
                </dl>
              </article>
            </section>

            <section className="analytics-grid split-even" id="traffic" aria-label="Message analysis">
              <article className="panel">
                <div className="panel-heading">
                  <div><p className="section-kicker">Contributors</p><h2>Top senders</h2></div>
                  <span className="panel-stat">{analytics.topSenders.length} sources</span>
                </div>
                {analytics.topSenders.length > 0 ? (
                  <div className="bar-chart-frame" role="img" aria-label="Top message senders">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topSenders} layout="vertical" margin={{ top: 4, right: 12, left: 2, bottom: 0 }}>
                        <CartesianGrid horizontal={false} stroke="#e4e8e4" strokeDasharray="3 4" />
                        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={106} axisLine={false} tickLine={false} tick={{ fill: '#4f5b55', fontSize: 11 }} />
                        <ChartTooltip contentStyle={tooltipStyle} cursor={{ fill: '#f0f3f0' }} />
                        <Bar dataKey="messages" name="Packets" fill="#0f766e" radius={[0, 3, 3, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart label="No senders in this window" />}
              </article>

              <article className="panel mix-panel">
                <div className="panel-heading">
                  <div><p className="section-kicker">Payloads</p><h2>Message mix</h2></div>
                  <span className="panel-stat">{Math.round(analytics.encryptedShare)}% encrypted</span>
                </div>
                {analytics.messageMix.length > 0 ? (
                  <div className="mix-content">
                    <div className="donut-frame" role="img" aria-label="Message type distribution">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={analytics.messageMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                            {analytics.messageMix.map((item) => <Cell key={item.name} fill={item.color} />)}
                          </Pie>
                          <ChartTooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="donut-label"><strong>{analytics.telemetrySamples}</strong><span>telemetry</span></div>
                    </div>
                    <div className="mix-legend">
                      {analytics.messageMix.map((item) => (
                        <div key={item.name}><i style={{ backgroundColor: item.color }} /><span title={item.name}>{item.name}</span><strong>{item.value}</strong></div>
                      ))}
                    </div>
                  </div>
                ) : <EmptyChart label="No payloads to classify" />}
              </article>
            </section>

            <section className="section-block" id="mesh">
              <div className="section-heading">
                <div><p className="section-kicker">Mesh intelligence</p><h2>Node footprint</h2></div>
                <p>{analytics.locations.length} nodes with reported coordinates</p>
              </div>

              <article className="panel location-panel">
                <div className="location-summary">
                  <span className="location-icon"><MapPin size={19} /></span>
                  <div><strong>{analytics.locations.length}</strong><span>positioned nodes</span></div>
                  <div><strong>{analytics.directNodes}</strong><span>direct RF nodes</span></div>
                  <div><strong>{analytics.mqttNodes}</strong><span>MQTT nodes</span></div>
                </div>
                {analytics.locations.length > 0 ? (
                  <div className="map-frame" role="img" aria-label="Node coordinate scatter plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 18, right: 18, bottom: 2, left: 0 }}>
                        <CartesianGrid stroke="#d9dfda" strokeDasharray="2 5" />
                        <XAxis type="number" dataKey="longitude" name="Longitude" domain={['auto', 'auto']} tickFormatter={(value: number) => value.toFixed(2)} axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 10 }} />
                        <YAxis type="number" dataKey="latitude" name="Latitude" domain={['auto', 'auto']} tickFormatter={(value: number) => value.toFixed(2)} axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 10 }} width={42} />
                        <ZAxis range={[64, 64]} />
                        <ChartTooltip contentStyle={tooltipStyle} cursor={{ stroke: '#aab3ae', strokeDasharray: '3 3' }} />
                        <Scatter name="Nodes" data={analytics.locations} fill="#d5523f" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart label="No node positions reported" />}
              </article>

              <article className="panel table-panel">
                <div className="panel-heading table-heading">
                  <div><p className="section-kicker">Inventory</p><h2>Recently heard nodes</h2></div>
                  <label className="search-control">
                    <Search size={16} aria-hidden="true" />
                    <span className="sr-only">Search nodes</span>
                    <input
                      type="search"
                      value={nodeQuery}
                      placeholder="Search nodes"
                      onChange={(event) => {
                        setNodeQuery(event.target.value)
                        setNodePage(0)
                      }}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Node</th><th>Last heard</th><th>Path</th><th>RSSI</th><th>SNR</th><th>Hops</th><th>Battery</th><th>Preset</th></tr>
                    </thead>
                    <tbody>
                      {visibleNodes.map((node) => (
                        <tr key={node.nodeId}>
                          <td>
                            <div className="node-cell">
                              <span>{node.shortName?.slice(0, 2) || node.nodeId.slice(-2)}</span>
                              <div><strong>{nodeName(node)}</strong><small>{node.nodeId} · {node.hwModel || 'Unknown hardware'}</small></div>
                            </div>
                          </td>
                          <td><span title={formatDateTime(node.lastHeardAt)}>{formatRelative(node.lastHeardAt)}</span></td>
                          <td><span className={`path-badge ${node.signal.viaMqtt ? 'mqtt' : 'direct'}`}>{node.signal.viaMqtt ? 'MQTT' : 'Direct'}</span></td>
                          <td><span className={`signal-value ${signalTone(node.signal.rssi)}`}>{node.signal.rssi === null ? '—' : `${node.signal.rssi} dBm`}</span></td>
                          <td>{node.signal.snr === null ? '—' : `${node.signal.snr.toFixed(1)} dB`}</td>
                          <td>{node.signal.hopsAway ?? '—'}</td>
                          <td>{node.batteryLevel === null ? '—' : node.batteryLevel > 100 ? 'External' : `${node.batteryLevel}%`}</td>
                          <td>{node.preset || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleNodes.length === 0 ? <EmptyChart label="No nodes match this search" /> : null}
                </div>
                <div className="table-footer">
                  <span>{filteredNodes.length === 0 ? '0 nodes' : `${safeNodePage * pageSize + 1}–${Math.min((safeNodePage + 1) * pageSize, filteredNodes.length)} of ${filteredNodes.length}`}</span>
                  <div>
                    <button type="button" aria-label="Previous node page" title="Previous page" disabled={safeNodePage === 0} onClick={() => setNodePage(Math.max(0, safeNodePage - 1))}><ChevronLeft size={16} /></button>
                    <span>{safeNodePage + 1} / {nodePageCount}</span>
                    <button type="button" aria-label="Next node page" title="Next page" disabled={safeNodePage >= nodePageCount - 1} onClick={() => setNodePage(Math.min(nodePageCount - 1, safeNodePage + 1))}><ChevronRight size={16} /></button>
                  </div>
                </div>
              </article>
            </section>

            <section className="section-block" aria-label="Recent mesh packets">
              <div className="section-heading">
                <div><p className="section-kicker">Packet log</p><h2>Recent traffic</h2></div>
                <p>{numberFormatter.format(analytics.totalReceptions)} receptions in this snapshot</p>
              </div>
              <article className="panel table-panel message-table">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Source</th><th>Payload</th><th>Port</th><th>Signal</th><th>Hops</th><th>Heard</th></tr></thead>
                    <tbody>
                      {recentMessages.map((message) => (
                        <tr key={message.id}>
                          <td><strong>{messageSource(message, nodesById)}</strong><small>{message.fromId}</small></td>
                          <td><span className="message-preview" title={messageSummary(message)}>{messageSummary(message)}</span></td>
                          <td>{message.encrypted ? <span className="path-badge encrypted">Encrypted</span> : message.portName?.replace(/_APP$/, '') || 'Unknown'}</td>
                          <td><span className={`signal-value ${signalTone(message.reception.rssi)}`}>{message.reception.rssi === null ? '—' : `${message.reception.rssi} dBm`}</span></td>
                          <td>{message.reception.hopsAway ?? '—'}</td>
                          <td><span title={formatDateTime(message.reception.heardAt)}>{formatRelative(message.reception.heardAt)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {recentMessages.length === 0 ? <EmptyChart label="No recent packets" /> : null}
                </div>
              </article>
            </section>

            <section className="section-block" id="mqtt">
              <div className="section-heading">
                <div><p className="section-kicker">Broker census</p><h2>MQTT activity</h2></div>
                <p>{snapshot.mqttChannels.length} channels · {snapshot.mqttTopicTotal} topics stored</p>
              </div>
              <div className="analytics-grid split-even">
                <article className="panel">
                  <div className="panel-heading">
                    <div><p className="section-kicker">Channel density</p><h2>Topics by channel</h2></div>
                    <Database size={20} aria-hidden="true" />
                  </div>
                  {topChannels.length > 0 ? (
                    <div className="bar-chart-frame" role="img" aria-label="MQTT topics by channel">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topChannels} layout="vertical" margin={{ top: 4, right: 12, left: 2, bottom: 0 }}>
                          <CartesianGrid horizontal={false} stroke="#e4e8e4" strokeDasharray="3 4" />
                          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#7a847f', fontSize: 11 }} />
                          <YAxis dataKey="channel" type="category" width={104} axisLine={false} tickLine={false} tick={{ fill: '#4f5b55', fontSize: 11 }} />
                          <ChartTooltip contentStyle={tooltipStyle} cursor={{ fill: '#f0f3f0' }} />
                          <Bar dataKey="topics" name="Topics" fill="#3b6ea8" radius={[0, 3, 3, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <EmptyChart label="No MQTT channels captured" />}
                </article>

                <article className="panel topic-panel">
                  <div className="panel-heading">
                    <div><p className="section-kicker">Topic pulse</p><h2>Recently active</h2></div>
                    <Wifi size={20} aria-hidden="true" />
                  </div>
                  <div className="topic-list">
                    {analytics.activeCaptures.slice(0, 6).map((capture) => (
                      <div key={capture.topic}>
                        <span className="topic-dot" />
                        <div><strong title={capture.topic}>{capture.topic}</strong><small>{capture.channel || 'Unassigned channel'}</small></div>
                        <time dateTime={capture.lastSeenAt}>{formatRelative(capture.lastSeenAt)}</time>
                      </div>
                    ))}
                    {analytics.activeCaptures.length === 0 ? <EmptyChart label="No active MQTT topics in this window" /> : null}
                  </div>
                </article>
              </div>
            </section>

            <footer className="dashboard-footer">
              <span><Clock3 size={14} />Ingestor uptime {formatUptime(snapshot.status.uptimeSeconds)}</span>
              <span><Database size={14} />{snapshot.status.storage.driver} · read-only session</span>
            </footer>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
