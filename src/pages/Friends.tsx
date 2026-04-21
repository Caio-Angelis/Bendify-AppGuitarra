import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  acceptFriendRequest,
  fetchPendingIncomingFriendRequests,
  searchProfilesByUsername,
  sendFriendRequest,
  type ProfileSearchRow,
} from '../utils/supabase'

type TabId = 'search' | 'requests'

export default function Friends() {
  const session = useStore((s) => s.session)
  const userId = session?.user?.id ?? ''
  const [tab, setTab] = useState<TabId>('search')
  const [searchText, setSearchText] = useState('')
  const [results, setResults] = useState<ProfileSearchRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [incoming, setIncoming] = useState<
    { requester_id: string; username: string }[]
  >([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  const loadIncoming = useCallback(async () => {
    if (!userId) return
    setRequestsLoading(true)
    setRequestsError(null)
    const { data, error } = await fetchPendingIncomingFriendRequests(userId)
    if (error) {
      setRequestsError(error.message)
      setIncoming([])
    } else {
      setIncoming(data ?? [])
    }
    setRequestsLoading(false)
  }, [userId])

  useEffect(() => {
    if (tab === 'requests' && userId) {
      void loadIncoming()
    }
  }, [tab, userId, loadIncoming])

  useEffect(() => {
    if (!userId) return
    const t = searchText.trim()
    if (t.length === 0) {
      setResults([])
      setSearchError(null)
      return
    }

    setSearchLoading(true)
    setSearchError(null)
    const handle = window.setTimeout(async () => {
      const { data, error } = await searchProfilesByUsername(t, userId)
      setSearchLoading(false)
      if (error) {
        setSearchError(error.message)
        setResults([])
      } else {
        setResults(data ?? [])
      }
    }, 400)

    return () => window.clearTimeout(handle)
  }, [searchText, userId])

  async function handleAdd(recipientId: string) {
    if (!userId) return
    setActionError(null)
    setAddingId(recipientId)
    const { error } = await sendFriendRequest(userId, recipientId)
    setAddingId(null)
    if (error) {
      setActionError(error.message)
    }
  }

  async function handleAccept(requesterId: string) {
    if (!userId) return
    setActionError(null)
    setAcceptingId(requesterId)
    const { error } = await acceptFriendRequest(requesterId, userId)
    setAcceptingId(null)
    if (error) {
      setActionError(error.message)
    } else {
      void loadIncoming()
    }
  }

  const tabBtn = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setTab(id)
        setActionError(null)
      }}
      className={[
        'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
        tab === id
          ? 'bg-[#FFB300]/15 text-[#FFB300] ring-1 ring-[#FFB300]/50'
          : 'text-gray-400 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  )

  if (!userId) {
    return (
      <div className="mx-auto max-w-2xl text-[#F5F5F5]/70">
        <p className="font-mono text-sm">Inicie sessão para gerir amigos.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <h1 className="mb-6 font-mono text-2xl font-semibold tracking-tight text-[#F5F5F5] md:text-3xl">
        Amigos
      </h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabBtn('search', 'Buscar usuários')}
        {tabBtn('requests', 'Minhas solicitações')}
      </div>

      {actionError && (
        <p className="mb-4 text-xs text-[#D32F2F]" role="alert">
          {actionError}
        </p>
      )}

      {tab === 'search' && (
        <section
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          aria-labelledby="friends-search-heading"
        >
          <h2
            id="friends-search-heading"
            className="mb-4 font-mono text-lg font-semibold text-[#F5F5F5]"
          >
            Buscar por username
          </h2>
          <label htmlFor="friends-username-search" className="sr-only">
            Username
          </label>
          <input
            id="friends-username-search"
            type="search"
            autoComplete="off"
            placeholder="Digite parte do username…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="mb-4 w-full rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-sm text-[#F5F5F5] placeholder:text-[#F5F5F5]/40 backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:outline-none focus:ring-1 focus:ring-[#FFB300]/30"
          />

          {searchLoading && (
            <p className="font-mono text-sm text-[#F5F5F5]/70">A pesquisar…</p>
          )}
          {!searchLoading && searchError && (
            <p className="text-xs text-[#D32F2F]" role="alert">
              {searchError}
            </p>
          )}
          {!searchLoading &&
            !searchError &&
            searchText.trim().length > 0 &&
            results.length === 0 && (
              <p className="font-mono text-sm text-[#F5F5F5]/70">
                Nenhum perfil encontrado.
              </p>
            )}

          {!searchLoading && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 backdrop-blur-sm transition-all duration-300 hover:border-[#FFB300]/20 hover:shadow-lg hover:shadow-[#FFB300]/10"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[#F5F5F5]">
                    {row.username ?? row.id}
                  </span>
                  <button
                    type="button"
                    disabled={addingId === row.id}
                    onClick={() => void handleAdd(row.id)}
                    className="shrink-0 rounded-lg bg-[#FFB300]/20 px-3 py-1.5 text-sm font-medium text-[#FFB300] ring-1 ring-[#FFB300]/40 transition hover:bg-[#FFB300]/30 disabled:opacity-50"
                  >
                    {addingId === row.id ? 'A enviar…' : 'Adicionar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'requests' && (
        <section
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          aria-labelledby="friends-requests-heading"
        >
          <h2
            id="friends-requests-heading"
            className="mb-4 font-mono text-lg font-semibold text-[#F5F5F5]"
          >
            Convites recebidos
          </h2>

          {requestsLoading && (
            <p className="font-mono text-sm text-[#F5F5F5]/70">
              A carregar…
            </p>
          )}
          {!requestsLoading && requestsError && (
            <p className="text-xs text-[#D32F2F]" role="alert">
              {requestsError}
            </p>
          )}
          {!requestsLoading &&
            !requestsError &&
            incoming.length === 0 && (
              <p className="font-mono text-sm text-[#F5F5F5]/70">
                Não há pedidos pendentes.
              </p>
            )}

          {!requestsLoading && incoming.length > 0 && (
            <ul className="flex flex-col gap-2">
              {incoming.map((row) => (
                <li
                  key={row.requester_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 backdrop-blur-sm transition-all duration-300 hover:border-[#FFB300]/20 hover:shadow-lg hover:shadow-[#FFB300]/10"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[#F5F5F5]">
                    {row.username}
                  </span>
                  <button
                    type="button"
                    disabled={acceptingId === row.requester_id}
                    onClick={() => void handleAccept(row.requester_id)}
                    className="shrink-0 rounded-lg bg-[#FFB300]/20 px-3 py-1.5 text-sm font-medium text-[#FFB300] ring-1 ring-[#FFB300]/40 transition hover:bg-[#FFB300]/30 disabled:opacity-50"
                  >
                    {acceptingId === row.requester_id
                      ? 'A aceitar…'
                      : 'Aceitar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
