import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv, parseDate } from './csv'
import { applyMail, classify, matchApp, nudges } from './logic'
import type { App, Mail } from './types'

const app = (o: Partial<App> = {}): App => ({
  id: '1', company: 'Acme Technologies Inc', role: 'Engineer', url: '', appliedOn: '2026-01-01',
  status: 'applied', ackAt: '', lastContactAt: '', notes: '', ...o,
})
const mail = (o: Partial<Mail> = {}): Mail => ({ id: 'm', from: 'Acme Careers <jobs@acme.com>', subject: '', snippet: '', date: '2026-01-02', ...o })

describe('classify', () => {
  it('reads each kind, rejection beating interview wording', () => {
    expect(classify({ subject: 'Thank you for applying to Acme', snippet: '' })).toBe('ack')
    expect(classify({ subject: 'Interview invitation', snippet: '' })).toBe('interview')
    expect(classify({ subject: 'Update', snippet: 'Unfortunately we will not be interviewing you' })).toBe('reject')
    expect(classify({ subject: 'Offer letter', snippet: '' })).toBe('offer')
    expect(classify({ subject: 'Weekly newsletter', snippet: '' })).toBe('other')
  })
})

describe('matchApp', () => {
  it('matches on sender or subject, ignoring company suffixes', () => {
    const apps = [app(), app({ id: '2', company: 'Globex' })]
    expect(matchApp(apps, mail())?.id).toBe('1')
    expect(matchApp(apps, mail({ from: 'no-reply@greenhouse.io', subject: 'Your application to Globex' }))?.id).toBe('2')
    expect(matchApp(apps, mail({ from: 'x@spam.com', subject: 'hello' }))).toBeUndefined()
  })
})

describe('applyMail', () => {
  it('advances status, records ack date, never downgrades, ignores pre-application mail', () => {
    let a = applyMail(app(), mail({ date: '2026-01-03' }), 'ack')
    expect(a).toMatchObject({ status: 'acknowledged', ackAt: '2026-01-03', lastContactAt: '2026-01-03' })
    a = applyMail(a, mail({ date: '2026-01-10' }), 'interview')
    expect(a.status).toBe('interviewing')
    a = applyMail(a, mail({ date: '2026-01-04' }), 'ack') // older ack arrives late
    expect(a.status).toBe('interviewing')
    expect(applyMail(app(), mail({ date: '2025-12-01' }), 'ack').status).toBe('applied')
    expect(applyMail(app({ status: 'withdrawn' }), mail(), 'reject').status).toBe('withdrawn')
  })
})

describe('nudges', () => {
  it('escalates silence and flags missing acknowledgement', () => {
    const kinds = (d: string, o: Partial<App> = {}) => nudges([app(o)], d).map((n) => n.kind)
    expect(kinds('2026-01-02')).toEqual([])
    expect(kinds('2026-01-05')).toEqual(['no-ack'])
    expect(kinds('2026-01-10')).toEqual(['follow-up'])
    expect(kinds('2026-02-01')).toEqual(['give-up'])
    expect(kinds('2026-01-20', { status: 'acknowledged', lastContactAt: '2026-01-02' })).toEqual(['follow-up'])
    expect(kinds('2026-01-20', { status: 'rejected' })).toEqual([])
  })
})

describe('csv', () => {
  it('parses ambiguous dates by locale and unambiguous ones always', () => {
    expect(parseDate('03/04/2026', true)).toBe('2026-04-03')
    expect(parseDate('03/04/2026', false)).toBe('2026-03-04')
    expect(parseDate('25/04/2026', false)).toBe('2026-04-25')
    expect(parseDate('2026-04-03', true)).toBe('2026-04-03')
    expect(parseDate('nonsense', true)).toBe('')
  })
  it('imports a typical Excel sheet and round-trips our export', () => {
    const csv = '﻿Company,Position,Date Applied,Status,Comments\nAcme,"Dev, Senior",05/01/2026,Interview round 1,"called, said hi"\n,orphan,,,\n'
    const { apps, skipped } = importCsv(csv, true, () => 'x')
    expect(skipped).toBe(1)
    expect(apps[0]).toMatchObject({ company: 'Acme', role: 'Dev, Senior', appliedOn: '2026-01-05', status: 'interviewing', notes: 'called, said hi' })
    expect(importCsv(exportCsv(apps), true, () => 'y').apps[0]).toMatchObject({ company: 'Acme', appliedOn: '2026-01-05', status: 'interviewing' })
  })
})

import { guessCompany } from './logic'
it('guessCompany strips role words', () => {
  expect(guessCompany('Acme Careers <jobs@acme.com>')).toBe('Acme')
  expect(guessCompany('<no-reply@globex.io>')).toBe('Globex')
})
