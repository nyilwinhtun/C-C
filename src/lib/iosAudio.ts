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

const WAV_RECORDER_TARGET_SAMPLE_RATE = 16000

function resampleTo16kMono(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === WAV_RECORDER_TARGET_SAMPLE_RATE || samples.length === 0) {
    return samples
  }
  const targetLength = Math.max(
    1,
    Math.round((samples.length * WAV_RECORDER_TARGET_SAMPLE_RATE) / sourceRate)
  )
  const resampled = new Float32Array(targetLength)
  const ratio = sourceRate / WAV_RECORDER_TARGET_SAMPLE_RATE
  for (let i = 0; i < targetLength; i += 1) {
    const srcPos = i * ratio
    const idx0 = Math.min(samples.length - 1, Math.floor(srcPos))
    const idx1 = Math.min(samples.length - 1, idx0 + 1)
    const frac = srcPos - idx0
    resampled[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac
  }
  return resampled
}

/**
 * Direct Web Audio API 16kHz mono 16-bit PCM-to-WAV recorder.
 * Works identically on iPhone (Safari + Home Screen PWA), Android, and Desktop
 * without MediaRecorder MIME/empty-blob issues.
 */
export function createWavAudioRecorder(
  stream: MediaStream,
  options?: {
    audioContext?: AudioContext | null
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

  source.connect(processor)
  processor.connect(silentGain)
  silentGain.connect(ctx.destination)

  let rafId = 0
  let analyser: AnalyserNode | null = null
  if (options?.onBars) {
    const barCount = options.barCount ?? 16
    analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    source.connect(analyser)
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      if (stopped || !analyser) return
      analyser.getByteFrequencyData(freqData)
      const bars: number[] = []
      for (let i = 0; i < barCount; i += 1) {
        const val = freqData[i % freqData.length] ?? 0
        bars.push(Math.max(14, Math.min(100, Math.round((val / 255) * 100))))
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

      const samples16k = resampleTo16kMono(merged, sampleRate)
      const blob = encodeMonoWav16Bit(samples16k, WAV_RECORDER_TARGET_SAMPLE_RATE)
      const durationSeconds = samples16k.length / WAV_RECORDER_TARGET_SAMPLE_RATE

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
