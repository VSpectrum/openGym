import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  webauthnOK, passkeyLogin, passkeyRegister, passkeyError, bio,
  passwordLogin, passwordRegister, passwordResetRedeem
} from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import { useState, useRef, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'
import {
  passwordOn, PasswordRegisterForm, openPasswordSignIn,
  MIN_PASSWORD, looksLikeEmail, passwordError
} from '../components/PasswordAuth.jsx'
import { openDeviceLinkRedeem } from '../components/Passkeys.jsx'

function RegisterSheet({ close }) {
  const { setUser, pushState, pullState, loadConfig } = useStore()
  const config = useStore(s => s.config)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const inviteOnly = !!config?.invite_only
  const pwOn = passwordOn(config)
  const [how, setHow] = useState(webauthnOK() ? 'passkey' : 'password')
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  useEffect(() => { loadConfig() }, [loadConfig])
  const go = async () => {
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created, and this device’s data moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(passkeyError(e, t('Registration failed'))) }
  }
  const choose = pwOn && webauthnOK() && <>
    <Segmented options={[{ value: 'passkey', label: t('Passkey'), icon: 'fingerprint' }, { value: 'password', label: t('Password'), icon: 'key' }]}
      value={how} onChange={setHow} />
    <div style={{ height: 12 }} />
  </>
  if (pwOn && how === 'password') return <>
    <h3>{t('Create your profile')}</h3>
    {choose}
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name and a password. You sign in with both.')}</div>
    <PasswordRegisterForm close={close} inviteOnly={inviteOnly} name={name} setName={setName} code={code} setCode={setCode} />
  </>
  return <>
    <h3>{t('Create your profile')}</h3>
    {choose}
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with {0}. The passkey lives on your device, so no password needed.', bio())}</div>
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only. Enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

export default function Login() {
  const { setUser, adoptProfile, setGuest, pushState, pullState, loadConfig } = useStore()
  const config = useStore(s => s.config)
  const canGuest = guestAllowed(config)
  const pwOn = passwordOn(config)
  const inviteOnly = !!config?.invite_only

  useEffect(() => { loadConfig?.() }, [loadConfig])

  // Sign-in / Register tabs
  const [tab, setTab] = useState('signin') // 'signin' | 'register'

  // Sign-in form state
  const [loginName, setLoginName] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginErr, setLoginErr] = useState(null)
  const [isReset, setIsReset] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetNewPw, setResetNewPw] = useState('')
  const [resetAgain, setResetAgain] = useState('')

  // Register form state
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regPw, setRegPw] = useState('')
  const [regAgain, setRegAgain] = useState('')
  const [regBusy, setRegBusy] = useState(false)
  const [regErr, setRegErr] = useState(null)

  const registerSheet = () => useUI.getState().openSheet(close => <RegisterSheet close={close} />)

  const signInPasskey = async () => {
    try {
      const u = await passkeyLogin()
      setUser(u, { adopt: true })
      await adoptProfile(askAddDeviceData)
      useUI.getState().toast(t('Welcome back, {0}', u.name))
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
        useUI.getState().toast(passkeyError(e, t('Sign-in failed')))
      }
    }
  }

  const handleSignIn = async ev => {
    ev.preventDefault()
    if (loginBusy) return
    const n = loginName.trim()
    const bad = !n ? t('Enter your name or e-mail.')
      : !isReset && !loginPw ? t('Enter your password.')
      : isReset && !resetCode.trim() ? t('Enter the reset code.')
      : isReset && [...resetNewPw].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : isReset && resetNewPw !== resetAgain ? t('The two passwords are not the same.')
      : null
    if (bad) { setLoginErr(bad); return }
    setLoginBusy(true); setLoginErr(null)
    try {
      const u = isReset
        ? await passwordResetRedeem(n, resetCode.trim(), resetNewPw)
        : await passwordLogin(n, loginPw)
      setUser(u, { adopt: true })
      await adoptProfile(askAddDeviceData)
      useUI.getState().toast(t('Welcome back, {0}', u.name))
    } catch (e) {
      setLoginErr(passwordError(e))
    } finally {
      setLoginBusy(false)
    }
  }

  const handleRegister = async ev => {
    ev.preventDefault()
    if (regBusy) return
    const n = regName.trim()
    const mail = regEmail.trim()
    const bad = !n ? t('Enter a name')
      : mail && !looksLikeEmail(mail) ? t('That is not an e-mail address.')
      : inviteOnly && !regCode.trim() ? t('An invite code is required')
      : [...regPw].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : regPw !== regAgain ? t('The two passwords are not the same.')
      : null
    if (bad) { setRegErr(bad); return }
    setRegBusy(true); setRegErr(null)
    try {
      const u = await passwordRegister(n, regPw, regCode.trim(), mail)
      setUser(u)
      if (hasData(useStore.getState().S)) {
        await pushState()
        useUI.getState().toast(t('Profile created, and this device’s data moved into it'))
      } else {
        await pullState()
        useUI.getState().toast(t('Welcome, {0}', u.name))
      }
    } catch (e) {
      setRegErr(passwordError(e))
    } finally {
      setRegBusy(false)
    }
  }

  const head = <>
    <div style={{ fontSize: 52, display: 'flex', justifyContent: 'center', color: 'var(--acc)', marginBottom: 6 }}>
      <Icon name="dumbbell" />
    </div>
    <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', margin: '4px 0 2px' }}>openGym</h1>
    <div className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
      {t('Your workouts. Your weights. Your profile.')}
    </div>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo. Everything stays in this browser.')}</div>
      <Button variant="primary" icon="play" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'start', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data. Nothing is sent anywhere. Passkey sign-in and sync across your devices come with the openGym server, which you get by self-hosting it.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <a href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a>
      </div>
    </div>
  )

  const fieldProps = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
  const codeStyle = { letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }
  const errBoxStyle = {
    marginTop: 12,
    padding: '10px 14px',
    borderRadius: 'var(--r-sm)',
    background: 'color-mix(in srgb, var(--red) 12%, transparent)',
    color: 'var(--red)',
    fontSize: 13,
    lineHeight: 1.4,
    border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
    textAlign: 'start'
  }
  const cardStyle = {
    background: 'var(--surface)',
    borderRadius: 'var(--r-xl)',
    padding: '22px 18px',
    boxShadow: '0 8px 30px rgba(0,0,0,.2)',
    border: 'var(--hair) solid var(--sep-op)',
    textAlign: 'start',
    marginBottom: 16
  }

  return (
    <div className="narrow" style={wrap}>
      {head}

      {pwOn ? (
        <>
          <div style={cardStyle}>
            <Segmented
              options={[
                { value: 'signin', label: t('Sign in'), icon: 'key' },
                { value: 'register', label: t('Create profile'), icon: 'plusCircle' }
              ]}
              value={tab}
              onChange={v => { setTab(v); setLoginErr(null); setRegErr(null) }}
            />
            <div style={{ height: 16 }} />

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} noValidate>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>
                  {isReset ? t('Reset your password') : t('Sign in with password')}
                </div>
                <div className="muted small" style={{ marginBottom: 14 }}>
                  {isReset
                    ? t('Enter the code your admin gave you and choose a new password. It signs you out everywhere else.')
                    : t('Use your profile name (or the e-mail you added to it) and your password.')}
                </div>

                <input
                  className="input"
                  style={{ background: 'var(--surface-2)' }}
                  name="username"
                  autoComplete="username"
                  placeholder={t('Name or e-mail')}
                  maxLength={254}
                  value={loginName}
                  onChange={e => setLoginName(e.target.value)}
                  {...fieldProps}
                />
                <div style={{ height: 10 }} />

                {isReset ? (
                  <>
                    <input
                      className="input"
                      style={{ background: 'var(--surface-2)', ...codeStyle }}
                      name="reset-code"
                      autoComplete="one-time-code"
                      placeholder={t('Reset code')}
                      maxLength={20}
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value.toUpperCase())}
                      {...fieldProps}
                    />
                    <div style={{ height: 10 }} />
                    <input
                      className="input"
                      style={{ background: 'var(--surface-2)' }}
                      type="password"
                      name="new-password"
                      autoComplete="new-password"
                      placeholder={t('New password')}
                      value={resetNewPw}
                      onChange={e => setResetNewPw(e.target.value)}
                    />
                    <div style={{ height: 10 }} />
                    <input
                      className="input"
                      style={{ background: 'var(--surface-2)' }}
                      type="password"
                      name="new-password-again"
                      autoComplete="new-password"
                      placeholder={t('Repeat the password')}
                      value={resetAgain}
                      onChange={e => setResetAgain(e.target.value)}
                    />
                    <div className="dim small" style={{ marginTop: 6 }}>
                      {t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}
                    </div>
                  </>
                ) : (
                  <input
                    className="input"
                    style={{ background: 'var(--surface-2)' }}
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder={t('Password')}
                    value={loginPw}
                    onChange={e => setLoginPw(e.target.value)}
                  />
                )}

                {loginErr && <div role="alert" style={errBoxStyle}>{loginErr}</div>}

                <div style={{ height: 14 }} />
                <Button type="submit" variant="primary" disabled={loginBusy}>
                  {loginBusy ? t('Signing in…') : (isReset ? t('Set password & sign in') : t('Sign in'))}
                </Button>

                <div style={{ height: 8 }} />
                <Button
                  type="button"
                  variant="ghost"
                  className="dim"
                  onClick={() => { setLoginErr(null); setIsReset(!isReset) }}
                >
                  {isReset ? t('Sign in with password') : t('Have a reset code from your admin?')}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} noValidate>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>
                  {t('Create your profile')}
                </div>
                <div className="muted small" style={{ marginBottom: 14 }}>
                  {t('Pick a name and a password. You sign in with both.')}
                </div>

                <input
                  className="input"
                  style={{ background: 'var(--surface-2)' }}
                  name="username"
                  autoComplete="username"
                  placeholder={t('Your name')}
                  maxLength={40}
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  {...fieldProps}
                />
                <div style={{ height: 10 }} />

                <input
                  className="input"
                  style={{ background: 'var(--surface-2)' }}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('E-mail (optional)')}
                  maxLength={254}
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  {...fieldProps}
                />
                <div className="dim small" style={{ marginTop: 4, marginBottom: 6 }}>
                  {t('Lets you sign in with it instead of your name. Nothing is ever sent to it.')}
                </div>

                {inviteOnly && (
                  <>
                    <div style={{ height: 6 }} />
                    <input
                      className="input"
                      style={{ background: 'var(--surface-2)', ...codeStyle }}
                      placeholder={t('Invite code')}
                      maxLength={40}
                      value={regCode}
                      onChange={e => setRegCode(e.target.value.toUpperCase())}
                    />
                    <div className="dim small" style={{ marginTop: 4, marginBottom: 6 }}>
                      {t('This app is invite-only. Enter the code you were given.')}
                    </div>
                  </>
                )}

                <div style={{ height: 6 }} />
                <input
                  className="input"
                  style={{ background: 'var(--surface-2)' }}
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  placeholder={t('Password')}
                  value={regPw}
                  onChange={e => setRegPw(e.target.value)}
                />
                <div style={{ height: 10 }} />

                <input
                  className="input"
                  style={{ background: 'var(--surface-2)' }}
                  type="password"
                  name="new-password-again"
                  autoComplete="new-password"
                  placeholder={t('Repeat the password')}
                  value={regAgain}
                  onChange={e => setRegAgain(e.target.value)}
                />
                <div className="dim small" style={{ marginTop: 6 }}>
                  {t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}
                </div>

                {regErr && <div role="alert" style={errBoxStyle}>{regErr}</div>}

                <div style={{ height: 14 }} />
                <Button type="submit" variant="primary" disabled={regBusy}>
                  {regBusy ? t('Creating…') : t('Create profile')}
                </Button>
              </form>
            )}
          </div>

          {webauthnOK() && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <Button variant="ghost" className="dim" icon="fingerprint" onClick={signInPasskey}>
                {t('Sign in with passkey')}
              </Button>
              <Button variant="ghost" className="dim" icon="qr" onClick={openDeviceLinkRedeem}>
                {t('Use a code from your other device')}
              </Button>
            </div>
          )}

          {canGuest && (
            <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>
              {t('Continue without account')}
            </Button>
          )}

          <div className="dim small" style={{ marginTop: 16, lineHeight: 1.5 }}>
            {t('Passkeys use {0}. A password works too, where passkeys do not.', bio())}
            <br />
            {t('Each profile keeps its own plan, workouts & body weight.')}
          </div>
        </>
      ) : (
        <>
          {webauthnOK() ? <>
            <Button variant="primary" icon="fingerprint" onClick={signInPasskey}>{t('Sign in with passkey')}</Button>
            <div style={{ height: 10 }} />
            <Button icon="plusCircle" onClick={registerSheet}>{t('Create new profile')}</Button>
            <div style={{ height: 10 }} />
            <Button variant="ghost" className="dim" icon="qr" onClick={openDeviceLinkRedeem}>{t('Use a code from your other device')}</Button>
            {canGuest && <div style={{ height: 4 }} />}
          </> : <div className="card small muted" style={{ textAlign: 'start' }}>{canGuest
            ? t("This browser doesn't do passkeys, but you can still use openGym locally on this device.")
            : t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
          {canGuest && <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
          <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>
            {t('Passkeys use {0}. No passwords to remember.', bio())}
            <br />
            {t('Each profile keeps its own plan, workouts & body weight.')}
          </div>
        </>
      )}
    </div>
  )
}
