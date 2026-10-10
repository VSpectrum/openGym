// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bwSheet, weighInsSheet, dayOverrideSheet, calendarSheet, logPastWorkoutSheet } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []

function mountTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  if (!sheet) return null
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

const button = (host, text) => [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === text)

function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('previous date and previous weight entry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-10T12:00:00'))
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    document.body.innerHTML = ''
    const S = clone(DEF)
    Object.assign(S, {
      unit: 'kg',
      bodyweight: [
        { d: '2026-10-05', w: 75.0, t: 1 },
        { d: '2026-10-08', w: 74.5, t: 2 },
      ],
      workouts: [],
      dayPlan: {},
      week: {},
      routines: [],
    })
    useStore.setState({ S, user: null })
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    vi.useRealTimers()
  })

  it('allows logging bodyweight for yesterday via quick chip', () => {
    bwSheet()
    const host = mountTopSheet()
    expect(host.querySelector('h3').textContent).toBe('Log body weight')

    // Click Yesterday chip
    const yChip = button(host, 'Yesterday')
    expect(yChip).toBeTruthy()
    act(() => { yChip.click() })

    // Change weight
    const input = host.querySelector('.bw-read input')
    act(() => type(input, '74.2'))

    // Save
    act(() => { button(host, 'Save').click() })

    const bw = useStore.getState().S.bodyweight
    const entry = bw.find(b => b.d === '2026-10-09')
    expect(entry).toBeTruthy()
    expect(entry.w).toBe(74.2)
  })

  it('allows selecting any custom previous date via the date input', () => {
    bwSheet()
    const host = mountTopSheet()
    const dateInput = host.querySelector('input[type="date"]')
    expect(dateInput).toBeTruthy()
    expect(dateInput.value).toBe('2026-10-10')

    // Change date to 2026-10-01
    act(() => {
      Object.getOwnPropertyDescriptor(dateInput.constructor.prototype, 'value').set.call(dateInput, '2026-10-01')
      dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const input = host.querySelector('.bw-read input')
    act(() => type(input, '76.0'))
    act(() => { button(host, 'Save').click() })

    const bw = useStore.getState().S.bodyweight
    const entry = bw.find(b => b.d === '2026-10-01')
    expect(entry).toBeTruthy()
    expect(entry.w).toBe(76.0)
  })

  it('pre-fills existing weight when an existing date is chosen and allows updating it', () => {
    bwSheet()
    const host = mountTopSheet()
    const dateInput = host.querySelector('input[type="date"]')

    // Switch to 2026-10-08 which already has 74.5
    act(() => {
      Object.getOwnPropertyDescriptor(dateInput.constructor.prototype, 'value').set.call(dateInput, '2026-10-08')
      dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const input = host.querySelector('.bw-read input')
    expect(input.value).toBe('74.5')

    // The button says "Update weight"
    const updateBtn = button(host, 'Update weight')
    expect(updateBtn).toBeTruthy()

    // Modify weight and update
    act(() => type(input, '74.8'))
    act(() => { updateBtn.click() })

    const bw = useStore.getState().S.bodyweight
    const entries = bw.filter(b => b.d === '2026-10-08')
    expect(entries).toHaveLength(1)
    expect(entries[0].w).toBe(74.8)
  })

  it('can open bwSheet pre-populated with a specific past date and weight', () => {
    bwSheet({ date: '2026-10-07', weight: 73.9 })
    const host = mountTopSheet()
    const dateInput = host.querySelector('input[type="date"]')
    expect(dateInput.value).toBe('2026-10-07')
    const input = host.querySelector('.bw-read input')
    expect(input.value).toBe('73.9')
  })

  it('tapping a weigh-in in the weigh-ins history opens the sheet to edit it', () => {
    weighInsSheet()
    const host = mountTopSheet()

    // Click on the weigh-in row for 2026-10-08
    const row = [...host.querySelectorAll('.list .row.between')].find(r => r.textContent.includes('74.5 kg'))
    expect(row).toBeTruthy()
    act(() => { row.click() })

    // A new sheet opened for editing that weigh-in
    const editSheet = mountTopSheet()
    expect(editSheet.querySelector('h3').textContent).toBe('Log body weight')
    expect(editSheet.querySelector('input[type="date"]').value).toBe('2026-10-08')
    expect(editSheet.querySelector('.bw-read input').value).toBe('74.5')
  })

  it('WeighIns sheet has a Log weight button that opens bwSheet', () => {
    weighInsSheet()
    const host = mountTopSheet()
    const logBtn = button(host, 'Log weight')
    expect(logBtn).toBeTruthy()
    act(() => { logBtn.click() })

    const bwLogSheet = mountTopSheet()
    expect(bwLogSheet.querySelector('h3').textContent).toBe('Log body weight')
  })

  it('offers logging a past workout and body weight on an unplanned past day in DayOverride', () => {
    dayOverrideSheet('2026-10-07')
    const host = mountTopSheet()

    // Has "Log a past workout" button
    const workoutBtn = button(host, 'Log a past workout')
    expect(workoutBtn).toBeTruthy()

    // Has "Log body weight for this day" row
    expect(host.textContent).toContain('Log body weight for this day')

    // Tapping workout button opens LogPastWorkout prefilled to that date
    act(() => { workoutBtn.click() })
    const pastWorkoutHost = mountTopSheet()
    expect(pastWorkoutHost.querySelector('h3').textContent).toBe('Log a past workout')
    expect(pastWorkoutHost.querySelector('input[type="date"]').value).toBe('2026-10-07')
  })

  it('shows logged body weight on that day in DayOverride and allows tapping to edit it', () => {
    // 2026-10-08 has 74.5 kg logged
    dayOverrideSheet('2026-10-08')
    const host = mountTopSheet()
    expect(host.textContent).toContain('Body weight: 74.5 kg')

    const bwRow = [...host.querySelectorAll('.item')].find(i => i.textContent.includes('Body weight: 74.5 kg'))
    expect(bwRow).toBeTruthy()
    act(() => { bwRow.click() })

    const bwEditHost = mountTopSheet()
    expect(bwEditHost.querySelector('input[type="date"]').value).toBe('2026-10-08')
    expect(bwEditHost.querySelector('.bw-read input').value).toBe('74.5')
  })

  it('Calendar sheet shows quick buttons to log a past workout and log weight', () => {
    calendarSheet('2026-10-10')
    const host = mountTopSheet()
    expect(button(host, 'Log a past workout')).toBeTruthy()
    expect(button(host, 'Log weight')).toBeTruthy()
  })

  it('LogPastWorkout includes quick Yesterday and Today chips', () => {
    logPastWorkoutSheet()
    const host = mountTopSheet()
    expect(button(host, 'Yesterday')).toBeTruthy()
    expect(button(host, 'Today')).toBeTruthy()

    act(() => { button(host, 'Today').click() })
    expect(host.querySelector('input[type="date"]').value).toBe('2026-10-10')
  })
})
