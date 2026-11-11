export type Status = 'applied' | 'acknowledged' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn'
export const STATUSES: Status[] = ['applied', 'acknowledged', 'interviewing', 'offer', 'rejected', 'withdrawn']

export interface App {
  id: string
  company: string
  role: string
  url: string
  appliedOn: string // YYYY-MM-DD
  status: Status
  ackAt: string // YYYY-MM-DD of first acknowledgement email, '' if none
  lastContactAt: string // YYYY-MM-DD of latest email/call, '' if none
  notes: string
}

export type EmailKind = 'ack' | 'interview' | 'offer' | 'reject' | 'other'

export interface Mail {
  id: string
  from: string // raw From header
  subject: string
  snippet: string
  date: string // YYYY-MM-DD
}
