import Papa from 'papaparse'
import { STATUSES, type App, type Status } from './types'

const ALIASES: Record<string, keyof App> = {
  company: 'company', employer: 'company', organization: 'company', organisation: 'company',
  role: 'role', position: 'role', title: 'role', 'job title': 'role', job: 'role',
  link: 'url', url: 'url', 'job link': 'url',
  date: 'appliedOn', 'date applied': 'appliedOn', applied: 'appliedOn', 'applied on': 'appliedOn', 'applied date': 'appliedOn',
  status: 'status', stage: 'status',
  notes: 'notes', note: 'notes', comments: 'notes', remarks: 'notes',
  'acknowledged on': 'ackAt', 'last contact': 'lastContactAt', // round-trip our own export
}

/** ISO, or d/m/y | m/d/y | d-m-y | d.m.y. Ambiguous cases follow `dayFirst`. '' if unparseable. */
export function parseDate(raw: string, dayFirst: boolean): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (!m) {
    const t = Date.parse(s)
    return isNaN(t) ? '' : new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  }
  const [a, b] = [+m[1], +m[2]]
  let y = +m[3]
  if (y < 100) y += 2000
  const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : dayFirst ? [a, b] : [b, a]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toStatus(raw: string): Status {
  const s = raw.trim().toLowerCase()
  if (!s) return 'applied'
  if (/interview|screen|assessment|round/.test(s)) return 'interviewing'
  if (/reject|declin|denied|^no$/.test(s)) return 'rejected'
  return STATUSES.find((x) => s.startsWith(x.slice(0, 4))) ?? 'applied'
}

export function importCsv(text: string, dayFirst: boolean, newId: () => string): { apps: App[]; skipped: number } {
  const { data } = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true })
  if (!data.length) return { apps: [], skipped: 0 }
  const cols = data[0].map((h) => ALIASES[h.trim().toLowerCase()])
  const apps: App[] = []
  let skipped = 0
  for (const row of data.slice(1)) {
    const r: Partial<Record<keyof App, string>> = {}
    cols.forEach((k, i) => { if (k && row[i] !== undefined && !r[k]) r[k] = row[i].trim() })
    if (!r.company) { skipped++; continue }
    apps.push({
      id: newId(), company: r.company, role: r.role ?? '', url: r.url ?? '',
      appliedOn: parseDate(r.appliedOn ?? '', dayFirst) || new Date().toISOString().slice(0, 10),
      status: toStatus(r.status ?? ''), ackAt: parseDate(r.ackAt ?? '', dayFirst),
      lastContactAt: parseDate(r.lastContactAt ?? '', dayFirst), notes: r.notes ?? '',
    })
  }
  return { apps, skipped }
}

export const exportCsv = (apps: App[]) =>
  '﻿' + Papa.unparse(apps.map((a) => ({
    Company: a.company, Role: a.role, 'Date Applied': a.appliedOn, Status: a.status,
    'Acknowledged On': a.ackAt, 'Last Contact': a.lastContactAt, Link: a.url, Notes: a.notes,
  })))
