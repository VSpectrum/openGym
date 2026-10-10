// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The sign-in screen with password sign-in (#118). Only an instance that advertises
   `password_login` shows any of it; there, a browser without passkey support finally has a way
   in instead of being told to stay local, and creating a profile can use a password. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: true, config: null, sheets: [] }
  state.snapshot = () => ({
    config: state.config, S: {},
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: vi.fn(), loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(), pullState: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), BIO: 'your fingerprint', bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
vi.mock('../lib/demo.js', () => ({ DEMO: false, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const buttons = host => [...host.querySelectorAll('button')].map(b => b.textContent)
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => { mocks.webauthn = true; mocks.config = null; mocks.sheets.length = 0 })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Login with password sign-in', () => {
  it('an instance without it looks exactly as before', () => {
    const page = mount(<Login />)
    expect(buttons(page)).not.toContain('Sign in with password')
    expect(page.textContent).toContain('Passkeys use your fingerprint. No passwords to remember.')
    mocks.webauthn = false
    const noPasskeys = mount(<Login />)
    expect(noPasskeys.textContent).toContain("This browser doesn't do passkeys, but you can still use openGym locally on this device.")
    expect(buttons(noPasskeys)).not.toContain('Sign in with password')
  })

  it('with password sign-in enabled, the username and password form is directly on screen', () => {
    mocks.config = { password_login: true, allow_guest: true }
    const page = mount(<Login />)
    expect(page.querySelector('input[name="username"]')).toBeTruthy()
    expect(page.querySelector('input[name="password"]')).toBeTruthy()
    expect(buttons(page)).toContain('Sign in')
    expect(buttons(page)).toContain('Sign in with passkey')
    expect(page.textContent).toContain('Passkeys use your fingerprint. A password works too, where passkeys do not.')
  })

  it('a browser without passkeys gets the inline password form instead of "stay local"', () => {
    mocks.webauthn = false
    mocks.config = { password_login: true, allow_guest: false }
    const page = mount(<Login />)
    expect(page.querySelector('input[name="username"]')).toBeTruthy()
    expect(page.querySelector('input[name="password"]')).toBeTruthy()
    expect(buttons(page)).toContain('Sign in')
    expect(buttons(page)).not.toContain('Sign in with passkey')
  })

  it('switching to Create Profile tab shows registration inputs inline', () => {
    mocks.config = { password_login: true, invite_only: true }
    const page = mount(<Login />)
    act(() => button(page, 'Create profile').click())
    expect(page.querySelector('input[placeholder="Your name"]')).toBeTruthy()
    expect(page.querySelector('input[placeholder="Invite code"]')).toBeTruthy()
    expect(page.querySelector('input[placeholder="Password"]')).toBeTruthy()
    expect(page.querySelector('input[placeholder="Repeat the password"]')).toBeTruthy()
    expect(buttons(page)).toContain('Create profile')
  })
})
