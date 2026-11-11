import type { App, EmailKind, Mail, Status } from './types'

const has = (s: string, words: string[]) => words.some((w) => s.includes(w))

export function classify(m: Pick<Mail, 'subject' | 'snippet'>): EmailKind {
  const t = `${m.subject} ${m.snippet}`.toLowerCase()
  if (has(t, ['unfortunately', 'not moving forward', 'not be moving forward', 'regret to inform', 'other candidates', 'not selected', 'position has been filled', 'decided to pursue'])) return 'reject'
  if (has(t, ['pleased to offer', 'offer letter', 'job offer', 'like to offer you', 'happy to offer'])) return 'offer'
  if (has(t, ['interview', 'phone screen', 'schedule a call', 'coding challenge', 'online assessment', 'take-home'])) return 'interview'
  if (has(t, ['thank you for applying', 'thanks for applying', 'received your application', 'application received', 'application has been received', 'successfully submitted', 'thank you for your interest', 'thanks for your interest', 'we have received'])) return 'ack'
  return 'other'
}

const slug = (s: string) =>
  s.toLowerCase().replace(/\b(inc|ltd|llc|pvt|private|limited|technologies|technology|corp|corporation|gmbh|co)\b/g, '').replace(/[^a-z0-9]/g, '')

/** Best application whose company name appears in the sender or subject. */
export function matchApp(apps: App[], m: Pick<Mail, 'from' | 'subject'>): App | undefined {
  const hay = slug(`${m.from} ${m.subject}`)
  let best: App | undefined
  let bestLen = 0
  for (const a of apps) {
    const s = slug(a.company)
    if (s.length >= 3 && hay.includes(s) && s.length > bestLen) { best = a; bestLen = s.length }
  }
  return best
}

const RANK: Record<Status, number> = { applied: 0, acknowledged: 1, interviewing: 2, offer: 3, rejected: 3, withdrawn: 3 }
const NEXT: Partial<Record<EmailKind, Status>> = { ack: 'acknowledged', interview: 'interviewing', offer: 'offer', reject: 'rejected' }

/** Pure: returns the updated app, or the same app if the mail changes nothing. Order-safe and idempotent. */
export function applyMail(a: App, m: Mail, kind: EmailKind): App {
  const to = NEXT[kind]
  if (!to || a.status === 'withdrawn' || m.date < a.appliedOn) return a
  const next = { ...a }
  if (!next.ackAt || m.date < next.ackAt) next.ackAt = m.date
  if (m.date > next.lastContactAt) next.lastContactAt = m.date
  if (to === 'rejected' ? m.date >= (a.lastContactAt || a.appliedOn) : RANK[to] > RANK[a.status]) next.status = to
  return next
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export const today = () => new Date().toISOString().slice(0, 10)

export interface Nudge {
  app: App
  kind: 'no-ack' | 'follow-up' | 'thank-you' | 'give-up'
  days: number
  message: string
}

/** What needs attention today. `no-ack` = no acknowledgement email ever arrived. */
export function nudges(apps: App[], now = today()): Nudge[] {
  const out: Nudge[] = []
  for (const app of apps) {
    const since = daysBetween(app.lastContactAt || app.appliedOn, now)
    const n = (kind: Nudge['kind'], message: string) => out.push({ app, kind, days: since, message })
    if (app.status === 'applied') {
      if (since >= 21) n('give-up', `${since} days of silence. Send one last nudge, then move on.`)
      else if (since >= 7) n('follow-up', `${since} days, no reply. Time to follow up.`)
      else if (since >= 3) n('no-ack', `No acknowledgement after ${since} days. Check spam or the portal.`)
    } else if (app.status === 'acknowledged' && since >= 10) {
      n('follow-up', `Acknowledged, but quiet for ${since} days. Ask for a status update.`)
    } else if (app.status === 'interviewing' && since >= 2) {
      n('thank-you', since >= 7 ? `${since} days since the last contact. Ask about next steps.` : 'Send a thank-you note after your interview.')
    }
  }
  return out.sort((a, b) => b.days - a.days)
}

export function followUpDraft(a: App) {
  const subject = `Following up: ${a.role} application`
  const body = `Hi ${a.company} team,\n\nI applied for the ${a.role} role on ${a.appliedOn} and wanted to check on the status of my application. I'm still very interested and happy to share anything that helps.\n\nThank you for your time.\n\nBest regards`
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** "Acme Careers <jobs@acme.com>" -> "Acme"; falls back to the sender domain. */
export function guessCompany(from: string): string {
  const name = from.replace(/<.*>/, '').replace(/["']/g, '').replace(/\b(careers?|recruit\w*|talent|team|jobs?|hr|hiring|no-?reply|notifications?|acquisition)\b/gi, '').trim()
  if (name.length > 1) return name
  const domain = from.match(/@([\w-]+)\./)?.[1] ?? ''
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}
