import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { useStore } from '../store/useStore'
import {
  applyToneOutputDevice,
  getPreferredOutputId,
  supportsAudioOutputSelection,
} from '../utils/audioDevicePreferences'
import type { Track } from '../store/useStore'

/** Resolves track URLs for Vite base path and Electron file:// (avoids absolute "/..."). */
function resolveTrackMediaUrl(src: string): string {
  const t = src.trim()
  if (/^https?:\/\//i.test(t)) return t
  const rel = t.replace(/^\/+/, '').replace(/^public\//, '')
  if (typeof window === 'undefined') {
    const base = import.meta.env.BASE_URL
    const prefix = base.endsWith('/') ? base : `${base}/`
    return `${prefix}${rel}`
  }
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(rel, baseUrl).href
}

export function useAudioPlayer() {
  const currentTrack = useStore((s) => s.currentTrack)
  const isPlaying = useStore((s) => s.isPlaying)
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const setActiveChord = useStore((s) => s.setActiveChord)

  const playerRef = useRef<Tone.Player | null>(null)
  const rafRef = useRef(0)
  const chordIndexRef = useRef(0)
  const wallStartRef = useRef(0)
  const segmentBufferOffsetRef = useRef(0)
  const durationRef = useRef(0)

  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [isBufferReady, setIsBufferReady] = useState(false)

  const applyChordForPosition = useCallback(
    (track: Track, pos: number) => {
      const chords = track.chords
      if (!chords.length) {
        setActiveChord('')
        return
      }
      let i = chordIndexRef.current
      while (i + 1 < chords.length && pos >= chords[i + 1].time) {
        i++
      }
      while (i > 0 && pos < chords[i].time) {
        i--
      }
      const prevI = chordIndexRef.current
      chordIndexRef.current = i
      if (i !== prevI && chords[i]) {
        setActiveChord(chords[i].chord)
      }
    },
    [setActiveChord],
  )

  useEffect(() => {
    chordIndexRef.current = 0
    segmentBufferOffsetRef.current = 0
    wallStartRef.current = 0
    setPositionSec(0)
    setDurationSec(0)
    durationRef.current = 0
    setIsBufferReady(false)
    setActiveChord('')

    if (!currentTrack) {
      return
    }

    const chords = currentTrack.chords
    if (chords[0]) {
      setActiveChord(chords[0].chord)
    }

    let disposed = false
    const player = new Tone.Player({
      url: resolveTrackMediaUrl(currentTrack.audio_path),
      onload: () => {
        if (disposed || !playerRef.current) return
        const d = player.buffer.duration
        durationRef.current = d
        setDurationSec(d)
        setIsBufferReady(player.loaded)
      },
      onerror: () => {
        if (!disposed) {
          setIsBufferReady(false)
          durationRef.current = 0
          setDurationSec(0)
        }
      },
    }).toDestination()

    playerRef.current = player

    return () => {
      disposed = true
      cancelAnimationFrame(rafRef.current)
      setIsPlaying(false)
      try {
        player.stop()
        player.dispose()
      } catch {
        /* ignore */
      }
      playerRef.current = null
      setActiveChord('')
    }
  }, [currentTrack, setActiveChord, setIsPlaying])

  useEffect(() => {
    if (!isPlaying || !currentTrack || !playerRef.current?.loaded) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = () => {
      const player = playerRef.current
      if (!player?.loaded || !currentTrack) {
        return
      }

      const pos =
        segmentBufferOffsetRef.current + (Tone.now() - wallStartRef.current)
      setPositionSec(pos)

      const dur = durationRef.current
      if (dur > 0 && pos >= dur - 0.02) {
        player.stop()
        segmentBufferOffsetRef.current = 0
        wallStartRef.current = 0
        chordIndexRef.current = 0
        setPositionSec(0)
        setIsPlaying(false)
        const ch = currentTrack.chords[0]
        if (ch) setActiveChord(ch.chord)
        return
      }

      applyChordForPosition(currentTrack, pos)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [
    isPlaying,
    currentTrack,
    applyChordForPosition,
    setActiveChord,
    setIsPlaying,
  ])

  const togglePlay = useCallback(async () => {
    await Tone.start()
    if (supportsAudioOutputSelection()) {
      const out = getPreferredOutputId()
      if (out) {
        try {
          await applyToneOutputDevice(out)
        } catch {
          /* ignore */
        }
      }
    }
    const player = playerRef.current
    const track = useStore.getState().currentTrack
    if (!player || !track || !player.loaded) return

    if (useStore.getState().isPlaying) {
      segmentBufferOffsetRef.current +=
        Tone.now() - wallStartRef.current
      player.stop()
      setIsPlaying(false)
      setPositionSec(segmentBufferOffsetRef.current)
    } else {
      wallStartRef.current = Tone.now()
      player.start(Tone.now(), segmentBufferOffsetRef.current)
      setIsPlaying(true)
    }
  }, [setIsPlaying])

  const stop = useCallback(() => {
    const player = playerRef.current
    const track = useStore.getState().currentTrack
    if (player?.loaded) {
      player.stop()
    }
    segmentBufferOffsetRef.current = 0
    wallStartRef.current = 0
    chordIndexRef.current = 0
    setPositionSec(0)
    setIsPlaying(false)
    if (track?.chords[0]) {
      setActiveChord(track.chords[0].chord)
    } else {
      setActiveChord('')
    }
  }, [setActiveChord, setIsPlaying])

  return {
    positionSec,
    durationSec,
    isBufferReady,
    togglePlay,
    stop,
  }
}
