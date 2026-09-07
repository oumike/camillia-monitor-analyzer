import type {
  HeardMessage,
  HeardNode,
  MonitorSnapshot,
  MqttCapture,
  RangeKey,
} from '../types'

const HOUR_MS = 60 * 60 * 1000
const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '1h': HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
}

const MIX_COLORS = ['#0f766e', '#d97706', '#3b6ea8', '#d5523f', '#89928d']

export const RANGE_OPTIONS: ReadonlyArray<{ key: RangeKey; label: string; title: string }> = [
  { key: '1h', label: '1H', title: 'Last hour' },
  { key: '24h', label: '24H', title: 'Last 24 hours' },
  { key: '7d', label: '7D', title: 'Last 7 days' },
  { key: 'all', label: 'All', title: 'Latest available records' },
]

export interface ActivityPoint {
  label: string
  messages: number
  receptions: number
}

export interface BreakdownPoint {
  name: string
  value: number
  color: string
}

export interface SenderPoint {
  id: string
  name: string
  messages: number
  receptions: number
}

export interface LocationPoint {
  name: string
  nodeId: string
  latitude: number
  longitude: number
  altitude: number | null
  precisionBits: number | null
}

export interface DashboardAnalytics {
  activeNodes: number
  directNodes: number
  mqttNodes: number
  directShare: number
  activeTopics: number
  activeChannels: number
  messageRate: number
  totalReceptions: number
  redundancy: number
  medianRssi: number | null
  medianSnr: number | null
  averageHops: number | null
  encryptedShare: number
  telemetrySamples: number
  activity: ActivityPoint[]
  messageMix: BreakdownPoint[]
  signalMix: BreakdownPoint[]
  topSenders: SenderPoint[]
  locations: LocationPoint[]
  activeCaptures: MqttCapture[]
}

function finiteValues(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value))
}

function median(values: Array<number | null>): number | null {
  const sorted = finiteValues(values).sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

function average(values: Array<number | null>): number | null {
  const valid = finiteValues(values)
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function displayNodeName(node: HeardNode | undefined, nodeId: string): string {
  return node?.longName || node?.shortName || nodeId
}

function displayPort(message: HeardMessage): string {
  if (message.encrypted) return 'Encrypted'
  if (!message.portName) return 'Unknown'
  return message.portName
    .replace(/_APP$/, '')
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

function rangeDuration(range: RangeKey, messages: HeardMessage[], now: number): number {
  if (range !== 'all') return RANGE_MS[range]
  const oldest = messages.reduce((minimum, message) => {
    const timestamp = Date.parse(message.reception.heardAt)
    return Number.isFinite(timestamp) ? Math.min(minimum, timestamp) : minimum
  }, now)
  return Math.max(HOUR_MS, now - oldest)
}

function activityLabel(timestamp: number, duration: number): string {
  const date = new Date(timestamp)
  if (duration <= 48 * HOUR_MS) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: duration <= 6 * HOUR_MS ? '2-digit' : undefined,
    }).format(date)
  }
  if (duration <= 14 * 24 * HOUR_MS) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function buildActivity(messages: HeardMessage[], range: RangeKey, now: number): ActivityPoint[] {
  const bucketCount = 12
  const duration = rangeDuration(range, messages, now)
  const start = now - duration
  const bucketSize = duration / bucketCount
  const points = Array.from({ length: bucketCount }, (_, index) => ({
    label: activityLabel(start + index * bucketSize, duration),
    messages: 0,
    receptions: 0,
  }))

  for (const message of messages) {
    const timestamp = Date.parse(message.reception.heardAt)
    if (!Number.isFinite(timestamp) || timestamp < start) continue
    const index = Math.min(bucketCount - 1, Math.floor((timestamp - start) / bucketSize))
    points[index].messages += 1
    points[index].receptions += Math.max(1, message.reception.receptions)
  }

  return points
}

function buildMessageMix(messages: HeardMessage[]): BreakdownPoint[] {
  const counts = new Map<string, number>()
  for (const message of messages) {
    const name = displayPort(message)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const primary = sorted.slice(0, 4)
  const other = sorted.slice(4).reduce((sum, [, value]) => sum + value, 0)
  if (other > 0) primary.push(['Other', other])

  return primary.map(([name, value], index) => ({
    name,
    value,
    color: MIX_COLORS[index],
  }))
}

function buildSignalMix(nodes: HeardNode[]): BreakdownPoint[] {
  const counts = { Strong: 0, Fair: 0, Weak: 0, Unknown: 0 }
  for (const node of nodes) {
    const rssi = node.signal.rssi
    if (rssi === null) counts.Unknown += 1
    else if (rssi >= -90) counts.Strong += 1
    else if (rssi >= -110) counts.Fair += 1
    else counts.Weak += 1
  }

  return [
    { name: 'Strong', value: counts.Strong, color: '#0f766e' },
    { name: 'Fair', value: counts.Fair, color: '#d97706' },
    { name: 'Weak', value: counts.Weak, color: '#d5523f' },
    { name: 'Unknown', value: counts.Unknown, color: '#89928d' },
  ]
}

function buildTopSenders(messages: HeardMessage[], nodes: HeardNode[]): SenderPoint[] {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]))
  const senders = new Map<string, SenderPoint>()

  for (const message of messages) {
    const existing = senders.get(message.fromId) ?? {
      id: message.fromId,
      name: displayNodeName(nodeById.get(message.fromId), message.fromId),
      messages: 0,
      receptions: 0,
    }
    existing.messages += 1
    existing.receptions += Math.max(1, message.reception.receptions)
    senders.set(message.fromId, existing)
  }

  return [...senders.values()]
    .sort((left, right) => right.messages - left.messages)
    .slice(0, 6)
    .reverse()
}

function hasTelemetry(message: HeardMessage): boolean {
  return Object.values(message.telemetry).some((value) => value !== null)
}

function capturesInRange(captures: MqttCapture[], range: RangeKey, now: number): MqttCapture[] {
  if (range === 'all') return captures
  const start = now - RANGE_MS[range]
  return captures.filter((capture) => Date.parse(capture.lastSeenAt) >= start)
}

export function analyzeSnapshot(
  snapshot: MonitorSnapshot,
  range: RangeKey,
): DashboardAnalytics {
  const now = Date.parse(snapshot.fetchedAt)
  const directNodes = snapshot.nodes.filter((node) => !node.signal.viaMqtt).length
  const mqttNodes = snapshot.nodes.length - directNodes
  const totalReceptions = snapshot.messages.reduce(
    (sum, message) => sum + Math.max(1, message.reception.receptions),
    0,
  )
  const durationHours = rangeDuration(range, snapshot.messages, now) / HOUR_MS
  const activeCaptures = capturesInRange(snapshot.mqttCaptures, range, now)
  const activeChannels = new Set(
    activeCaptures
      .map((capture) => capture.channel)
      .filter((channel): channel is string => channel !== null),
  ).size

  return {
    activeNodes: snapshot.nodes.length,
    directNodes,
    mqttNodes,
    directShare: snapshot.nodes.length === 0 ? 0 : (directNodes / snapshot.nodes.length) * 100,
    activeTopics: activeCaptures.length,
    activeChannels,
    messageRate: snapshot.messages.length / durationHours,
    totalReceptions,
    redundancy: snapshot.messages.length === 0 ? 0 : totalReceptions / snapshot.messages.length,
    medianRssi: median(snapshot.nodes.map((node) => node.signal.rssi)),
    medianSnr: median(snapshot.nodes.map((node) => node.signal.snr)),
    averageHops: average(snapshot.nodes.map((node) => node.signal.hopsAway)),
    encryptedShare:
      snapshot.messages.length === 0
        ? 0
        : (snapshot.messages.filter((message) => message.encrypted).length /
            snapshot.messages.length) *
          100,
    telemetrySamples: snapshot.messages.filter(hasTelemetry).length,
    activity: buildActivity(snapshot.messages, range, now),
    messageMix: buildMessageMix(snapshot.messages),
    signalMix: buildSignalMix(snapshot.nodes),
    topSenders: buildTopSenders(snapshot.messages, snapshot.nodes),
    locations: snapshot.nodes.flatMap((node) => {
      const { latitude, longitude, altitude, precisionBits } = node.position
      if (latitude === null || longitude === null) return []
      return [
        {
          name: displayNodeName(node, node.nodeId),
          nodeId: node.nodeId,
          latitude,
          longitude,
          altitude,
          precisionBits,
        },
      ]
    }),
    activeCaptures,
  }
}
