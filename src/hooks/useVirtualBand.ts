import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Tone from 'tone'
import { useStore } from '../store/useStore'
import {
  VirtualBandEngine,
  type VirtualBandGenre,
  type VirtualBandChordUiEvent,
} from '../services/VirtualBandEngine'
import guitarDatabaseJson from '../data/guitarDatabase.json'
import type { GuitarDatabase } from '../types/guitarDatabase'

const guitarDatabase = guitarDatabaseJson as GuitarDatabase

const DEFAULT_GENRE: VirtualBandGenre = 'rock'
const DEFAULT_KEY = 'C'

export type UseVirtualBandState = {
  genre: VirtualBandGenre
  key: string
  isPlaying: boolean
  current: VirtualBandChordUiEvent | null
  availableGenres: VirtualBandGenre[]
}

export type UseVirtualBandApi = {
  setGenre: (g: VirtualBandGenre) => void
  setKey: (k: string) => void
  play: () => Promise<void>
  stop: () => void
}

export function useVirtualBand(): UseVirtualBandState & UseVirtualBandApi {
  const globalBpm = useStore((s) => s.globalBpm)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const setActiveChord = useStore((s) => s.setActiveChord)
  const startTracking = useStore((s) => s.startTracking)
  const stopTracking = useStore((s) => s.stopTracking)

  const [genre, setGenre] = useState<VirtualBandGenre>(DEFAULT_GENRE)
  const [key, setKey] = useState<string>(DEFAULT_KEY)
  const [current, setCurrent] = useState<VirtualBandChordUiEvent | null>(null)
  const [playingLocal, setPlayingLocal] = useState(false)

  const availableGenres = useMemo(() => {
    const uniq = new Set<VirtualBandGenre>()
    for (const p of guitarDatabase.progressions) {
      uniq.add(p.genre)
    }
    return [...uniq]
  }, [])

  useEffect(() => {
    const off = VirtualBandEngine.onChordChange((evt) => {
      setCurrent(evt)
      setActiveChord(evt.chordSymbol)
    })
    return () => off()
  }, [setActiveChord])

  useEffect(() => {
    if (!playingLocal) return
    VirtualBandEngine.setBpm(globalBpm)
  }, [globalBpm, playingLocal])

  useEffect(() => {
    const source = 'virtual_band'
    if (playingLocal) {
      startTracking(source)
      return () => stopTracking(source)
    }
    stopTracking(source)
  }, [playingLocal, startTracking, stopTracking])

  useEffect(() => {
    return () => {
      VirtualBandEngine.stopJam()
      setIsPlaying(false)
      stopTracking('virtual_band')
    }
  }, [setIsPlaying, stopTracking])

  const play = useCallback(async () => {
    await Tone.start()
    VirtualBandEngine.startJam({ genre, key, bpm: globalBpm })
    setIsPlaying(true)
    setPlayingLocal(true)
  }, [genre, key, globalBpm, setIsPlaying])

  const stop = useCallback(() => {
    VirtualBandEngine.stopJam()
    setIsPlaying(false)
    setPlayingLocal(false)
    setCurrent(null)
    setActiveChord('')
  }, [setIsPlaying, setActiveChord])

  return {
    genre,
    key,
    isPlaying: playingLocal,
    current,
    availableGenres,
    setGenre,
    setKey,
    play,
    stop,
  }
}

