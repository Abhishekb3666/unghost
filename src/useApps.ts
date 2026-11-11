import { useEffect, useState } from 'react'
import type { App } from './lib/types'

const KEY = 'unghost.apps.v1'

export const newId = () => crypto.randomUUID()

function load(): App[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

/** All data lives in this browser's localStorage. Nothing is uploaded. */
export function useApps() {
  const [apps, setApps] = useState<App[]>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(apps)) } catch { /* storage full or blocked */ }
  }, [apps])
  return [apps, setApps] as const
}
