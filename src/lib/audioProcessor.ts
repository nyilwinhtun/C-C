export interface ProcessedAudioResult {
  isSilent: boolean
  rms: number
  peak: number
  durationSeconds: number
  wavBlob: Blob | null
  mimeType: "audio/wav"
}

const TARGET_SAMPLE_RATE = 16000
const SILENT_RMS_THRESHOLD = 0.0018
const SILENT_PEAK_THRESHOLD = 0.008

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

/**
 * Encode mono Float32 PCM samples [-1, 1] into a standard 16-bit PCM WAV Blob.
 */
function encodeMonoWav16Bit(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = samples.length * (bitsPerSample / 8)
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, "WAVE")
  writeAscii(view, 12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, "data")
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    view.setInt16(offset, int16, true)
    offset += 2
  }

  return new Blob([buffer], { type: "audio/wav" })
}

/**
 * Decode any browser-recorded or uploaded audio Blob via AudioContext,
 * resample to 16kHz mono, check RMS energy for silence, normalize/boost
 * quiet microphone gain, and encode as a clean 16kHz mono 16-bit WAV.
 */
export async function prepareAudioForGemini(blob: Blob): Promise<ProcessedAudioResult> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const decodeCtx = new AudioCtx()
  let decoded: AudioBuffer
  try {
    const arrayBuffer = await blob.arrayBuffer()
    decoded = await decodeCtx.decodeAudioData(arrayBuffer)
  } finally {
    await decodeCtx.close().catch(() => {})
  }

  const durationSeconds = decoded.duration
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      isSilent: true,
      rms: 0,
      peak: 0,
      durationSeconds: 0,
      wavBlob: null,
      mimeType: "audio/wav",
    }
  }

  // Mix down to mono and resample to 16kHz
  const targetLength = Math.max(1, Math.ceil(durationSeconds * TARGET_SAMPLE_RATE))
  const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  source.connect(offlineCtx.destination)
  source.start(0)
  const rendered = await offlineCtx.startRendering()
  const samples = rendered.getChannelData(0)

  let sumSq = 0
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
    sumSq += samples[i] * samples[i]
  }
  const rms = samples.length > 0 ? Math.sqrt(sumSq / samples.length) : 0

  if (rms < SILENT_RMS_THRESHOLD && peak < SILENT_PEAK_THRESHOLD) {
    return {
      isSilent: true,
      rms,
      peak,
      durationSeconds,
      wavBlob: null,
      mimeType: "audio/wav",
    }
  }

  // Normalize / boost quiet microphone recordings so speech is clear
  const normalized = new Float32Array(samples.length)
  const targetPeak = 0.85
  const gain = peak > 0 ? Math.min(15, targetPeak / peak) : 1
  for (let i = 0; i < samples.length; i += 1) {
    normalized[i] = Math.max(-1, Math.min(1, samples[i] * gain))
  }

  const wavBlob = encodeMonoWav16Bit(normalized, TARGET_SAMPLE_RATE)

  return {
    isSilent: false,
    rms,
    peak,
    durationSeconds,
    wavBlob,
    mimeType: "audio/wav",
  }
}

