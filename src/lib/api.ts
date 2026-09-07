import type {
  HeardMessage,
  HeardNode,
  MonitorSnapshot,
  MonitorStatus,
  MqttCapture,
  MqttChannel,
  RangeKey,
} from '../types'

const SNAPSHOT_LIMIT = 1000
const RANGE_WINDOW_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '/api'

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '')

interface NodesResponse {
  nodes: HeardNode[]
  count: number
  since?: string
}

interface MessagesResponse {
  messages: HeardMessage[]
  count: number
}

interface CountResponse {
  count: number
}

interface MqttCapturesResponse {
  captures: MqttCapture[]
  count: number
}

interface ChannelsResponse {
  channels: MqttChannel[]
  count: number
  topics: number
}

export class MonitorApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MonitorApiError'
    this.status = status
  }
}

function rangeStart(range: RangeKey): string | undefined {
  if (range === 'all') return undefined
  return new Date(Date.now() - RANGE_WINDOW_MS[range]).toISOString()
}

function collectionPath(path: string, since?: string): string {
  const query = new URLSearchParams({ limit: String(SNAPSHOT_LIMIT) })
  if (since) query.set('since', since)
  return `${path}?${query.toString()}`
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal,
  })

  if (!response.ok) {
    throw new MonitorApiError(
      `The ingestor returned ${response.status} ${response.statusText}.`,
      response.status,
    )
  }

  return response.json() as Promise<T>
}

export async function fetchMonitorSnapshot(
  range: RangeKey,
  signal: AbortSignal,
): Promise<MonitorSnapshot> {
  const since = rangeStart(range)
  const [status, nodes, messages, messageCount, captures, channels] = await Promise.all([
    getJson<MonitorStatus>('/status', signal),
    getJson<NodesResponse>(collectionPath('/nodes/heard', since), signal),
    getJson<MessagesResponse>(collectionPath('/messages', since), signal),
    getJson<CountResponse>('/messages/count', signal),
    getJson<MqttCapturesResponse>(collectionPath('/mqtt/captures'), signal),
    getJson<ChannelsResponse>('/mqtt/channels', signal),
  ])

  return {
    status,
    nodes: nodes.nodes,
    messages: messages.messages,
    messageTotal: messageCount.count,
    mqttCaptures: captures.captures,
    mqttChannels: channels.channels,
    mqttTopicTotal: channels.topics,
    fetchedAt: new Date().toISOString(),
  }
}
