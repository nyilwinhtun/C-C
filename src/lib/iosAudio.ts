/**
 * Shared iOS Safari / WebKit audio unlock & MediaRecorder compatibility helpers.
 * Keeps Android Chrome and Desktop browsers working with their preferred codecs
 * while preventing silent/empty recordings and blocked playback on iOS Safari.
 */

import { encodeMonoWav16Bit } from "@/lib/audioProcessor"

export const MIN_VALID_RECORDING_BYTES = 1000

const AUDIO_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const

// 1-sample silent 16-bit mono WAV (44-byte header + 2-byte zero sample)
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"

let sharedUnlockCtx: AudioContext | null = null
let sharedPrimerAudio: HTMLAudioElement | null = null

/**
 * Configure iOS Safari / WebKit AudioSession to 'playback' so audio plays
 * even when the hardware Silent/Mute switch is ON.
 */
export function setIosAudioSessionPlayback(): void {
  if (typeof navigator === "undefined") return
  try {
    if ("audioSession" in navigator) {
      const navWithSession = navigator as unknown as {
        audioSession?: { type: string }
      }
      if (navWithSession.audioSession) {
        navWithSession.audioSession.type = "playback"
      }
    }
  } catch {
    // Ignore unsupported audioSession environments
  }
}

/**
 * Return (or lazily create) the persistent <audio playsInline> element
 * primed on user gestures for iOS Safari / PWA playback.
 */
export function getSharedPrimerAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null
  if (!sharedPrimerAudio) {
    const el = document.createElement("audio")
    el.setAttribute("playsinline", "")
    el.setAttribute("webkit-playsinline", "")
    el.preload = "auto"
    sharedPrimerAudio = el
  }
  return sharedPrimerAudio
}

export function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

export function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  )
}

/**
 * Synchronously unlock Web Audio and HTML5 <audio> playback inside a user
 * gesture (onClick / onTouchStart) so iOS Safari allows audio playback and
 * recording even after async API calls or when the physical Silent switch is on.
 */
export function unlockIosAudio(): AudioContext | null {
  if (typeof window === "undefined") return null

  setIosAudioSessionPlayback()

  // 1. Unlock HTML5 <audio playsInline> element synchronously on tap
  try {
    const el = getSharedPrimerAudio()
    if (el) {
      el.src = SILENT_WAV_DATA_URI
      el.volume = 0.01
      const playPromise = el.play()
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {})
      }
    }
  } catch {
    // Ignore autoplay restrictions outside user gestures
  }

  // 2. Unlock Web Audio API AudioContext synchronously on tap
  try {
    const AudioCtx = getAudioContextConstructor()
    if (!AudioCtx) return null

    if (!sharedUnlockCtx || sharedUnlockCtx.state === "closed") {
      sharedUnlockCtx = new AudioCtx()
    }
    if (sharedUnlockCtx.state === "suspended") {
      sharedUnlockCtx.resume().catch(() => {})
    }

    const buffer = sharedUnlockCtx.createBuffer(1, 1, 22050)
    const source = sharedUnlockCtx.createBufferSource()
    source.buffer = buffer
    source.connect(sharedUnlockCtx.destination)
    source.start(0)
    return sharedUnlockCtx
  } catch {
    return null
  }
}

/**
 * Decode an audio Blob using the shared unlocked AudioContext when available
 * (avoiding WebKit's concurrent AudioContext limit), falling back to a temporary
 * AudioContext if needed.
 */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  if (sharedUnlockCtx && sharedUnlockCtx.state !== "closed") {
    try {
      return await sharedUnlockCtx.decodeAudioData(arrayBuffer.slice(0))
    } catch {
      // Fall through to fresh AudioContext if shared context fails
    }
  }

  const AudioCtx = getAudioContextConstructor()
  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * On iOS Safari / MP4 MediaRecorder, calling start(timeslice) produces fragmented
 * MP4 chunks that can fail decoding or lose headers. Returning undefined lets
 * iOS emit a single complete MP4/AAC blob on stop(), while Android/Desktop WebM
 * continues streaming 250ms chunks.
 */
export function getRecorderTimesliceMs(mimeType: string): number | undefined {
  if (isAppleTouchDevice() || mimeType.toLowerCase().includes("mp4")) {
    return undefined
  }
  return 250
}

/**
 * Dynamically detect the best supported audio MediaRecorder MIME type:
 * audio/webm;codecs=opus -> audio/webm -> audio/mp4 -> "" (browser default).
 */
export function pickSupportedAudioRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return ""
  for (const candidate of AUDIO_RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate
      }
    } catch {
      // Some WebKit builds throw on unknown codec strings
    }
  }
  return ""
}

/**
 * Create a MediaRecorder with iOS-safe audioBitsPerSecond and fallback
 * if WebKit rejects specific MediaRecorderOptions.
 */
export function createSafeAudioMediaRecorder(stream: MediaStream): {
  recorder: MediaRecorder
  mimeType: string
} {
  const mimeType = pickSupportedAudioRecorderMime()
  const attempts: MediaRecorderOptions[] = []

  if (mimeType) {
    attempts.push({ mimeType, audioBitsPerSecond: 128_000 })
    attempts.push({ mimeType })
  } else {
    attempts.push({ audioBitsPerSecond: 128_000 })
  }

  for (const options of attempts) {
    try {
      return {
        recorder: new MediaRecorder(stream, options),
        mimeType,
      }
    } catch {
      // Try next fallback option set
    }
  }

  return {
    recorder: new MediaRecorder(stream),
    mimeType,
  }
}

/**
 * Resolve the actual MIME type of a recorded audio Blob, ensuring iOS MP4/AAC
 * recordings are never mislabeled as audio/webm when recorder.mimeType is empty.
 */
export function resolveRecordedAudioMime(
  recorderMimeType: string | undefined,
  chunks: BlobPart[],
  requestedMime: string
): string {
  const firstChunkMime =
    chunks.length > 0 && chunks[0] instanceof Blob ? chunks[0].type : ""
  const resolved = recorderMimeType || firstChunkMime || requestedMime
  if (resolved) return resolved

  return isAppleTouchDevice() ? "audio/mp4" : "audio/webm"
}

/**
 * Play a Blob URL through the persistent primed HTML5 <audio playsInline>
 * element (call unlockIosAudio() synchronously inside the tap handler first).
 */
export async function playBlobUrlWithPrimedAudio(blobUrl: string): Promise<HTMLAudioElement | null> {
  const el = getSharedPrimerAudio()
  if (!el) return null
  setIosAudioSessionPlayback()
  el.pause()
  el.volume = 1
  el.src = blobUrl
  el.currentTime = 0
  try {
    await el.play()
  } catch {
    // Ignore autoplay errors if gesture expired
  }
  return el
}

export interface WavAudioRecorderHandle {
  stop: () => Promise<{
    blob: Blob
    mimeType: "audio/wav"
    durationSeconds: number
  }>
  cancel: () => void
}

/**
 * Direct Web Audio API native sample-rate (44.1kHz / 48kHz) mono 16-bit PCM-to-WAV recorder.
 * Works identically on iPhone (Safari + Home Screen PWA), Android, and Desktop
 * without MediaRecorder MIME/empty-blob issues.
 */
export function createWavAudioRecorder(
  stream: MediaStream,
  options?: {
    audioContext?: AudioContext | null
    micFilterMode?: "raw" | "light"
    onBars?: (bars: number[]) => void
    barCount?: number
  }
): WavAudioRecorderHandle {
  const AudioCtx = getAudioContextConstructor()
  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const ctx =
    options?.audioContext && options.audioContext.state !== "closed"
      ? options.audioContext
      : new AudioCtx()

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {})
  }

  const source = ctx.createMediaStreamSource(stream)
  let highpassFilter: BiquadFilterNode | null = null
  let captureNode: AudioNode = source

  if (options?.micFilterMode === "light") {
    highpassFilter = ctx.createBiquadFilter()
    highpassFilter.type = "highpass"
    highpassFilter.frequency.value = 85
    highpassFilter.Q.value = 0.7
    source.connect(highpassFilter)
    captureNode = highpassFilter
  }

  const processor = ctx.createScriptProcessor(4096, 1, 1)
  const silentGain = ctx.createGain()
  silentGain.gain.value = 0

  const pcmChunks: Float32Array[] = []
  let totalSamples = 0
  let stopped = false

  processor.onaudioprocess = (event) => {
    if (stopped) return
    const input = event.inputBuffer.getChannelData(0)
    if (input.length === 0) return
    const copy = new Float32Array(input.length)
    copy.set(input)
    pcmChunks.push(copy)
    totalSamples += copy.length
  }

  captureNode.connect(processor)
  processor.connect(silentGain)
  silentGain.connect(ctx.destination)

  let rafId = 0
  let analyser: AnalyserNode | null = null
  if (options?.onBars) {
    const barCount = options.barCount ?? 28
    analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    captureNode.connect(analyser)
    const freqData = new Uint8Array(analyser.frequencyBinCount)
    // Focus on lower/mid vocal spectrum bins (up to ~12kHz) for responsive voice bars
    const activeBinCount = Math.min(freqData.length, Math.max(barCount, 36))

    const tick = () => {
      if (stopped || !analyser) return
      analyser.getByteFrequencyData(freqData)
      const bars: number[] = []
      for (let i = 0; i < barCount; i += 1) {
        const binIndex = Math.min(
          activeBinCount - 1,
          Math.floor((i * activeBinCount) / barCount)
        )
        const val = freqData[binIndex] ?? 0
        bars.push(Math.max(8, Math.min(100, Math.round((val / 255) * 100))))
      }
      options.onBars?.(bars)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  const cleanup = async () => {
    if (stopped) return
    stopped = true
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    try {
      processor.onaudioprocess = null
      source.disconnect()
      highpassFilter?.disconnect()
      processor.disconnect()
      silentGain.disconnect()
      analyser?.disconnect()
    } catch {
      // Ignore disconnect errors
    }
    await ctx.close().catch(() => {})
  }

  return {
    stop: async () => {
      const sampleRate = ctx.sampleRate || 44100
      await cleanup()

      const merged = new Float32Array(totalSamples)
      let offset = 0
      for (const chunk of pcmChunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }

      const blob = encodeMonoWav16Bit(merged, sampleRate)
      const durationSeconds = merged.length / sampleRate

      return {
        blob,
        mimeType: "audio/wav",
        durationSeconds,
      }
    },
    cancel: () => {
      void cleanup()
    },
  }
}
