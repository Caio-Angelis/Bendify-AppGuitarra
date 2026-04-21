import { useEffect } from 'react'
import { useStore } from '../store/useStore'

/**
 * Conta segundos para a meta diária de 5 min (`dailyPracticeTime`) enquanto activo:
 * o `MainLayout` incrementa o tempo quando `activeTrackers` não está vazio.
 */
export function useChallengePracticeTracking(
  source: string,
  enabled: boolean = true,
) {
  const startTracking = useStore((s) => s.startTracking)
  const stopTracking = useStore((s) => s.stopTracking)

  useEffect(() => {
    if (!enabled) return
    startTracking(source)
    return () => {
      stopTracking(source)
    }
  }, [source, enabled, startTracking, stopTracking])
}
