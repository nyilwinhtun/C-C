/**
 * Shared iOS Safari / WebKit audio unlock & MediaRecorder compatibility helpers.
 * Keeps Android Chrome and Desktop browsers working with their preferred codecs
 * while preventing silent/empty recordings and blocked playback on iOS Safari.
 */

import { encodeMonoWav16Bit, preparePcmSegmentForGemini } from "@/lib/audioProcessor"

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
const activeAudioStoppers = new Map<string, () => void>()

/**
 * Register a managed audio player's stop/pause callback so only one active
 * audio element plays across the entire app at any time.
 */
export function registerManagedAudio(id: string, stopFn: () => void): () => void {
  activeAudioStoppers.set(id, stopFn)
  return () => {
    if (activeAudioStoppers.get(id) === stopFn) {
      activeAudioStoppers.delete(id)
    }
  }
}

/**
 * Pause/stop all registered audio players (except the optional caller id).
 */
export function stopAllManagedAudio(exceptId?: string): void {
  for (const [id, stopFn] of activeAudioStoppers.entries()) {
    if (exceptId && id === exceptId) continue
    try {
      stopFn()
    } catch {
      // Ignore player cleanup errors
    }
  }
}

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

function getOfflineAudioContextConstructor(): typeof OfflineAudioContext | null {
  if (typeof window === "undefined") return null
  return (
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext ||
    null
  )
}

/**
 * Apply lightweight studio vocal clarity EQ (+2.5 dB peaking at 3500 Hz, Q 1.2)
 * and gentle dynamic leveling via OfflineAudioContext, then encode to 16-bit mono WAV.
 * Falls back cleanly to raw encodeMonoWav16Bit if OfflineAudioContext is unavailable.
 */
export async function applyStudioVocalEqToFloat32(
  samples: Float32Array,
  sampleRate: number
): Promise<Blob> {
  if (samples.length === 0) {
    return encodeMonoWav16Bit(samples, sampleRate)
  }

  const OfflineCtx = getOfflineAudioContextConstructor()
  if (!OfflineCtx) {
    return encodeMonoWav16Bit(samples, sampleRate)
  }

  // iOS Safari OfflineAudioContext throws NotSupportedError for sample rates < 44100 Hz
  // (such as Gemini's 24kHz PCM). Resample to 44100 Hz before rendering so Studio EQ
  // always runs reliably on iPhone/iPad.
  const targetSampleRate = sampleRate < 44100 ? 44100 : sampleRate
  let inputSamples = samples
  if (targetSampleRate !== sampleRate) {
    const ratio = sampleRate / targetSampleRate
    const targetLength = Math.max(1, Math.round(samples.length / ratio))
    const resampled = new Float32Array(targetLength)
    for (let i = 0; i < targetLength; i += 1) {
      const srcPos = i * ratio
      const idx0 = Math.floor(srcPos)
      const idx1 = Math.min(samples.length - 1, idx0 + 1)
      const frac = srcPos - idx0
      resampled[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac
    }
    inputSamples = resampled
  }

  try {
    const offlineCtx = new OfflineCtx(1, inputSamples.length, targetSampleRate)
    const buffer = offlineCtx.createBuffer(1, inputSamples.length, targetSampleRate)
    buffer.copyToChannel(new Float32Array(inputSamples), 0)

    const source = offlineCtx.createBufferSource()
    source.buffer = buffer

    // Vocal presence boost so Burmese consonants sound crisp on iPhone speakers
    const presenceFilter = offlineCtx.createBiquadFilter()
    presenceFilter.type = "peaking"
    presenceFilter.frequency.value = 3500
    presenceFilter.gain.value = 2.5
    presenceFilter.Q.value = 1.2

    // Gentle dynamic leveling
    const compressor = offlineCtx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 12
    compressor.ratio.value = 3
    compressor.attack.value = 0.005
    compressor.release.value = 0.12

    // Gentle -1 dBFS peak limiter after the +2.5 dB presence boost to prevent digital clipping
    const limiter = offlineCtx.createDynamicsCompressor()
    limiter.threshold.value = -1.0
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.05

    source.connect(presenceFilter)
    presenceFilter.connect(compressor)
    compressor.connect(limiter)
    limiter.connect(offlineCtx.destination)

    source.start(0)
    const rendered = await offlineCtx.startRendering()
    return encodeMonoWav16Bit(rendered.getChannelData(0), rendered.sampleRate)
  } catch {
    return encodeMonoWav16Bit(samples, sampleRate)
  }
}

/**
 * Convert 16-bit signed little-endian mono PCM bytes into a studio-EQ'd WAV Blob.
 */
export async function applyStudioVocalEqToPcm16(
  pcmBytes: Uint8Array,
  sampleRate = 24000
): Promise<Blob> {
  const sampleCount = Math.floor(pcmBytes.byteLength / 2)
  const floats = new Float32Array(sampleCount)
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, sampleCount * 2)
  for (let i = 0; i < sampleCount; i += 1) {
    const int16 = view.getInt16(i * 2, true)
    floats[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff
  }
  return applyStudioVocalEqToFloat32(floats, sampleRate)
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
  stopAllManagedAudio("primed")
  const el = getSharedPrimerAudio()
  if (!el) return null
  setIosAudioSessionPlayback()
  el.pause()
  el.removeAttribute("src")
  el.load()
  el.volume = 1
  el.src = blobUrl
  el.load()
  el.currentTime = 0
  try {
    await el.play()
  } catch {
    // Ignore autoplay errors if gesture expired
  }
  return el
}

/**
 * Immediately stop and reset the persistent primed <audio> element so
 * switching voices or regenerating never leaves stale/silent playback.
 */
export function stopPrimedAudio(): void {
  if (!sharedPrimerAudio) return
  try {
    sharedPrimerAudio.pause()
    sharedPrimerAudio.currentTime = 0
    sharedPrimerAudio.removeAttribute("src")
    sharedPrimerAudio.load()
  } catch {
    // Ignore reset errors
  }
}

export interface WavAudioRecorderHandle {
  pause: () => void
  resume: () => void
  isPaused: () => boolean
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
export interface LiveWavChunk {
  blob: Blob
  mimeType: "audio/wav"
  durationSeconds: number
  rms: number
}

export function createWavAudioRecorder(
  stream: MediaStream,
  options?: {
    audioContext?: AudioContext | null
    micFilterMode?: "raw" | "light"
    onBars?: (bars: number[]) => void
    barCount?: number
    onChunk?: (chunk: LiveWavChunk) => void
    chunkIntervalMs?: number
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
  const segmentChunks: Float32Array[] = []
  let segmentSamples = 0
  const chunkIntervalSamples = Math.round(
    (ctx.sampleRate || 44100) * ((options?.chunkIntervalMs ?? 3500) / 1000)
  )
  let stopped = false
  let paused = false

  const flushSegment = (minDurationSeconds: number) => {
    if (!options?.onChunk || segmentSamples === 0) return
    const sampleRate = ctx.sampleRate || 44100
    if (segmentSamples < sampleRate * minDurationSeconds) {
      segmentChunks.length = 0
      segmentSamples = 0
      return
    }
    const chunksToFlush = segmentChunks.splice(0)
    const samplesToFlush = segmentSamples
    segmentSamples = 0
    const processed = preparePcmSegmentForGemini(chunksToFlush, samplesToFlush, sampleRate)
    if (!processed.isSilent && processed.wavBlob) {
      options.onChunk({
        blob: processed.wavBlob,
        mimeType: "audio/wav",
        durationSeconds: samplesToFlush / sampleRate,
        rms: processed.rms,
      })
    }
  }

  processor.onaudioprocess = (event) => {
    if (stopped || paused) return
    const input = event.inputBuffer.getChannelData(0)
    if (input.length === 0) return
    const copy = new Float32Array(input.length)
    copy.set(input)
    pcmChunks.push(copy)
    totalSamples += copy.length

    if (options?.onChunk) {
      segmentChunks.push(copy)
      segmentSamples += copy.length
      if (segmentSamples >= chunkIntervalSamples) {
        flushSegment(0.25)
      }
    }
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
      if (paused) {
        options.onBars?.(Array(barCount).fill(10))
        rafId = requestAnimationFrame(tick)
        return
      }
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
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {})
      }
    },
    isPaused: () => paused,
    stop: async () => {
      const sampleRate = ctx.sampleRate || 44100
      await cleanup()
      flushSegment(0.35)

      const merged = new Float32Array(totalSamples)
      let offset = 0
      for (const chunk of pcmChunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }

      const blob = await applyStudioVocalEqToFloat32(merged, sampleRate)
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

/**
 * Share an audio Blob via the native iOS/Android Share Sheet (navigator.share),
 * falling back to a standard <a download> on desktop or unsupported browsers.
 */
export async function shareAudioFile(params: {
  blob?: Blob | null
  url: string
  title?: string
  fileExtension?: string
}): Promise<void> {
  const ext = params.fileExtension || "wav"
  const safeName = (params.title || "audio")
    .replace(/[^a-zA-Z0-9\u1000-\u109F_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "audio"
  const filename = `${safeName}.${ext}`

  const triggerFallbackDownload = () => {
    const link = document.createElement("a")
    link.href = params.url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  try {
    let blob = params.blob ?? null
    if (!blob && params.url) {
      const res = await fetch(params.url)
      blob = await res.blob()
    }
    if (!blob || typeof navigator === "undefined" || typeof navigator.share !== "function") {
      triggerFallbackDownload()
      return
    }

    const mimeType =
      blob.type ||
      (ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/wav")
    const file = new File([blob], filename, { type: mimeType })

    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      triggerFallbackDownload()
      return
    }

    await navigator.share({
      files: [file],
      title: params.title || "Content Creator Studio",
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return
    }
    triggerFallbackDownload()
  }
}
