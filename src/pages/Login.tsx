import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useStore } from '../store/useStore'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const session = useStore((s) => s.session)
  const authHydrated = useStore((s) => s.authHydrated)

  useEffect(() => {
    if (authHydrated && session) {
      navigate('/dashboard', { replace: true })
    }
  }, [authHydrated, session, navigate])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function handleSignUp() {
    setError(null)
    setSuccessMessage(null)
    setLoading(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    if (!data.session) {
      setSuccessMessage(
        'Conta criada! Verifique sua caixa de entrada para confirmar o email.',
      )
      setEmail('')
      setPassword('')
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function handleGoogleSignIn() {
    setError(null)
    setSuccessMessage(null)
    setLoading(true)
    try {
      const isElectron = navigator.userAgent.includes('Electron')
      const oauthRedirect = isElectron
        ? 'bendify://auth'
        : `${window.location.origin}/`
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: oauthRedirect,
          skipBrowserRedirect: true,
        },
      })
      if (err) {
        setError(err.message)
        return
      }
      const url = data?.url
      if (!url) {
        setError('Não foi possível iniciar o login com o Google.')
        return
      }
      if (isElectron) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        window.location.assign(url)
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Erro ao iniciar o login com o Google.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (!authHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1A1A1A] via-[#121212] to-[#121212] text-[#F5F5F5]">
        <p className="font-mono text-sm text-[#F5F5F5]/70">A carregar…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1A1A1A] via-[#121212] to-[#121212] p-6">
      <form
        onSubmit={(e) => void handleSignIn(e)}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_16px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      >
        <h1 className="mb-6 font-mono text-xl font-semibold tracking-tight text-[#F5F5F5]">
          Entrar
        </h1>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-[#F5F5F5]/90">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition placeholder:text-[#F5F5F5]/35 focus:border-[#FFB300]/50 focus:ring-2 focus:ring-[#FFB300]/25"
              placeholder="email@exemplo.com"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#F5F5F5]/90">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition placeholder:text-[#F5F5F5]/35 focus:border-[#FFB300]/50 focus:ring-2 focus:ring-[#FFB300]/25"
              placeholder="••••••••"
            />
          </label>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[#D32F2F]" role="alert">
            {error}
          </p>
        )}

        {successMessage && (
          <p
            className="mt-4 text-sm text-[#81C784]"
            role="status"
          >
            {successMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-[#FFB300] py-2.5 text-center text-sm font-semibold text-black transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Entrar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSignUp()}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-center text-sm font-semibold text-[#F5F5F5] backdrop-blur-sm transition enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Criar Conta
          </button>
        </div>

        <div className="relative my-6">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden
          >
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs font-medium tracking-wide text-[#F5F5F5]/45">
            <span className="bg-[#121212]/60 px-3 backdrop-blur-sm">ou</span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleGoogleSignIn()}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-[#121212]/50 py-3 text-sm font-medium text-[#F5F5F5]/90 backdrop-blur-sm transition enabled:hover:border-[#FFB300]/20 enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
          Continuar com o Google
        </button>
      </form>
    </div>
  )
}
