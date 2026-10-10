// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stats from './Stats.jsx'
import { DEF } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({ charts: [], S: null }))
vi.mock('../store/useStore.js', () => ({
  DEF: { unit: 'kg', bodyweight: [], workouts: [], routines: [], exWeights: {}, dayPlan: {}, week: {} },
  useStore: selector => selector({ S: mocks.S }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  bwSheet: () => {}, goalSheet: () => {}, calendarSheet: () => {}, workoutDetailSheet: () => {}, exerciseHistorySheet: () => {},
  WorkoutRow: () => null, bwDeltaColor: () => 'inherit', weighInsSheet: () => {},
}))
vi.mock('../components/LineChart.jsx', () => ({
  default: props => {
    mocks.charts.push(props)
    return <div className="mock-line-chart" data-points-count={props.points?.length || 0} />
  }
}))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, BodyMapLegend: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BENCH = '0025'
let root, host

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z'), toFake: ['Date'] })
  mocks.charts = []
})

afterEach(() => {
  if (root) act(() => root.unmount())
  if (host) host.remove()
  vi.useRealTimers()
  mocks.charts = []
})

function mount(state) {
  mocks.S = {
    unit: 'kg',
    body: 'male',
    effort: 'none',
    targetW: 75,
    bodyweight: [],
    routines: [],
    exWeights: {},
    workouts: [],
    dayPlan: {},
    week: {},
    ...state,
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Stats />))
}

const bwChart = () => mocks.charts.find(c => c.goal !== undefined && c.h === 160)
const exChart = () => mocks.charts.find(c => c.h === 150)

describe('Stats body weight graph filtering and scaling', () => {
  it('filters 1 year of data by 3 months by default without showing data from a year ago', () => {
    // Generate 1 year of data: 1 weigh-in every month from 2025-10-10 to 2026-10-10
    // Give all entries recent sync timestamps (Date.now()) as happens when a user inputs or syncs them today
    const bodyweight = [
      { d: '2025-10-10', w: 85, t: Date.now() }, // 1 year ago
      { d: '2025-12-10', w: 84, t: Date.now() }, // 10 months ago
      { d: '2026-03-10', w: 82, t: Date.now() }, // 7 months ago
      { d: '2026-06-10', w: 80, t: Date.now() }, // 4 months ago
      { d: '2026-07-20', w: 79, t: Date.now() }, // ~82 days ago (within 3M)
      { d: '2026-08-20', w: 78, t: Date.now() }, // ~51 days ago (within 3M)
      { d: '2026-09-20', w: 77, t: Date.now() }, // ~20 days ago (within 3M & 1M)
      { d: '2026-10-10', w: 76, t: Date.now() }, // today (within 3M & 1M)
    ]

    mount({ bodyweight })
    const chart = bwChart()
    expect(chart).toBeTruthy()

    // Default filter is 90 days (3M): must only contain entries from last 90 days (July, August, September, October)
    expect(chart.points.map(p => p.d)).toEqual(['2026-07-20', '2026-08-20', '2026-09-20', '2026-10-10'])
    expect(chart.points.map(p => p.y)).toEqual([79, 78, 77, 76])

    // Point timestamps t must be derived from the weigh-in calendar date, not Date.now()
    const julyTime = new Date('2026-07-20T12:00:00').getTime()
    const octTime = new Date('2026-10-10T12:00:00').getTime()
    expect(chart.points[0].t).toBe(julyTime)
    expect(chart.points.at(-1).t).toBe(octTime)

    // The 1-year ago entry must NOT be present in 3M
    expect(chart.points.some(p => p.d === '2025-10-10')).toBe(false)
  })

  it('filters by 1M, 1Y, and All when range segment is clicked', () => {
    const bodyweight = [
      { d: '2025-10-10', w: 85 },
      { d: '2026-07-20', w: 79 },
      { d: '2026-09-25', w: 77 },
      { d: '2026-10-10', w: 76 },
    ]
    mount({ bodyweight })

    // Find the segmented control for body weight range
    const segButtons = [...host.querySelectorAll('.seg-range button')]
    const btn1M = segButtons.find(b => b.textContent === '1M')
    const btn1Y = segButtons.find(b => b.textContent === '1Y')
    const btnAll = segButtons.find(b => b.textContent === 'All')

    // Click 1M (30 days)
    act(() => btn1M.click())
    let latestChart = mocks.charts.at(-1)
    expect(latestChart.points.map(p => p.d)).toEqual(['2026-09-25', '2026-10-10'])

    // Click 1Y (365 days)
    act(() => btn1Y.click())
    latestChart = mocks.charts.at(-1)
    expect(latestChart.points.map(p => p.d)).toEqual(['2025-10-10', '2026-07-20', '2026-09-25', '2026-10-10'])

    // Click All
    act(() => btnAll.click())
    latestChart = mocks.charts.at(-1)
    expect(latestChart.points.map(p => p.d)).toEqual(['2025-10-10', '2026-07-20', '2026-09-25', '2026-10-10'])
  })

  it('computes 30-day delta strictly from weigh-ins within the last 30 days', () => {
    const bodyweight = [
      { d: '2025-10-10', w: 100, t: Date.now() }, // 1 year ago, was 100 kg
      { d: '2026-09-20', w: 78, t: Date.now() },  // 20 days ago, was 78 kg
      { d: '2026-10-10', w: 76, t: Date.now() },  // today, is 76 kg
    ]
    mount({ bodyweight })

    // Delta within 30 days is 76 - 78 = -2 kg (NOT 76 - 100 = -24 kg)
    const tile = [...host.querySelectorAll('.tile')].find(el => el.textContent.includes('Weight 30d'))
    expect(tile.textContent).toContain('2')
    expect(tile.textContent).not.toContain('24')
  })
})

describe('Stats exercise progress graph scaling', () => {
  it('correctly orders and charts 1 year of workout progress even without explicit w.start timestamps', () => {
    const workouts = [
      {
        id: 'w1', d: '2025-10-15',
        entries: [{ id: BENCH, target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: true }] }],
      },
      {
        id: 'w2', d: '2026-02-15',
        entries: [{ id: BENCH, target: { reps: 5, weight: 75 }, sets: [{ w: 75, r: 5, done: true }] }],
      },
      {
        id: 'w3', d: '2026-06-15',
        entries: [{ id: BENCH, target: { reps: 5, weight: 85 }, sets: [{ w: 85, r: 5, done: true }] }],
      },
      {
        id: 'w4', d: '2026-10-05',
        entries: [{ id: BENCH, target: { reps: 5, weight: 100 }, sets: [{ w: 100, r: 5, done: true }] }],
      },
    ]

    mount({ workouts })
    const chart = exChart()
    expect(chart).toBeTruthy()

    // Points must be chronologically ordered across the year
    expect(chart.points.map(p => p.d)).toEqual(['2025-10-15', '2026-02-15', '2026-06-15', '2026-10-05'])
    expect(chart.points.map(p => p.y)).toEqual([60, 75, 85, 100])

    // Each point must have a valid finite timestamp from workoutAt
    chart.points.forEach(p => {
      expect(Number.isFinite(p.t)).toBe(true)
    })
    expect(chart.points[0].t).toBeLessThan(chart.points[1].t)
    expect(chart.points[1].t).toBeLessThan(chart.points[2].t)
    expect(chart.points[2].t).toBeLessThan(chart.points[3].t)
  })

  it('scales correctly with a single workout', () => {
    const workouts = [
      {
        id: 'single', d: '2026-10-01', start: new Date('2026-10-01T12:00:00').getTime(),
        entries: [{ id: BENCH, target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }] }],
      },
    ]

    mount({ workouts })
    const chart = exChart()
    expect(chart).toBeTruthy()
    expect(chart.points).toHaveLength(1)
    expect(chart.points[0].y).toBe(80)
    expect(Number.isFinite(chart.points[0].t)).toBe(true)
  })

  it('scales correctly with multiple workouts on the same day', () => {
    const workouts = [
      {
        id: 'morning', d: '2026-10-05', start: new Date('2026-10-05T09:00:00').getTime(),
        entries: [{ id: BENCH, target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }] }],
      },
      {
        id: 'evening', d: '2026-10-05', start: new Date('2026-10-05T18:00:00').getTime(),
        entries: [{ id: BENCH, target: { reps: 5, weight: 85 }, sets: [{ w: 85, r: 5, done: true }] }],
      },
    ]

    mount({ workouts })
    const chart = exChart()
    expect(chart).toBeTruthy()
    expect(chart.points).toHaveLength(2)
    expect(chart.points.map(p => p.y)).toEqual([80, 85])
    expect(chart.points[0].t).toBeLessThan(chart.points[1].t)
  })
})
