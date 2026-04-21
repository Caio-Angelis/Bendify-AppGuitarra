import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  createTeam,
  fetchAllTeams,
  fetchBandTeamRanking,
  fetchTeamMembers,
  fetchUserTeam,
  joinTeam,
  leaveTeam,
  type BandRankingRow,
  type TeamMemberWithUsername,
  type TeamRow,
} from '../utils/supabase'

const TEAM_CREATE_COST = 500

type NoTeamTab = 'create' | 'search'

export default function Teams() {
  const session = useStore((s) => s.session)
  const spendCredits = useStore((s) => s.spendCredits)
  const addCredits = useStore((s) => s.addCredits)
  const credits = useStore((s) => s.userStats.credits)

  const userId = session?.user?.id ?? ''

  const [loadingTeam, setLoadingTeam] = useState(true)
  const [userTeam, setUserTeam] = useState<TeamRow | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const [noTeamTab, setNoTeamTab] = useState<NoTeamTab>('create')
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [teamsList, setTeamsList] = useState<TeamRow[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamsError, setTeamsError] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [members, setMembers] = useState<TeamMemberWithUsername[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)

  const [ranking, setRanking] = useState<BandRankingRow[]>([])
  const [rankingLoading, setRankingLoading] = useState(true)
  const [rankingError, setRankingError] = useState<string | null>(null)

  const loadUserTeam = useCallback(async () => {
    if (!userId) return
    setLoadingTeam(true)
    const { data, error } = await fetchUserTeam(userId)
    if (error) {
      setUserTeam(null)
      setUserRole(null)
    } else {
      setUserTeam(data?.team ?? null)
      setUserRole(data?.role ?? null)
    }
    setLoadingTeam(false)
  }, [userId])

  const loadRanking = useCallback(async () => {
    setRankingLoading(true)
    setRankingError(null)
    const { data, error } = await fetchBandTeamRanking()
    if (error) {
      setRankingError(error.message)
      setRanking([])
    } else {
      setRanking(data ?? [])
    }
    setRankingLoading(false)
  }, [])

  const loadTeamsForSearch = useCallback(async () => {
    setTeamsLoading(true)
    setTeamsError(null)
    const { data, error } = await fetchAllTeams()
    if (error) {
      setTeamsError(error.message)
      setTeamsList([])
    } else {
      setTeamsList(data ?? [])
    }
    setTeamsLoading(false)
  }, [])

  const loadMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true)
    const { data, error } = await fetchTeamMembers(teamId)
    if (error) {
      setMembers([])
    } else {
      setMembers(data ?? [])
    }
    setMembersLoading(false)
  }, [])

  useEffect(() => {
    if (!userId) return
    void loadUserTeam()
    void loadRanking()
  }, [userId, loadUserTeam, loadRanking])

  useEffect(() => {
    if (!userId || !userTeam) return
    void loadMembers(userTeam.id)
  }, [userId, userTeam, loadMembers])

  useEffect(() => {
    if (!userId || userTeam || noTeamTab !== 'search') return
    void loadTeamsForSearch()
  }, [userId, userTeam, noTeamTab, loadTeamsForSearch])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setCreateError(null)
    const name = createName.trim()
    if (!name) {
      setCreateError('Indique o nome da banda.')
      return
    }
    if (!spendCredits(TEAM_CREATE_COST)) {
      setCreateError(
        `Saldo insuficiente. São necessários ${TEAM_CREATE_COST} créditos (tem ${credits}).`,
      )
      return
    }
    setCreateBusy(true)
    const { data, error } = await createTeam(name, createDesc, userId)
    if (error) {
      addCredits(TEAM_CREATE_COST)
      setCreateError(error.message)
      setCreateBusy(false)
      return
    }
    if (data) {
      setUserTeam(data)
      setUserRole('leader')
      setCreateName('')
      setCreateDesc('')
    }
    setCreateBusy(false)
    void loadRanking()
  }

  async function handleJoin(teamId: string) {
    if (!userId) return
    setJoinError(null)
    setJoiningId(teamId)
    const { error } = await joinTeam(teamId, userId)
    setJoiningId(null)
    if (error) {
      setJoinError(error.message)
      return
    }
    void loadUserTeam()
    void loadRanking()
  }

  async function handleLeave() {
    if (!userId || !userTeam) return
    setLeaveBusy(true)
    const { error } = await leaveTeam(userTeam.id, userId)
    setLeaveBusy(false)
    if (!error) {
      setUserTeam(null)
      setUserRole(null)
      setMembers([])
      void loadRanking()
    }
  }

  const tabBtn = (id: NoTeamTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setNoTeamTab(id)
        setCreateError(null)
        setJoinError(null)
      }}
      className={[
        'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
        noTeamTab === id
          ? 'bg-[#FFB300]/15 text-[#FFB300] ring-1 ring-[#FFB300]/50'
          : 'text-gray-400 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  )

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-[#F5F5F5]/70">
          Inicie sessão para gerir bandas.
        </p>
      </div>
    )
  }

  if (loadingTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="font-mono text-sm text-[#F5F5F5]/70">A carregar…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-[#F5F5F5]">
        Bandas
      </h1>
      <p className="mb-8 text-sm text-[#F5F5F5]/65">
        Forme uma banda, junte-se a outras e veja o ranking da “batalha” pela
        soma dos streaks dos membros.
      </p>

      <section
        className="mb-10 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
        aria-labelledby="band-ranking-heading"
      >
        <h2
          id="band-ranking-heading"
          className="mb-4 text-lg font-semibold text-[#FFB300]"
        >
          Ranking de Bandas
        </h2>
        <p className="mb-4 text-xs text-[#F5F5F5]/55">
          Pontuação = soma dos <span className="font-mono">streak_count</span> em{' '}
          <span className="font-mono">daily_ranking</span> de todos os membros
          actuais.
        </p>
        {rankingLoading ? (
          <p className="text-sm text-[#F5F5F5]/60">A carregar ranking…</p>
        ) : rankingError ? (
          <p className="text-sm text-red-400/90">{rankingError}</p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-[#F5F5F5]/60">
            Ainda não há bandas no ranking.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ranking.map((row) => (
              <li
                key={row.team.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 backdrop-blur-sm transition-all duration-300 hover:border-[#FFB300]/20 hover:shadow-lg hover:shadow-[#FFB300]/10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold text-[#FFB300]">
                    {row.rank}º
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#F5F5F5]">
                      {row.team.name}
                    </p>
                    {row.team.description ? (
                      <p className="truncate text-xs text-[#F5F5F5]/50">
                        {row.team.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-semibold text-[#FFB300]">
                  {row.totalStreak} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!userTeam ? (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {tabBtn('create', 'Criar Banda')}
            {tabBtn('search', 'Buscar Bandas')}
          </div>

          {noTeamTab === 'create' ? (
            <form
              onSubmit={handleCreate}
              className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <p className="mb-4 text-sm text-[#F5F5F5]/75">
                Criar uma banda custa{' '}
                <strong className="text-[#FFB300]">
                  {TEAM_CREATE_COST} créditos
                </strong>
                . O saldo é validado antes de criar; se a operação falhar no
                servidor, os créditos são repostos.
              </p>
              <div className="mb-4">
                <label
                  htmlFor="team-name"
                  className="mb-1 block text-xs font-medium text-[#F5F5F5]/70"
                >
                  Nome
                </label>
                <input
                  id="team-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2 text-sm text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-2 focus:ring-[#FFB300]/25"
                  placeholder="Ex.: Os Trastes Dourados"
                  maxLength={120}
                  autoComplete="off"
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="team-desc"
                  className="mb-1 block text-xs font-medium text-[#F5F5F5]/70"
                >
                  Descrição (opcional)
                </label>
                <textarea
                  id="team-desc"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2 text-sm text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-2 focus:ring-[#FFB300]/25"
                  placeholder="Breve apresentação da banda"
                  maxLength={500}
                />
              </div>
              {createError ? (
                <p className="mb-3 text-sm text-red-400/90">{createError}</p>
              ) : null}
              <button
                type="submit"
                disabled={
                  createBusy || credits < TEAM_CREATE_COST || !createName.trim()
                }
                className="rounded-lg bg-[#FFB300] px-4 py-2 text-sm font-semibold text-black transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createBusy ? 'A criar…' : `Criar (${TEAM_CREATE_COST} créditos)`}
              </button>
              {credits < TEAM_CREATE_COST ? (
                <p className="mt-2 text-xs text-[#F5F5F5]/50">
                  Saldo actual: {credits} — junte créditos na Loja ou actividades
                  para criar uma banda.
                </p>
              ) : null}
            </form>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              {teamsLoading ? (
                <p className="text-sm text-[#F5F5F5]/60">
                  A carregar bandas…
                </p>
              ) : teamsError ? (
                <p className="text-sm text-red-400/90">{teamsError}</p>
              ) : teamsList.length === 0 ? (
                <p className="text-sm text-[#F5F5F5]/60">
                  Nenhuma banda disponível. Crie a primeira no separador
                  anterior.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {joinError ? (
                    <p className="text-sm text-red-400/90">{joinError}</p>
                  ) : null}
                  {teamsList.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-3 backdrop-blur-sm transition-all duration-300 hover:border-[#FFB300]/20 hover:shadow-lg hover:shadow-[#FFB300]/10"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#F5F5F5]">{t.name}</p>
                        {t.description ? (
                          <p className="text-xs text-[#F5F5F5]/55">
                            {t.description}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleJoin(t.id)}
                        disabled={joiningId === t.id}
                        className="shrink-0 rounded-lg border border-[#FFB300]/50 bg-[#FFB300]/10 px-3 py-1.5 text-sm font-medium text-[#FFB300] transition hover:bg-[#FFB300]/20 disabled:opacity-50"
                      >
                        {joiningId === t.id ? 'A entrar…' : 'Entrar'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="mb-1 text-lg font-semibold text-[#FFB300]">
            Painel da Banda
          </h2>
          <p className="mb-1 text-xl font-bold text-[#F5F5F5]">{userTeam.name}</p>
          {userTeam.description ? (
            <p className="mb-6 text-sm text-[#F5F5F5]/70">
              {userTeam.description}
            </p>
          ) : (
            <p className="mb-6 text-sm italic text-[#F5F5F5]/45">
              Sem descrição.
            </p>
          )}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/50">
            Membros
            {userRole ? (
              <span className="ml-2 font-normal normal-case text-[#F5F5F5]/40">
                (o seu papel: {userRole})
              </span>
            ) : null}
          </p>
          {membersLoading ? (
            <p className="text-sm text-[#F5F5F5]/60">A carregar membros…</p>
          ) : (
            <ul className="mb-6 flex flex-col gap-2">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2 text-sm backdrop-blur-sm"
                >
                  <span className="truncate text-[#F5F5F5]">
                    {m.username ?? m.user_id}
                  </span>
                  <span className="shrink-0 text-xs text-[#FFB300]/90">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leaveBusy}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {leaveBusy ? 'A sair…' : 'Sair da Banda'}
          </button>
        </section>
      )}
    </div>
  )
}
