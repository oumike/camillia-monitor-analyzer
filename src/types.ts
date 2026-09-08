export type RangeKey = '1h' | '24h' | '7d' | 'all'

export interface StorageStatus {
  driver: string
  connected: boolean
  error?: string
}

export interface MonitorStatus {
  status: 'ok' | 'degraded'
  service: string
  version: string
  environment: string
  uptimeSeconds: number
  timestamp: string
  storage: StorageStatus
  mesh: {
    knownNodes: number
    lastHeardAt: string | null
  }
}

export interface NodePosition {
  latitude: number | null
  longitude: number | null
  latitudeI: number | null
  longitudeI: number | null
  altitude: number | null
  precisionBits: number | null
}

export interface NodeSignal {
  snr: number | null
  rssi: number | null
  hopsAway: number | null
  viaMqtt: boolean
}

export interface HeardNode {
  nodeNum: number
  nodeId: string
  longName: string | null
  shortName: string | null
  hwModel: string | null
  hwModelNum: number | null
  role: string | null
  preset?: string | null
  lastHeardAt: string | null
  lastHeardBy: string | null
  signal: NodeSignal
  position: NodePosition
  batteryLevel: number | null
  voltage: number | null
  firstHeardAt: string
  updatedAt: string
}

export interface MessageTelemetry {
  batteryLevel: number | null
  voltage: number | null
  channelUtilization: number | null
  airUtilTx: number | null
  temperature: number | null
  humidity: number | null
  pressure: number | null
}

export interface HeardMessage {
  id: string
  packetId: number
  fromId: string
  fromNum: number
  toId: string
  toNum: number
  broadcast: boolean
  preset?: string | null
  portnum: number | null
  portName: string | null
  channel: number | null
  encrypted: boolean
  text: string | null
  telemetry: MessageTelemetry
  reception: {
    heardAt: string
    heardBy: string | null
    snr: number | null
    rssi: number | null
    hopsAway: number | null
    viaMqtt: boolean
    receptions: number
  }
  firstHeardAt: string
}

export interface MqttCapture {
  topic: string
  channel: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface MqttChannel {
  channel: string
  topics: number
  lastSeenAt: string
  lastSeenAgeSeconds: number
}

export interface MonitorSnapshot {
  status: MonitorStatus
  nodes: HeardNode[]
  messages: HeardMessage[]
  messageTotal: number
  mqttCaptures: MqttCapture[]
  mqttChannels: MqttChannel[]
  mqttTopicTotal: number
  fetchedAt: string
}
