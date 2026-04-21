import { createClient } from '@supabase/supabase-js'
import type { Database, Tables } from '../types/supabase'
import type { DataResult, SuccessResult } from '../types/results'
import type {
  EquippedInventoryRow,
  PendingIncomingFriendRow,
  PracticeLogsResult,
} from '../types/supabaseApi'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
  },
})

export type DailyRankingEntry = Pick<
  Tables<'daily_ranking'>,
  'user_id' | 'username' | 'streak_count'
>

export type ProfileSearchRow = Pick<Tables<'profiles'>, 'id' | 'username'>
type ProfileDisplayRow = Pick<Tables<'profiles'>, 'id' | 'username' | 'email'>

function hasUsableText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function looksLikeUserIdAlias(value: string, userId: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return true
  if (v === userId.slice(0, 8).toLowerCase()) return true
  return /^[0-9a-f]{8}$/.test(v)
}

function resolveRankingDisplayName(
  row: DailyRankingEntry,
  profile?: ProfileDisplayRow,
): string {
  const profileEmail = profile?.email?.trim() ?? ''
  if (hasUsableText(profileEmail)) {
    return profileEmail
  }

  const rowUsername = row.username?.trim() ?? ''
  if (hasUsableText(rowUsername) && rowUsername.includes('@')) {
    return rowUsername
  }

  if (looksLikeUserIdAlias(rowUsername, row.user_id)) {
    return 'email indisponível'
  }

  return rowUsername || 'email indisponível'
}

async function applyProfileDisplayNames(
  rows: DailyRankingEntry[],
): Promise<DailyRankingEntry[]> {
  if (rows.length === 0) {
    return rows
  }

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, email')
    .in('id', userIds)

  if (error) {
    return rows.map((row) => ({
      ...row,
      username: resolveRankingDisplayName(row),
    }))
  }

  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile] as const),
  )

  return rows.map((row) => ({
    ...row,
    username: resolveRankingDisplayName(row, profileById.get(row.user_id)),
  }))
}
export type ProfileEconomyRow = Pick<Tables<'profiles'>, 'level' | 'credits'>

/**
 * Lê nível/créditos do perfil para reconciliar economia local com o servidor.
 */
export async function fetchProfileEconomy(
  userId: string,
): Promise<DataResult<ProfileEconomyRow>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('level, credits')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  if (!data) {
    return { data: null, error: new Error('Perfil não encontrado.') }
  }
  return { data, error: null }
}

/**
 * Credita recompensa de conquista no servidor.
 * O valor final da UI deve sempre vir de `fetchProfileEconomy`.
 */
export async function awardAchievementCreditsOnDb(
  userId: string,
  amount: number,
): Promise<SuccessResult> {
  const reward = Math.floor(amount)
  if (!Number.isFinite(reward) || reward <= 0) {
    return { error: null }
  }

  const { data: profile, error: readError } = await fetchProfileEconomy(userId)
  if (readError || !profile) {
    return {
      error: readError ?? new Error('Falha ao carregar perfil para recompensa.'),
    }
  }

  const currentCredits =
    typeof profile.credits === 'number' && Number.isFinite(profile.credits)
      ? profile.credits
      : 0
  const nextCredits = currentCredits + reward

  const { error } = await supabase
    .from('profiles')
    .update({ credits: nextCredits })
    .eq('id', userId)

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Garante que `profiles.email` e `daily_ranking.username` (display) reflitam o email atual da sessão.
 */
export async function syncProfileIdentityFromSession(
  userId: string,
  email: string | undefined,
): Promise<SuccessResult> {
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  if (!normalizedEmail) {
    return { error: null }
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email: normalizedEmail,
    },
    { onConflict: 'id' },
  )
  if (profileError) {
    return { error: new Error(profileError.message) }
  }

  const { data: streakRow, error: streakReadError } = await supabase
    .from('daily_ranking')
    .select('streak_count')
    .eq('user_id', userId)
    .maybeSingle()

  if (streakReadError) {
    return { error: new Error(streakReadError.message) }
  }

  const nextStreak =
    typeof streakRow?.streak_count === 'number' &&
    Number.isFinite(streakRow.streak_count)
      ? streakRow.streak_count
      : 0

  const { error: rankingError } = await supabase.from('daily_ranking').upsert(
    {
      user_id: userId,
      username: normalizedEmail,
      streak_count: nextStreak,
    },
    { onConflict: 'user_id' },
  )
  if (rankingError) {
    return { error: new Error(rankingError.message) }
  }
  return { error: null }
}

/**
 * Busca o Top 50 do ranking diário (por `streak_count`).
 *
 * Regras de negócio: ordena desc e limita a 50 para UI (tabelas/leaderboard).
 *
 * @returns `data` com lista (ou `null` em erro) e `error` normalizado para `Error`.
 */
export async function fetchDailyRankingTop50(): Promise<
  DataResult<DailyRankingEntry[]>
> {
  const { data: rankingRows, error } = await supabase
    .from('daily_ranking')
    .select('user_id, username, streak_count')
    .order('streak_count', { ascending: false })
    .limit(50)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  const rows = (rankingRows ?? []).map((row) => ({
    user_id: row.user_id,
    username: row.username,
    streak_count: row.streak_count,
  }))
  const data = await applyProfileDisplayNames(rows)
  return { data, error: null }
}

/**
 * Busca ranking diário filtrado a um conjunto de utilizadores (ex.: amigos + o próprio).
 *
 * Regras de negócio: se a lista vier vazia, devolve `data: []` imediatamente para evitar
 * consulta com `.in(...)` vazia.
 *
 * @param userIds - Lista de `profiles.id`/`auth.users.id`.
 * @returns `data` com entradas (ou `null` em erro) e `error` normalizado.
 */
export async function fetchDailyRankingForUserIds(
  userIds: string[],
): Promise<DataResult<DailyRankingEntry[]>> {
  if (userIds.length === 0) {
    return { data: [], error: null }
  }
  const { data: rankingRows, error } = await supabase
    .from('daily_ranking')
    .select('user_id, username, streak_count')
    .in('user_id', userIds)
    .order('streak_count', { ascending: false })

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  const rows = (rankingRows ?? []).map((row) => ({
    user_id: row.user_id,
    username: row.username,
    streak_count: row.streak_count,
  }))
  const data = await applyProfileDisplayNames(rows)
  return { data, error: null }
}

/**
 * Pesquisa `profiles.username` por substring (ilike), excluindo o utilizador atual.
 *
 * Regras de negócio: trim do query; query vazio devolve lista vazia sem bater no servidor.
 *
 * @param query - Texto a pesquisar (substring).
 * @param excludeUserId - ID do utilizador atual (para não aparecer nos resultados).
 * @returns `data` com linhas (ou `null` em erro) e `error` normalizado.
 */
export async function searchProfilesByUsername(
  query: string,
  excludeUserId: string,
): Promise<DataResult<ProfileSearchRow[]>> {
  const q = query.trim()
  if (!q) {
    return { data: [], error: null }
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${q}%`)
    .neq('id', excludeUserId)
    .limit(30)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data ?? [], error: null }
}

/**
 * Cria um pedido de amizade (estado `pending`).
 *
 * Regras de negócio: grava na tabela `friendships` com `requester_id`, `recipient_id`
 * e `status = "pending"`.
 *
 * @param requesterId - ID do utilizador que envia o pedido.
 * @param recipientId - ID do utilizador que recebe o pedido.
 * @returns Resultado com `error` normalizado.
 */
export async function sendFriendRequest(
  requesterId: string,
  recipientId: string,
): Promise<SuccessResult> {
  const { error } = await supabase.from('friendships').insert({
    requester_id: requesterId,
    recipient_id: recipientId,
    status: 'pending',
  })

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Lista pedidos de amizade pendentes recebidos pelo utilizador.
 *
 * Regras de negócio: busca `friendships` pendentes, depois resolve usernames via `profiles`
 * para exibir na UI. Se não houver pedidos, devolve lista vazia.
 *
 * @param recipientUserId - ID do utilizador (destinatário).
 * @returns `data` com lista (ou `null` em erro) e `error` normalizado.
 */
export async function fetchPendingIncomingFriendRequests(
  recipientUserId: string,
): Promise<DataResult<PendingIncomingFriendRow[]>> {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('requester_id')
    .eq('recipient_id', recipientUserId)
    .eq('status', 'pending')

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  const requesterIds = (rows ?? [])
    .map((r) => r.requester_id)
    .filter((id): id is string => id != null)
  if (requesterIds.length === 0) {
    return { data: [], error: null }
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', requesterIds)

  if (pErr) {
    return { data: null, error: new Error(pErr.message) }
  }
  const usernameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.username ?? ''] as const),
  )
  return {
    data: requesterIds.map((id) => ({
      requester_id: id,
      username: usernameById.get(id) || id.slice(0, 8),
    })),
    error: null,
  }
}

/**
 * Aceita um pedido de amizade pendente.
 *
 * Regras de negócio: transiciona `friendships.status` de `pending` para `accepted`
 * filtrando por requester/recipient para evitar atualizar relações erradas.
 *
 * @param requesterId - ID de quem enviou o pedido.
 * @param recipientId - ID de quem recebe/aceita.
 * @returns Resultado com `error` normalizado.
 */
export async function acceptFriendRequest(
  requesterId: string,
  recipientId: string,
): Promise<SuccessResult> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)
    .eq('recipient_id', recipientId)
    .eq('status', 'pending')

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/** IDs de amigos com pedido aceite (exclui o próprio utilizador). */
export async function fetchAcceptedFriendUserIds(
  currentUserId: string,
): Promise<DataResult<string[]>> {
  const [{ data: asRequester, error: e1 }, { data: asRecipient, error: e2 }] =
    await Promise.all([
      supabase
        .from('friendships')
        .select('recipient_id')
        .eq('requester_id', currentUserId)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('requester_id')
        .eq('recipient_id', currentUserId)
        .eq('status', 'accepted'),
    ])

  if (e1) {
    return { data: null, error: new Error(e1.message) }
  }
  if (e2) {
    return { data: null, error: new Error(e2.message) }
  }

  const ids = new Set<string>()
  for (const r of asRequester ?? []) {
    const id = r.recipient_id
    if (id) ids.add(id)
  }
  for (const r of asRecipient ?? []) {
    const id = r.requester_id
    if (id) ids.add(id)
  }
  return { data: Array.from(ids), error: null }
}

/**
 * Lê `streak_count` do utilizador em `daily_ranking`.
 *
 * Regras de negócio: em erro ou ausência de linha, devolve `0` (UI não deve quebrar).
 *
 * @param userId - ID do utilizador.
 * @returns Streak (inteiro) ou `0`.
 */
export async function fetchUserStreak(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('daily_ranking')
    .select('streak_count')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || data == null) {
    return 0
  }
  const n = data.streak_count
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/**
 * Cria/atualiza a linha do utilizador em `daily_ranking`.
 *
 * Regras de negócio: usa UPSERT com `onConflict: user_id` para manter uma linha por utilizador.
 *
 * @param userId - ID do utilizador.
 * @param username - Nome público (para display no ranking).
 * @param streak - Streak atual.
 * @returns Resultado com `error` normalizado.
 */
export async function upsertDailyStreak(
  userId: string,
  username: string,
  streak: number,
): Promise<SuccessResult> {
  const { error } = await supabase.from('daily_ranking').upsert(
    { user_id: userId, username, streak_count: streak },
    { onConflict: 'user_id' },
  )

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Devolve a data civil local no formato `YYYY-MM-DD`.
 *
 * Regras de negócio: é o formato usado pela app para chaves de dia (prática, tentativas, etc).
 *
 * @param d - Data base (default: agora).
 * @returns String ISO curta `YYYY-MM-DD` (timezone local).
 */
export function toLocalDateIso(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizePracticeDate(raw: string): string {
  if (raw.length >= 10) return raw.slice(0, 10)
  return raw
}

export async function logDailyPractice(
  userId: string,
  date: string,
): Promise<SuccessResult> {
  const { error } = await supabase.from('practice_logs').upsert(
    { user_id: userId, practice_date: date },
    { onConflict: 'user_id, practice_date' },
  )

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Lê os dias (civis) em que houve prática para o utilizador.
 *
 * Regras de negócio: devolve um array de datas normalizadas para `YYYY-MM-DD`
 * (compatível com os componentes da app). `averageMinutes` fica reservado para futura métrica.
 *
 * @param userId - ID do utilizador.
 * @returns `data` com datas (ou `null` em erro), `averageMinutes` e `error` normalizado.
 */
export async function fetchPracticeLogs(userId: string): Promise<PracticeLogsResult> {
  const { data, error } = await supabase
    .from('practice_logs')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    return { data: null, averageMinutes: null, error: new Error(error.message) }
  }
  const rows = data ?? []
  const dates = rows.map((row) =>
    normalizePracticeDate(String(row.practice_date)),
  )
  return { data: dates, averageMinutes: null, error: null }
}

/**
 * Envia feedback do utilizador.
 *
 * Regras de negócio: a mensagem é trimada e persistida em `feedback`.
 *
 * @param userId - ID do utilizador.
 * @param email - Email para contacto/identificação.
 * @param message - Conteúdo do feedback.
 * @returns Union discriminada: `success: true` ou `success: false` com `Error`.
 */
export async function submitFeedback(
  userId: string,
  email: string,
  message: string,
): Promise<{ success: true } | { success: false; error: Error }> {
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    email,
    message: message.trim(),
  })

  if (error) {
    return { success: false, error: new Error(error.message) }
  }
  return { success: true }
}

// --- Guildas / Bandas (`teams`, `team_members`) ---

export type TeamRow = Tables<'teams'>

export type UserTeamResult = {
  team: Tables<'teams'> | null
  role: string | null
}

/** Membro de uma banda com username vindo de `profiles`. */
export type TeamMemberWithUsername = {
  user_id: string
  role: string
  username: string | null
}

/**
 * Cria uma banda/equipa e coloca o criador como `leader`.
 *
 * Regras de negócio: cria em `teams` e depois insere em `team_members` com role `leader`.
 *
 * @param name - Nome da banda.
 * @param description - Descrição (opcional; vazio vira `null`).
 * @param userId - ID do líder/criador.
 * @returns `data` com a banda criada (ou `null` em erro) e `error` normalizado.
 */
export async function createTeam(
  name: string,
  description: string,
  userId: string,
): Promise<{ data: TeamRow | null; error: Error | null }> {
  const trimmedName = name.trim()
  const trimmedDesc = description.trim()
  const { data: inserted, error: e1 } = await supabase
    .from('teams')
    .insert({
      name: trimmedName,
      description: trimmedDesc || null,
      leader_id: userId,
    })
    .select('id, name, description, leader_id, created_at')
    .single()

  if (e1 || !inserted) {
    return { data: null, error: new Error(e1?.message ?? 'Falha ao criar banda') }
  }

  const team = inserted
  const { error: e2 } = await supabase.from('team_members').insert({
    team_id: team.id,
    user_id: userId,
    role: 'leader',
  })

  if (e2) {
    return { data: null, error: new Error(e2.message) }
  }
  return { data: team, error: null }
}

/**
 * Entra numa banda/equipa como `member`.
 *
 * @param teamId - ID da banda.
 * @param userId - ID do utilizador.
 * @returns Resultado com `error` normalizado.
 */
export async function joinTeam(
  teamId: string,
  userId: string,
): Promise<SuccessResult> {
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: userId,
    role: 'member',
  })

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Sai de uma banda/equipa.
 *
 * Regras de negócio: remove a linha correspondente em `team_members`.
 *
 * @param teamId - ID da banda.
 * @param userId - ID do utilizador.
 * @returns Resultado com `error` normalizado.
 */
export async function leaveTeam(
  teamId: string,
  userId: string,
): Promise<SuccessResult> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Busca a banda (se existir) do utilizador e o papel (`role`) em `team_members`.
 *
 * @param userId - ID do utilizador.
 * @returns `data` com `{ team, role }` (ou `null` em erro) e `error` normalizado.
 */
export async function fetchUserTeam(
  userId: string,
): Promise<{ data: UserTeamResult | null; error: Error | null }> {
  const { data: row, error } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  if (!row) {
    return { data: { team: null, role: null }, error: null }
  }

  const { data: team, error: tErr } = await supabase
    .from('teams')
    .select('id, name, description, leader_id, created_at')
    .eq('id', row.team_id)
    .single()

  if (tErr || !team) {
    return { data: null, error: new Error(tErr?.message ?? 'Banda não encontrada') }
  }
  return {
    data: {
      team,
      role: row.role,
    },
    error: null,
  }
}

/**
 * Lista todas as bandas/equipas ordenadas por nome.
 *
 * @returns `data` com lista (ou `null` em erro) e `error` normalizado.
 */
export async function fetchAllTeams(): Promise<DataResult<TeamRow[]>> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, description, leader_id, created_at')
    .order('name', { ascending: true })

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data ?? [], error: null }
}

/**
 * Lista membros de uma banda e resolve o username via `profiles`.
 *
 * Regras de negócio: busca `team_members` e depois faz um IN em `profiles` para
 * obter usernames (quando disponíveis).
 *
 * @param teamId - ID da banda.
 * @returns `data` com membros (ou `null` em erro) e `error` normalizado.
 */
export async function fetchTeamMembers(
  teamId: string,
): Promise<DataResult<TeamMemberWithUsername[]>> {
  const { data: rows, error } = await supabase
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  const list = rows ?? []
  const userIds = list.map((r) => r.user_id)
  if (userIds.length === 0) {
    return { data: [], error: null }
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  if (pErr) {
    return { data: null, error: new Error(pErr.message) }
  }
  const usernameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.username] as const),
  )
  return {
    data: list.map((r) => ({
      user_id: r.user_id,
      role: r.role ?? '',
      username: usernameById.get(r.user_id) ?? null,
    })),
    error: null,
  }
}

export type BandRankingRow = {
  rank: number
  team: Tables<'teams'>
  /** Soma dos `streak_count` em `daily_ranking` dos membros actuais (ausência de linha conta como 0). */
  totalStreak: number
}

/**
 * Ranking de bandas: para cada equipa, soma os `streak_count` de `daily_ranking`
 * para todos os `user_id` actuais em `team_members`.
 */
export async function fetchBandTeamRanking(): Promise<{
  data: BandRankingRow[] | null
  error: Error | null
}> {
  const { data: teams, error: e1 } = await fetchAllTeams()
  if (e1) {
    return { data: null, error: e1 }
  }
  if (!teams || teams.length === 0) {
    return { data: [], error: null }
  }

  const memberLists: { team: Tables<'teams'>; userIds: string[] }[] = []
  for (const t of teams) {
    const { data: members, error: mErr } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', t.id)
    if (mErr) {
      return { data: null, error: new Error(mErr.message) }
    }
    memberLists.push({
      team: t,
      userIds: (members ?? []).map((m) => m.user_id),
    })
  }

  const allIds = [...new Set(memberLists.flatMap((m) => m.userIds))]
  const { data: rankings, error: e2 } = await fetchDailyRankingForUserIds(allIds)
  if (e2) {
    return { data: null, error: e2 }
  }
  const streakByUser = new Map<string, number>()
  for (const r of rankings ?? []) {
    streakByUser.set(r.user_id, r.streak_count)
  }

  const scored = memberLists.map(({ team, userIds }) => {
    const totalStreak = userIds.reduce(
      (sum, uid) => sum + (streakByUser.get(uid) ?? 0),
      0,
    )
    return { team, totalStreak }
  })
  scored.sort((a, b) => b.totalStreak - a.totalStreak)
  const data: BandRankingRow[] = scored.map((s, i) => ({
    rank: i + 1,
    team: s.team,
    totalStreak: s.totalStreak,
  }))
  return { data, error: null }
}

// --- Conquistas (`user_achievements`) ---

export type UserAchievementRow = Pick<
  Tables<'user_achievements'>,
  'achievement_id' | 'unlocked_at'
>

/**
 * Insere um desbloqueio. Devolve `true` se a linha foi criada (conquista nova).
 * Chave duplicada (23505) ou equivalente → `false` sem propagar erro.
 */
export async function unlockAchievement(
  userId: string,
  achievementId: string,
): Promise<boolean> {
  const { error } = await supabase.from('user_achievements').insert({
    user_id: userId,
    achievement_id: achievementId,
    unlocked_at: new Date().toISOString(),
  })

  if (!error) return true

  const code = (error as { code?: string }).code
  const msg = error.message ?? ''
  if (code === '23505' || /duplicate key/i.test(msg)) {
    return false
  }
  console.error('unlockAchievement', error)
  return false
}

/**
 * Lê itens equipados e resolve o `type` do item (para mapear para slots no cliente).
 *
 * Regras de negócio: `user_inventory` contém `item_id`; o tipo vem de `shop_items.type`.
 * Devolve uma lista com `{ item_id, type }` para o store preencher `equippedItems`.
 *
 * @param userId - ID do utilizador.
 * @returns `data` com linhas (ou `null` em erro) e `error` normalizado.
 */
export async function fetchEquippedInventoryRows(
  userId: string,
): Promise<DataResult<EquippedInventoryRow[]>> {
  const { data: rows, error: e1 } = await supabase
    .from('user_inventory')
    .select('item_id')
    .eq('user_id', userId)
    .eq('equipped', true)

  if (e1) {
    return { data: null, error: new Error(e1.message) }
  }
  const itemIds = (rows ?? []).map((r) => r.item_id)
  if (itemIds.length === 0) {
    return { data: [], error: null }
  }

  const { data: items, error: e2 } = await supabase
    .from('shop_items')
    .select('id, type')
    .in('id', itemIds)

  if (e2) {
    return { data: null, error: new Error(e2.message) }
  }
  const typeById = new Map(
    (items ?? []).map((i) => [i.id, String(i.type ?? '')] as const),
  )
  const data = itemIds.map((item_id) => ({
    item_id,
    type: typeById.get(item_id) ?? '',
  }))
  return { data, error: null }
}

/**
 * Equipa um item no servidor (desmarca outros do mesmo tipo conforme a RPC).
 * Parâmetros SQL: `p_item_id`, `p_user_id`.
 */
export async function equipItemOnDb(
  itemId: string,
  userId: string,
): Promise<SuccessResult> {
  const { error } = await supabase.rpc('equip_user_item', {
    p_item_id: itemId,
    p_user_id: userId,
  })
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/** Linhas agregadas: `user_inventory` + `type` de `shop_items` (quantidade normalizada). */
export type UserInventoryRow = Pick<Tables<'user_inventory'>, 'item_id'> & {
  quantity: number
  type: string
}

/** Linhas de `user_inventory` com `quantity` e tipo vindo de `shop_items`. */
export async function fetchUserInventoryWithTypes(
  userId: string,
): Promise<DataResult<UserInventoryRow[]>> {
  const { data: rows, error: e1 } = await supabase
    .from('user_inventory')
    .select('item_id, quantity')
    .eq('user_id', userId)

  if (e1) {
    return { data: null, error: new Error(e1.message) }
  }
  const list = rows ?? []
  if (list.length === 0) {
    return { data: [], error: null }
  }

  const itemIds = list.map((r) => r.item_id)
  const { data: items, error: e2 } = await supabase
    .from('shop_items')
    .select('id, type')
    .in('id', itemIds)

  if (e2) {
    return { data: null, error: new Error(e2.message) }
  }
  const typeById = new Map(
    (items ?? []).map((i) => [i.id, String(i.type ?? '')] as const),
  )
  const data: UserInventoryRow[] = list.map((r) => {
    const q = r.quantity
    const quantity =
      typeof q === 'number' && Number.isFinite(q) && q > 0 ? Math.floor(q) : 1
    return {
      item_id: r.item_id,
      quantity,
      type: typeById.get(r.item_id) ?? '',
    }
  })
  return { data, error: null }
}

/**
 * Incrementa (UPSERT) a quantidade de um item no inventário no servidor.
 * Parâmetro SQL: `p_item_id`.
 */
export async function purchaseUserItemOnDb(
  itemId: string,
): Promise<SuccessResult> {
  const { error } = await supabase.rpc('purchase_user_item', {
    p_item_id: itemId,
  })
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

/**
 * Consome uma unidade de inventário (ex.: Escudo de Ofensiva).
 * Parâmetros SQL: `p_item_type`, `p_user_id`.
 */
export async function consumeUserItemOnDb(
  itemType: string,
  userId: string,
): Promise<SuccessResult> {
  const { error } = await supabase.rpc('consume_user_item', {
    p_item_type: itemType,
    p_user_id: userId,
  })
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export async function fetchUserAchievements(
  userId: string,
): Promise<DataResult<UserAchievementRow[]>> {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data ?? [], error: null }
}
