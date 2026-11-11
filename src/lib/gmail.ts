import type { Mail } from './types'

// Read-only Gmail access, entirely in the browser. The token lives in memory and is never persisted or sent anywhere but Google.
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const QUERY = 'newer_than:120d (subject:(application OR applying OR applied OR interview OR offer OR candidacy) OR "your application" OR "thank you for your interest")'

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => ok()
    s.onerror = () => fail(new Error('Could not load Google sign-in. Check your connection.'))
    document.head.appendChild(s)
  })
}

async function token(clientId: string): Promise<string> {
  await loadGis()
  return new Promise((ok, fail) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => (r.access_token ? ok(r.access_token) : fail(new Error(r.error_description || r.error || 'Sign-in cancelled'))),
        error_callback: (e) => fail(new Error(e.message || e.type)),
      })
      .requestAccessToken()
  })
}

async function api<T>(t: string, path: string): Promise<T> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) throw new Error(`Gmail said ${r.status}. ${r.status === 403 ? 'Is the Gmail API enabled for this client ID?' : ''}`)
  return r.json()
}

interface Msg {
  id: string
  snippet: string
  internalDate: string
  payload: { headers: { name: string; value: string }[] }
}

export async function fetchJobMail(clientId: string, max = 150): Promise<Mail[]> {
  const t = await token(clientId)
  const list = await api<{ messages?: { id: string }[] }>(t, `messages?maxResults=${max}&q=${encodeURIComponent(QUERY)}`)
  const ids = (list.messages ?? []).map((m) => m.id)
  const out: Mail[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(
      ids.slice(i, i + 10).map((id) => api<Msg>(t, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)),
    )
    for (const m of batch) {
      const h = (n: string) => m.payload.headers.find((x) => x.name === n)?.value ?? ''
      const d = new Date(+m.internalDate)
      out.push({
        id: m.id, from: h('From'), subject: h('Subject'), snippet: m.snippet,
        date: new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
