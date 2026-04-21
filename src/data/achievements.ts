/**
 * Dicionário estático de conquistas (IDs alinhados a `user_achievements.achievement_id`).
 */
export type AchievementIconName =
  | 'Zap'
  | 'ShoppingBag'
  | 'MessageSquare'

export type AchievementDef = {
  id: string
  name: string
  description: string
  /** Créditos concedidos na primeira desbloqueagem (cliente + Supabase). */
  reward: number
  icon: AchievementIconName
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'scale_speed_100',
    name: 'Speed Demon',
    description: 'Complete o Scale Runner em 100 BPM',
    reward: 200,
    icon: 'Zap',
  },
  {
    id: 'first_purchase',
    name: 'Consumista',
    description: 'Compre seu primeiro item na Loja',
    reward: 50,
    icon: 'ShoppingBag',
  },
  {
    id: 'feedback_sent',
    name: 'Voz da comunidade',
    description: 'Envie um feedback pela página de Contato',
    reward: 30,
    icon: 'MessageSquare',
  },
] as const

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function getAchievementById(id: string): AchievementDef | undefined {
  return byId.get(id)
}
