import { useEffect, useState } from 'react'

import { fetchMonitorSnapshot } from '../lib/api'
import type { MonitorSnapshot, RangeKey } from '../types'

const AUTO_REFRESH_MS = 30_000

interface MonitorDataState {
  snapshot: MonitorSnapshot | null
  error: string | null
  settledRequest: string | null
}

export function useMonitorData(range: RangeKey, autoRefresh: boolean) {
  const [requestId, setRequestId] = useState(0)
  const [state, setState] = useState<MonitorDataState>({
    snapshot: null,
    error: null,
    settledRequest: null,
  })
  const activeRequest = `${range}:${requestId}`

  useEffect(() => {
    const controller = new AbortController()

    void fetchMonitorSnapshot(range, controller.signal)
      .then((snapshot) => {
        setState({ snapshot, error: null, settledRequest: activeRequest })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Unable to reach the ingestor.',
          settledRequest: activeRequest,
        }))
      })

    return () => controller.abort()
  }, [activeRequest, range])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setRequestId((current) => current + 1)
      }
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [autoRefresh])

  const requestPending = state.settledRequest !== activeRequest

  return {
    snapshot: state.snapshot,
    error: requestPending ? null : state.error,
    isLoading: requestPending && state.snapshot === null,
    isRefreshing: requestPending && state.snapshot !== null,
    refresh: () => setRequestId((current) => current + 1),
  }
}
