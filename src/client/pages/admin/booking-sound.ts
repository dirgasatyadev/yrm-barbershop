import { useCallback, useEffect, useRef, useState } from 'react'
import doorbellUrl from '../../assets/booking-doorbell.mp3?url'

const preferenceKey = 'yrm-booking-sound-muted'

function isMuted() {
  try { return localStorage.getItem(preferenceKey) === 'true' }
  catch { return false }
}

export function useBookingSound() {
  const [muted, setMuted] = useState(isMuted)
  const [ready, setReady] = useState(false)
  const context = useRef<AudioContext | null>(null)
  const doorbell = useRef<Promise<AudioBuffer> | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const playback = useRef(0)
  const supported = typeof window.AudioContext === 'function'
  const active = ready && !muted

  const loadDoorbell = useCallback((audio: AudioContext) => {
    if (!doorbell.current) {
      const loading = fetch(doorbellUrl).then((response) => {
        if (!response.ok) throw new Error('Audio notifikasi gagal diunduh.')
        return response.arrayBuffer()
      }).then((buffer) => audio.decodeAudioData(buffer))
      doorbell.current = loading
      void loading.catch(() => { if (doorbell.current === loading) doorbell.current = null })
    }
    return doorbell.current
  }, [])

  const activate = useCallback(async () => {
    if (!supported) return null
    try {
      const audio = context.current ??= new AudioContext()
      if (audio.state !== 'running') await audio.resume()
      if (context.current === audio && audio.state === 'running') {
        setReady(true)
        void loadDoorbell(audio).catch(() => undefined)
        return audio
      }
    } catch { /* Visual notifications remain available if audio is blocked. */ }
    return null
  }, [loadDoorbell, supported])

  useEffect(() => {
    if (muted || !supported) return
    const onInteraction = () => { if (context.current?.state !== 'running') void activate() }
    if (navigator.userActivation?.hasBeenActive) onInteraction()
    document.addEventListener('click', onInteraction)
    document.addEventListener('keydown', onInteraction)
    return () => {
      document.removeEventListener('click', onInteraction)
      document.removeEventListener('keydown', onInteraction)
    }
  }, [activate, muted, supported])

  const stop = useCallback(() => {
    playback.current++
    const playing = source.current
    source.current = null
    if (playing) {
      playing.stop()
      playing.disconnect()
    }
  }, [])

  useEffect(() => () => {
    stop()
    const audio = context.current
    context.current = null
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined)
  }, [stop])

  const playDoorbell = useCallback(async (audio: AudioContext) => {
    stop()
    const request = playback.current
    try {
      const buffer = await loadDoorbell(audio)
      if (request !== playback.current || audio.state !== 'running') return
      const player = audio.createBufferSource()
      player.buffer = buffer
      player.connect(audio.destination)
      player.onended = () => {
        if (source.current === player) source.current = null
        player.disconnect()
      }
      player.start()
      source.current = player
    } catch { /* Visual notifications remain available if the clip cannot play. */ }
  }, [loadDoorbell, stop])

  const play = useCallback(() => {
    if (!muted && context.current?.state === 'running') void playDoorbell(context.current)
  }, [muted, playDoorbell])

  async function toggle() {
    setMuted(active)
    try { localStorage.setItem(preferenceKey, String(active)) } catch { /* Use the in-memory choice. */ }
    if (active) stop()
    else {
      const audio = await activate()
      if (audio) await playDoorbell(audio)
    }
  }

  return { active, supported, play, toggle }
}
