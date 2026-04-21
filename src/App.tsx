import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import ProtectedRoute from './components/ProtectedRoute'
import type { Session } from '@supabase/supabase-js'
import { supabase, fetchUserStreak, syncProfileIdentityFromSession } from './utils/supabase'
import { useStore } from './store/useStore'

const AUTH_URL_KEYS = new Set([
  'code',
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'state',
  'scope',
])

type OAuthPayloadKey =
  | 'code'
  | 'access_token'
  | 'refresh_token'
  | 'expires_at'
  | 'expires_in'
  | 'token_type'
  | 'provider_token'
  | 'provider_refresh_token'
  | 'state'
  | 'scope'

type OAuthPayload = Partial<Record<OAuthPayloadKey, string>>

declare global {
  interface Window {
    __BENDIFY_OAUTH_PAYLOAD__?: OAuthPayload
  }
}

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Practice = lazy(() => import('./pages/Practice'))
const Tools = lazy(() => import('./pages/Tools'))
const Tones = lazy(() => import('./pages/Tones'))
const Scales = lazy(() => import('./pages/Scales'))
const Log = lazy(() => import('./pages/Log'))
const Ranking = lazy(() => import('./pages/Ranking'))
const Contact = lazy(() => import('./pages/Contact'))
const EarTraining = lazy(() => import('./pages/EarTraining'))
const FretboardMastery = lazy(() => import('./pages/FretboardMastery'))
const ScaleGenius = lazy(() => import('./pages/ScaleGenius'))
const PitchStrike = lazy(() => import('./pages/PitchStrike'))
const ScaleRunner = lazy(() => import('./pages/ScaleRunner'))
const GuitarHero = lazy(() => import('./pages/GuitarHero'))
const Shop = lazy(() => import('./pages/Shop'))
const Friends = lazy(() => import('./pages/Friends'))
const Teams = lazy(() => import('./pages/Teams'))
const Achievements = lazy(() => import('./pages/Achievements'))
const Login = lazy(() => import('./pages/Login'))
const VirtualBand = lazy(() => import('./pages/VirtualBand'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] text-[#F5F5F5]/70">
      <p className="font-mono text-sm">Carregando…</p>
    </div>
  )
}

async function syncStreakFromSupabaseForUser(session: Session | null) {
  const userId = session?.user?.id
  if (!userId) return
  const streak = await fetchUserStreak(userId)
  useStore.getState().setStreak(streak)
}

/** Indica se a URL ainda pode estar a ser processada pelo Supabase após OAuth (PKCE em query ou tokens no hash). */
function urlMayContainAuthTokens(): boolean {
  const { hash, search } = window.location
  return (
    /access_token=/.test(hash) ||
    /refresh_token=/.test(hash) ||
    /[?&]code=/.test(search) ||
    /access_token=/.test(search) ||
    /refresh_token=/.test(search)
  )
}

function deleteAuthKeys(params: URLSearchParams): boolean {
  let changed = false
  for (const key of AUTH_URL_KEYS) {
    if (params.has(key)) {
      params.delete(key)
      changed = true
    }
  }
  return changed
}

/**
 * Com HashRouter, `redirect_to` não pode incluir `#/rota`: o fluxo implícito devolve
 * `#access_token=...` no fragmento e o resultado era `#/auth#access_token=...` (inválido).
 * Reduz a um único fragmento `#access_token=...` para o cliente Auth conseguir ler.
 */
function normalizeDoubleHashOAuthRedirect(): void {
  const raw = window.location.hash
  if (!raw || !raw.includes('access_token')) return
  const parts = raw.split('#')
  if (parts.length < 3) return
  const tail = parts.slice(2).join('#')
  if (!tail.startsWith('access_token=')) return
  const url = new URL(window.location.href)
  url.hash = `#${tail}`
  window.history.replaceState(null, '', url.toString())
}

function cleanupAuthUrlTokens(): void {
  const url = new URL(window.location.href)
  let changed = deleteAuthKeys(url.searchParams)

  const hashRaw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (hashRaw) {
    if (hashRaw.startsWith('/')) {
      const [routePath, routeQuery] = hashRaw.split('?')
      if (routeQuery) {
        const routeParams = new URLSearchParams(routeQuery)
        const routeChanged = deleteAuthKeys(routeParams)
        if (routeChanged) {
          const nextHash = routeParams.toString()
          url.hash = nextHash ? `${routePath}?${nextHash}` : routePath
          changed = true
        }
      }
    } else {
      const hashParams = new URLSearchParams(hashRaw)
      const hashChanged = deleteAuthKeys(hashParams)
      if (hashChanged) {
        const nextHash = hashParams.toString()
        url.hash = nextHash ? nextHash : ''
        changed = true
      }
    }
  }

  if (changed) {
    window.history.replaceState(null, '', url.toString())
  }
}

function sanitizeOAuthPayload(payload: OAuthPayload | null | undefined): OAuthPayload | null {
  if (!payload) {
    return null
  }
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) => AUTH_URL_KEYS.has(key) && typeof value === 'string' && value.length > 0,
    ),
  ) as OAuthPayload

  return Object.keys(sanitized).length > 0 ? sanitized : null
}

async function hydrateSessionFromDeepLinkPayload(payload: OAuthPayload): Promise<Session | null> {
  if (payload.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code)
    if (error) throw error
    return data.session
  }

  if (payload.access_token && payload.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    })
    if (error) throw error
    return data.session
  }

  return null
}

function applySessionToStore(session: Session | null) {
  const store = useStore.getState()
  store.setSession(session)
  if (session?.user) {
    void syncProfileIdentityFromSession(session.user.id, session.user.email)
    void syncStreakFromSupabaseForUser(session)
    void store.syncEquippedItemsFromDb()
    void store.syncInventoryFromDb()
    void store.syncProfileEconomyFromDb()
  } else {
    void store.syncEquippedItemsFromDb()
    void store.syncInventoryFromDb()
    void store.syncProfileEconomyFromDb()
  }
}

function AuthSync({
  onInitialSessionResolved,
}: {
  onInitialSessionResolved: () => void
}) {
  useEffect(() => {
    let cancelled = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionToStore(session)
      if (session) {
        cleanupAuthUrlTokens()
      }
    })

    async function resolveInitialSession() {
      try {
        normalizeDoubleHashOAuthRedirect()
        const payloadFromWindow = sanitizeOAuthPayload(window.__BENDIFY_OAUTH_PAYLOAD__)
        if (payloadFromWindow) {
          window.__BENDIFY_OAUTH_PAYLOAD__ = undefined
          const sessionFromPayload =
            await hydrateSessionFromDeepLinkPayload(payloadFromWindow)
          applySessionToStore(sessionFromPayload)
          cleanupAuthUrlTokens()
        }

        const { data: first } = await supabase.auth.getSession()
        if (cancelled) return
        applySessionToStore(first.session)

        if (!first.session && urlMayContainAuthTokens()) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
          })
          const { data: second } = await supabase.auth.getSession()
          if (cancelled) return
          applySessionToStore(second.session)
        }

        cleanupAuthUrlTokens()
      } catch {
        console.error('[auth] Failed to hydrate OAuth session safely.')
      } finally {
        window.__BENDIFY_OAUTH_PAYLOAD__ = undefined
      }
    }

    function handleElectronDeepLink(event: Event) {
      const customEvent = event as CustomEvent<OAuthPayload>
      const payload = sanitizeOAuthPayload(customEvent.detail)
      if (!payload) {
        return
      }
      void hydrateSessionFromDeepLinkPayload(payload)
        .then((session) => {
          applySessionToStore(session)
          cleanupAuthUrlTokens()
        })
        .catch(() => {
          console.error('[auth] Failed to process OAuth deep link payload.')
        })
        .finally(() => {
          window.__BENDIFY_OAUTH_PAYLOAD__ = undefined
        })
    }

    window.addEventListener('bendify-oauth-deeplink', handleElectronDeepLink)

    async function bootstrap() {
      try {
        await resolveInitialSession()
      } finally {
        if (!cancelled) {
          useStore.getState().setAuthHydrated(true)
          onInitialSessionResolved()
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      window.removeEventListener('bendify-oauth-deeplink', handleElectronDeepLink)
      subscription.unsubscribe()
    }
  }, [onInitialSessionResolved])

  return null
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true)
  const onInitialSessionResolved = useCallback(() => {
    setIsInitializing(false)
  }, [])

  return (
    <>
      <AuthSync onInitialSessionResolved={onInitialSessionResolved} />
      {isInitializing ? (
        <div className="flex min-h-screen items-center justify-center bg-black text-[#F5F5F5]/70">
          <p className="font-mono text-sm">Carregando…</p>
        </div>
      ) : (
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth" element={<Login />} />
            {/* Um único MainLayout: evita remontar o layout ao ir de rotas protegidas para /tones, /scales, etc. (antes o microfone desligava). */}
            <Route element={<MainLayout />}>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/virtual-band" element={<VirtualBand />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/friends" element={<Friends />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/contact" element={<Contact />} />
                <Route
                  path="/challenges/ear-training"
                  element={<EarTraining />}
                />
                <Route
                  path="/challenges/fretboard"
                  element={<FretboardMastery />}
                />
                <Route
                  path="/challenges/genius"
                  element={<ScaleGenius />}
                />
                <Route
                  path="/challenges/pitch-strike"
                  element={<PitchStrike />}
                />
                <Route
                  path="/challenges/scale-runner"
                  element={<ScaleRunner />}
                />
                <Route
                  path="/challenges/guitar-hero"
                  element={<GuitarHero />}
                />
              </Route>
              <Route path="/tones" element={<Tones />} />
              <Route path="/scales" element={<Scales />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/log" element={<Log />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      )}
    </>
  )
}
