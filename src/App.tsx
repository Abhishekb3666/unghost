import { useMemo, useRef, useState } from 'react'
import { exportCsv, importCsv } from './lib/csv'
import { fetchJobMail } from './lib/gmail'
import { applyMail, classify, daysBetween, followUpDraft, guessCompany, matchApp, nudges, today } from './lib/logic'
import { STATUSES, type App, type Mail, type Status } from './lib/types'
import { newId, useApps } from './useApps'

type Filter = 'all' | 'noack' | Status
const CLIENT_KEY = 'unghost.clientId'
const dayFirst = !navigator.language.startsWith('en-US')
const blank = (): App => ({ id: newId(), company: '', role: '', url: '', appliedOn: today(), status: 'applied', ackAt: '', lastContactAt: '', notes: '' })

export default function Root() {
  const [apps, setApps] = useApps()
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState<App | null>(null)
  const [msg, setMsg] = useState('')
  const [unmatched, setUnmatched] = useState<Mail[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const [clientId, setClientId] = useState(() => localStorage.getItem(CLIENT_KEY) ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '')
  const file = useRef<HTMLInputElement>(null)

  const patch = (id: string, p: Partial<App>) => setApps((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const noAck = (a: App) => a.status === 'applied' && !a.ackAt
  const todo = useMemo(() => nudges(apps), [apps])
  const shown = apps.filter((a) => (filter === 'all' ? true : filter === 'noack' ? noAck(a) : a.status === filter))
  const count = (f: Filter) => apps.filter((a) => (f === 'all' ? true : f === 'noack' ? noAck(a) : a.status === f)).length

  async function sync() {
    if (!clientId) return setShowSetup(true)
    setMsg('Reading your job emails…')
    try {
      const mails = await fetchJobMail(clientId)
      let next = apps, updated = 0
      const orphans: Mail[] = []
      for (const m of mails) {
        const kind = classify(m)
        if (kind === 'other') continue
        const hit = matchApp(next, m)
        if (!hit) { orphans.push(m); continue }
        const after = applyMail(hit, m, kind)
        if (after !== hit) { next = next.map((x) => (x.id === hit.id ? after : x)); updated++ }
      }
      setApps(next)
      setUnmatched(orphans)
      setMsg(`Scanned ${mails.length} emails. Updated ${updated} application${updated === 1 ? '' : 's'}. ${orphans.length} look like job mail we couldn't match.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sync failed')
    }
  }

  async function onFile(f?: File) {
    if (!f) return
    const { apps: add, skipped } = importCsv(await f.text(), dayFirst, newId)
    const key = (a: App) => `${a.company}|${a.role}|${a.appliedOn}`.toLowerCase()
    const have = new Set(apps.map(key))
    const fresh = add.filter((a) => !have.has(key(a)))
    setApps((a) => [...fresh, ...a])
    setMsg(`Imported ${fresh.length} applications${add.length - fresh.length ? `, ${add.length - fresh.length} duplicates skipped` : ''}${skipped ? `, ${skipped} rows had no company` : ''}.`)
    if (file.current) file.current.value = ''
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportCsv(apps)], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `unghost-${today()}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <main>
      <header>
        <div>
          <h1>👻 Unghost</h1>
          <p className="sub">Track every application. Catch the ones that went silent.</p>
        </div>
        <div className="row">
          <button className="primary" onClick={() => setDraft(blank())}>+ Add application</button>
          <button onClick={sync}>✉ Sync Gmail</button>
          <button onClick={() => file.current?.click()}>Import CSV</button>
          <button onClick={download} disabled={!apps.length}>Export CSV</button>
          <button onClick={() => setShowSetup((s) => !s)} aria-label="Settings">⚙</button>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </header>

      {msg && <p className="msg" role="status">{msg}</p>}

      {showSetup && (
        <section className="card">
          <h2>Gmail connection</h2>
          <p>Unghost reads your inbox <b>read-only, inside your browser</b>. Nothing is stored on a server. Paste a Google OAuth Web Client ID (setup takes 2 minutes, see the README).</p>
          <div className="row">
            <input style={{ flex: 1 }} placeholder="123456-abc.apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value.trim())} />
            <button onClick={() => { try { localStorage.setItem(CLIENT_KEY, clientId) } catch { /* ignore */ } setShowSetup(false); if (clientId) sync() }}>Save & sync</button>
          </div>
        </section>
      )}

      {todo.length > 0 && (
        <section className="card">
          <h2>Needs attention <span className="pill">{todo.length}</span></h2>
          <ul className="nudges">
            {todo.map((n) => (
              <li key={n.app.id}>
                <span className={`dot ${n.kind}`} />
                <span><b>{n.app.company}</b> <span className="muted">{n.app.role}</span><br /><span className="muted">{n.message}</span></span>
                <span className="row">
                  <a className="btn" href={followUpDraft(n.app)}>Draft follow-up</a>
                  {n.app.status === 'applied' && <button onClick={() => patch(n.app.id, { status: 'acknowledged', ackAt: today(), lastContactAt: today() })}>Got a reply</button>}
                  <button onClick={() => patch(n.app.id, { lastContactAt: today() })}>I followed up</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unmatched.length > 0 && (
        <section className="card">
          <h2>Found in Gmail, not in your list <span className="pill">{unmatched.length}</span></h2>
          <ul className="nudges">
            {unmatched.slice(0, 15).map((m) => (
              <li key={m.id}>
                <span className="dot follow-up" />
                <span><b>{guessCompany(m.from)}</b><br /><span className="muted">{m.subject} · {m.date}</span></span>
                <span className="row">
                  <button onClick={() => {
                    const a = applyMail({ ...blank(), company: guessCompany(m.from), appliedOn: m.date }, m, classify(m))
                    setApps((x) => [a, ...x]); setUnmatched((u) => u.filter((y) => y.id !== m.id))
                  }}>Add</button>
                  <button onClick={() => setUnmatched((u) => u.filter((y) => y.id !== m.id))}>Dismiss</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="tabs">
        {([['all', 'All'], ['noack', 'No acknowledgement'], ['acknowledged', 'Acknowledged'], ['interviewing', 'Interviewing'], ['offer', 'Offers'], ['rejected', 'Rejected']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label} <span className="pill">{count(f)}</span></button>
        ))}
      </nav>

      {draft && (
        <form className="card row wrap" onSubmit={(e) => { e.preventDefault(); setApps((a) => [draft, ...a]); setDraft(null) }}>
          <input required autoFocus placeholder="Company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
          <input placeholder="Role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
          <input type="date" value={draft.appliedOn} onChange={(e) => setDraft({ ...draft, appliedOn: e.target.value })} />
          <input placeholder="Job link (optional)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <button className="primary">Save</button>
          <button type="button" onClick={() => setDraft(null)}>Cancel</button>
        </form>
      )}

      {apps.length === 0 ? (
        <section className="card empty">
          <h2>Your hunt starts here</h2>
          <p>Add your first application, import the spreadsheet you already keep (Excel: <i>Save As → CSV</i>), or connect Gmail and let Unghost find them.</p>
        </section>
      ) : (
        <div className="scroll">
          <table>
            <thead><tr><th>Company</th><th>Role</th><th>Applied</th><th>Status</th><th>Acknowledged</th><th>Last contact</th><th>Notes</th><th /></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td><input value={a.company} onChange={(e) => patch(a.id, { company: e.target.value })} /></td>
                  <td><input value={a.role} onChange={(e) => patch(a.id, { role: e.target.value })} />{a.url && <a href={a.url} target="_blank" rel="noreferrer noopener" title="Open job post"> ↗</a>}</td>
                  <td><input type="date" value={a.appliedOn} onChange={(e) => patch(a.id, { appliedOn: e.target.value })} /></td>
                  <td>
                    <select className={`st ${a.status}`} value={a.status} onChange={(e) => patch(a.id, { status: e.target.value as Status })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    {a.ackAt ? <span className="ok">✓ {a.ackAt}</span>
                      : noAck(a) ? <button className="warn" title="Mark as acknowledged today" onClick={() => patch(a.id, { ackAt: today(), lastContactAt: today(), status: 'acknowledged' })}>None · {daysBetween(a.appliedOn, today())}d</button>
                      : <span className="muted">—</span>}
                  </td>
                  <td><input type="date" value={a.lastContactAt} onChange={(e) => patch(a.id, { lastContactAt: e.target.value })} /></td>
                  <td><input value={a.notes} onChange={(e) => patch(a.id, { notes: e.target.value })} /></td>
                  <td><button aria-label={`Delete ${a.company}`} onClick={() => confirm(`Delete ${a.company}?`) && setApps((x) => x.filter((y) => y.id !== a.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer>Your data never leaves this browser. <a href="https://github.com/Abhishekb3666/unghost" target="_blank" rel="noreferrer noopener">Open source</a></footer>
    </main>
  )
}
