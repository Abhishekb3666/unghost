# 👻 Unghost

**A job application tracker for people who currently use Excel.** Log every application, see which ones never acknowledged you, and get told exactly when to follow up. Free, open source, and private: your data stays in your browser.

## What it does

- **Spreadsheet-simple.** One editable table. Import your existing sheet (Excel → *Save As → CSV*; columns like Company, Position, Date Applied, Status are detected automatically) and export back to CSV any time.
- **"No acknowledgement" view.** Applications with no confirmation email are flagged with a day counter, so you know which ones to chase or re-submit.
- **Follow-up nudges.** A daily *Needs attention* list: no ack after 3 days, follow up after 7, last nudge after 21, thank-you after interviews. One click opens a pre-written follow-up email.
- **Gmail sync (optional).** Reads your inbox read-only, recognises acknowledgements, interview invites, offers and rejections, and updates the matching application. Job emails it can't match are offered as new applications.

## Privacy

No server, no accounts, no analytics. Applications live in `localStorage`. Gmail access is `gmail.readonly`, runs in your browser, and the token is kept in memory only. Only sender, subject and snippet are read, never full bodies or attachments.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static files in dist/
```

## Enable Gmail sync (2 minutes)

Gmail's read scope is *restricted*, so each person (or each deployment) uses their own Google OAuth client until a verified public one exists.

1. [Google Cloud Console](https://console.cloud.google.com/) → new project → enable **Gmail API**.
2. *OAuth consent screen* → External → add yourself as a **test user**.
3. *Credentials* → Create **OAuth client ID** → *Web application* → add your app URL (e.g. `http://localhost:5173`) under **Authorized JavaScript origins**.
4. Paste the client ID into Unghost (⚙), or set `VITE_GOOGLE_CLIENT_ID` at build time (GitHub Pages: repo variable `GOOGLE_CLIENT_ID`).

## How matching works

Emails are classified by phrase (`thank you for applying`, `unfortunately`, `interview`, …) and matched to an application when the company name appears in the sender or subject. Status only moves forward (applied → acknowledged → interviewing → offer); a rejection ends it. Rules live in [`src/lib/logic.ts`](src/lib/logic.ts) and are tested in `src/lib/lib.test.ts`. Heuristics, not magic: you can always edit a row by hand.

## Roadmap

Verified Google app (no setup step) · Outlook support · `.xlsx` import · reminders by email/notification · optional encrypted sync across devices · more languages for email detection

## Contributing

PRs welcome, especially email phrases for more languages and ATS formats. Keep `npm test` green.

MIT licensed.
