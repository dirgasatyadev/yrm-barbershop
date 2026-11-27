import { useCallback, useEffect, useRef, useState } from 'react'

const preferenceKey = 'yrm-booking-sound-muted'

function isMuted() {
  try { return localStorage.getItem(preferenceKey) === 'true' }
  catch { return false }
}

function chime(context: AudioContext) {
  const start = context.currentTime
  const tones = new Set<OscillatorNode>()
  const strikes = [
    { pitch: 392, delay: 0, duration: 1.6, peak: 0.43 },
    { pitch: 587, delay: 0.82, duration: 3.38, peak: 0.5 },
  ]
  for (const { pitch, delay, duration, peak } of strikes) {
    const time = start + delay
    const partials = [
      { frequency: pitch, length: duration, gain: peak },
      { frequency: pitch * 2.58, length: duration * 0.32, gain: peak * 0.22 },
    ]
    for (const { frequency, length, gain } of partials) {
      const tone = context.createOscillator()
      const volume = context.createGain()
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(0, time)
      volume.gain.linearRampToValueAtTime(gain, time + 0.02)
      volume.gain.exponentialRampToValueAtTime(gain * 0.12, time + length * 0.82)
      volume.gain.exponentialRampToValueAtTime(0.001, time + length)
      tone.connect(volume).connect(context.destination)
      tones.add(tone)
      tone.onended = () => {
        tones.delete(tone)
        tone.disconnect()
        volume.disconnect()
      }
      tone.start(time)
      tone.stop(time + length)
    }
  }
  return () => { for (const tone of tones) tone.stop() }
}

export function useBookingSound() {
  const [muted, setMuted] = useState(isMuted)
  const [ready, setReady] = useState(false)
  const context = useRef<AudioContext | null>(null)
  const stopChime = useRef<(() => void) | null>(null)
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

  const playChime = useCallback((audio: AudioContext) => {
    stopChime.current?.()
    stopChime.current = chime(audio)
  }, [])

  const play = useCallback(() => {
    if (!muted && context.current?.state === 'running') playChime(context.current)
  }, [muted, playChime])

  async function toggle() {
    setMuted(active)
    try { localStorage.setItem(preferenceKey, String(active)) } catch { /* Use the in-memory choice. */ }
    if (active) stopChime.current?.()
    else {
      const audio = await activate()
      if (audio) playChime(audio)
    }
  }

  return { active, supported, play, toggle }
}
