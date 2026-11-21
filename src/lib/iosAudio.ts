/**
 * Shared iOS Safari / WebKit audio unlock & MediaRecorder compatibility helpers.
 * Keeps Android Chrome and Desktop browsers working with their preferred codecs
 * while preventing silent/empty recordings and blocked playback on iOS Safari.
 */

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

  // 1. Unlock HTML5 <audio playsInline> element synchronously on tap
  try {
    if (!sharedPrimerAudio) {
      const el = document.createElement("audio")
      el.setAttribute("playsinline", "")
      el.preload = "auto"
      el.src = SILENT_WAV_DATA_URI
      el.volume = 0.01
      sharedPrimerAudio = el
    }
    const playPromise = sharedPrimerAudio.play()
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {})
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

  const isAppleTouch =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  return isAppleTouch ? "audio/mp4" : "audio/webm"
}
