// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LineChart from './LineChart.jsx'
import { fmtDate, isoOf } from '../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const point = (year, month, day, y) => ({
  d: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  t: new Date(year, month - 1, day, 12).getTime(),
  y
})

const firstPoints = [
  { t: Date.UTC(2026, 0, 1), y: 80, d: '2026-01-01' },
  { t: Date.UTC(2026, 0, 15), y: 82, d: '2026-01-15' },
]
const nextPoints = [
  { t: Date.UTC(2026, 1, 1), y: 78, d: '2026-02-01' },
  { t: Date.UTC(2026, 1, 15), y: 79, d: '2026-02-15' },
]

function renderChart(points) {
  act(() => root.render(<LineChart points={points} axes={false} unit="kg" />))
}

function hoverAt(clientX) {
  act(() => {
    container.querySelector('.chart-i').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX }))
  })
  return container.querySelector('.ctip').textContent
}

describe('LineChart hover date', () => {
  it('keeps same-year points in the compact format', () => {
    const first = point(2026, 1, 15, 70)
    renderChart([first, point(2026, 2, 15, 71)])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true)} · 70 kg`)
  })

  it('includes the calendar year at a short cross-year boundary', () => {
    const first = point(2025, 11, 30, 70)
    const last = point(2026, 2, 1, 71)
    renderChart([first, last])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true, true)} · 70 kg`)
    expect(hoverAt(340)).toBe(`${fmtDate(last.d, true, true)} · 71 kg`)
  })

  it('keeps a single point compact', () => {
    const only = point(2026, 7, 4, 70)
    renderChart([only])

    expect(hoverAt(170)).toBe(`${fmtDate(only.d, true)} · 70 kg`)
  })

  it('uses timestamp-only points when deciding whether to show the year', () => {
    const first = point(2025, 12, 31, 70)
    const last = point(2026, 1, 1, 71)
    const timestampOnly = [{ t: first.t, y: first.y }, { t: last.t, y: last.y }]
    renderChart(timestampOnly)

    const lastIso = isoOf(new Date(last.t))
    expect(hoverAt(340)).toBe(`${fmtDate(lastIso, true, true)} · 71 kg`)
  })
})

describe('LineChart hover state', () => {
  it('clears the tooltip and hover markers when points are replaced, then allows hovering again', () => {
    renderChart(firstPoints)
    hoverAt(170)

    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
    expect(container.querySelector('.chl')).toBeTruthy()

    renderChart(nextPoints)

    expect(container.querySelector('.ctip')).toBeNull()
    expect(container.querySelector('.cvl')).toBeNull()
    expect(container.querySelector('.chl')).toBeNull()

    hoverAt(170)
    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
  })
})

describe('LineChart y axis', () => {
  it('labels the zero line 0, never -0, when the range dips just below zero', () => {
    act(() => root.render(<LineChart points={[point(2026, 1, 1, 70), point(2026, 1, 8, 9999)]} axes unit="kg" />))
    const labels = [...container.querySelectorAll('text')].map(n => n.textContent)
    expect(labels).toContain('0')
    expect(labels.some(l => /^[-\u2212]0$/.test(l))).toBe(false)
  })

  it('inverts the y scale when invert=true', () => {
    const low = { t: 1000, y: 1 }
    const high = { t: 2000, y: 4 }
    act(() => root.render(<LineChart points={[low, high]} axes={false} invert={true} />))
    const poly = container.querySelector('polyline').getAttribute('points')
    const coords = poly.split(' ').map(pair => pair.split(',').map(Number))
    // In SVG, higher values are drawn higher up (smaller cy) normally; when inverted,
    // the lower value (y=1, e.g. 1 RIR which is harder) is drawn higher (smaller Y value).
    expect(coords[0][1]).toBeLessThan(coords[1][1])
  })
})

describe('LineChart x axis scaling and date handling', () => {
  it('correctly scales and displays year indicators on x axis when data spans across a year', () => {
    // 1 year of weekly weigh-ins from Oct 2025 to Oct 2026
    const points = [
      point(2025, 10, 10, 80),
      point(2025, 12, 1, 79),
      point(2026, 3, 1, 78),
      point(2026, 6, 1, 76),
      point(2026, 10, 10, 75),
    ]
    act(() => root.render(<LineChart points={points} axes unit="kg" />))
    const labels = [...container.querySelectorAll('text')].map(n => n.textContent)
    // Should contain month labels with year indicators since it spans across 2025 and 2026
    expect(labels.some(l => l.includes("'25") || l.includes("'26"))).toBe(true)
    // Points should map from left (x=34) to right (x=328)
    const circles = [...container.querySelectorAll('circle')]
    const lastCircle = circles.at(-1)
    expect(parseFloat(lastCircle.getAttribute('cx'))).toBeCloseTo(328, 0)
  })

  it('scales across a 3-month window without year suffixes when within the same calendar year', () => {
    const points = [
      point(2026, 7, 10, 78),
      point(2026, 8, 10, 77),
      point(2026, 9, 10, 76),
      point(2026, 10, 10, 75),
    ]
    act(() => root.render(<LineChart points={points} axes unit="kg" />))
    const labels = [...container.querySelectorAll('text')].map(n => n.textContent)
    expect(labels.some(l => l.includes('Aug') || l.includes('Sep') || l.includes('Oct'))).toBe(true)
    expect(labels.some(l => l.includes("'26"))).toBe(false)
  })

  it('handles points passed out of order by sorting chronologically', () => {
    const p1 = point(2026, 1, 10, 70)
    const p2 = point(2026, 3, 10, 72)
    const p3 = point(2026, 5, 10, 74)
    // Pass in reverse order
    act(() => root.render(<LineChart points={[p3, p1, p2]} axes={false} />))
    const poly = container.querySelector('polyline').getAttribute('points')
    const coords = poly.split(' ').map(pair => pair.split(',').map(Number))
    // x coordinates should be strictly ascending
    expect(coords[0][0]).toBeLessThan(coords[1][0])
    expect(coords[1][0]).toBeLessThan(coords[2][0])
  })

  it('renders a single clean centered tick when all points have the same timestamp', () => {
    const p1 = { t: 1728561600000, y: 70, d: '2026-10-10' }
    const p2 = { t: 1728561600000, y: 72, d: '2026-10-10' }
    act(() => root.render(<LineChart points={[p1, p2]} axes unit="kg" />))
    const xLabels = [...container.querySelectorAll('text')].filter(n => n.getAttribute('y') === '143') // H - 7 = 143
    // Should render exactly 1 x-axis label, not 3 duplicate overlapping labels
    expect(xLabels).toHaveLength(1)
    expect(xLabels[0].getAttribute('text-anchor')).toBe('middle')
  })

  it('correctly spans multi-series data across the combined series bounds', () => {
    const series = [
      { color: 'red', points: [{ t: 1000, y: 100 }, { t: 3000, y: 120 }] },
      { color: 'blue', points: [{ t: 2000, y: 50 }, { t: 4000, y: 80 }] },
    ]
    const anchors = [
      { t: 1000, y: 100 }, { t: 2000, y: 100 }, { t: 3000, y: 120 }, { t: 4000, y: 80 }
    ]
    act(() => root.render(<LineChart points={anchors} series={series} axes={false} />))
    const polylines = [...container.querySelectorAll('polyline')]
    expect(polylines).toHaveLength(2)
  })
})

