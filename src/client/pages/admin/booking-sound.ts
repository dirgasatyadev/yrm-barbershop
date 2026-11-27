import { useCallback, useEffect, useRef, useState } from 'react'

const preferenceKey = 'yrm-booking-sound-muted'

function isMuted() {
  try { return localStorage.getItem(preferenceKey) === 'true' }
  catch { return false }
}

function chime(context: AudioContext) {
  const start = context.currentTime
  for (const [frequency, delay] of [[740, 0], [988, 0.15]]) {
    const tone = context.createOscillator()
    const volume = context.createGain()
    const time = start + delay
    tone.frequency.value = frequency
    volume.gain.setValueAtTime(0, time)
    volume.gain.linearRampToValueAtTime(0.17, time + 0.02)
    volume.gain.exponentialRampToValueAtTime(0.001, time + 0.23)
    tone.connect(volume).connect(context.destination)
    tone.onended = () => { tone.disconnect(); volume.disconnect() }
    tone.start(time)
    tone.stop(time + 0.24)
  }
}

export function useBookingSound() {
  const [muted, setMuted] = useState(isMuted)
  const [ready, setReady] = useState(false)
  const context = useRef<AudioContext | null>(null)
  const supported = typeof window.AudioContext === 'function'
  const active = ready && !muted

  const activate = useCallback(async () => {
    if (!supported) return null
    try {
      const audio = context.current ??= new AudioContext()
      if (audio.state !== 'running') await audio.resume()
      if (context.current === audio && audio.state === 'running') {
        setReady(true)
        return audio
      }
    } catch { /* Visual notifications remain available if audio is blocked. */ }
    return null
  }, [supported])

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

  useEffect(() => () => {
    const audio = context.current
    context.current = null
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined)
  }, [])

  const play = useCallback(() => {
    if (!muted && context.current?.state === 'running') chime(context.current)
  }, [muted])

  async function toggle() {
    setMuted(active)
    try { localStorage.setItem(preferenceKey, String(active)) } catch { /* Use the in-memory choice. */ }
    if (!active) {
      const audio = await activate()
      if (audio) chime(audio)
    }
  }

  return { active, supported, play, toggle }
}
