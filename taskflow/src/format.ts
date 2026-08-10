import type { Locale } from './i18n'
import { messagesFor } from './i18n'

export function formatRelativeTime(iso: string | undefined, locale: Locale): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diffMs = now - d.getTime()
  const m = messagesFor(locale).time
  if (diffMs < 0) return m.justNow
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffSec < 60) return m.justNow
  if (diffMin < 60) return m.minutesAgo(diffMin)
  if (diffHour < 24) return m.hoursAgo(diffHour)
  if (diffDay < 30) return m.daysAgo(diffDay)
  return d.toLocaleDateString(m.locale)
}

export function formatDuration(startIso: string, endIso: string, locale: Locale): string {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (isNaN(start) || isNaN(end)) return ''
  const diffMs = Math.max(0, end - start)
  const totalSec = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const m = messagesFor(locale).time

  if (days > 0) return m.durationDays(days, hours)
  if (hours > 0) return m.durationHours(hours, mins)
  if (mins > 0) return m.durationMins(mins, secs)
  return m.durationSecs(secs)
}

export function shortPaneId(paneId: string | undefined): string {
  if (!paneId) return ''
  return paneId.length > 8 ? paneId.slice(0, 8) : paneId
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // fall through to Math.random fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function nowIso(): string {
  return new Date().toISOString()
}
