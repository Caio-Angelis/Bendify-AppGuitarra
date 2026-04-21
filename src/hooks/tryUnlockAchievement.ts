import { getAchievementById } from '../data/achievements'
import { useStore } from '../store/useStore'
import { awardAchievementCreditsOnDb, unlockAchievement } from '../utils/supabase'

/**
 * Tenta desbloquear uma conquista no Supabase. Se for a primeira vez,
 * credita a recompensa no Zustand e mostra toast global.
 */
export async function tryUnlockAchievement(
  userId: string | undefined,
  achievementId: string,
): Promise<void> {
  if (!userId) return
  const def = getAchievementById(achievementId)
  if (!def) return

  const isNew = await unlockAchievement(userId, achievementId)
  if (!isNew) return

  const { error } = await awardAchievementCreditsOnDb(userId, def.reward)
  if (error) {
    console.warn('awardAchievementCreditsOnDb', error.message)
  }

  await useStore.getState().syncProfileEconomyFromDb()
  useStore
    .getState()
    .showGlobalToast(`Conquista desbloqueada: ${def.name} (+${def.reward} créditos)`)
}
