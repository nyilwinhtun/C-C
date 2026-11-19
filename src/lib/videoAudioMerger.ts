export type OriginalAudioVolume = 0 | 0.15 | 0.5
export type VideoDurationSyncMode = "loop_video" | "fit_video"
export type VideoAspectRatio = "original" | "9:16" | "1:1" | "16:9"
export type BackgroundMusicPreset = "none" | "upbeat_promo" | "soft_vlog" | "calm_lofi" | "custom"
export type SubtitleStylePreset = "dark_pill" | "yellow_box" | "bold_outline"

export interface SubtitleSegment {
  text: string
  startTime: number
  endTime: number
}

export interface MergeVideoAudioOptions {
  videoFile?: File | null
  imageFiles?: File[]
  voiceoverAudio: AudioBuffer | Blob
  originalVolume: OriginalAudioVolume
  voiceoverVolume?: number
  durationSyncMode?: VideoDurationSyncMode
  aspectRatio?: VideoAspectRatio
  enableBlurredBackground?: boolean
  backgroundMusicPreset?: BackgroundMusicPreset
  backgroundMusicFile?: File | null
  backgroundMusicVolume?: number
  enableAutoDucking?: boolean
  enableSubtitles?: boolean
  subtitleScript?: string
  subtitleStyle?: SubtitleStylePreset
  watermarkText?: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export interface MergeVideoAudioResult {
  blob: Blob
  videoUrl: string
  mimeType: string
  fileExtension: "mp4" | "webm"
  durationSeconds: number
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const

function pickSupportedVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.")
  }
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return ""
}

function getEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function computeCanvasSize(videoWidth: number, videoHeight: number): { width: number; height: number } {
  const maxDimension = 1920
  const largest = Math.max(videoWidth, videoHeight)
  const scale = largest > maxDimension ? maxDimension / largest : 1
  return {
    width: getEvenDimension(videoWidth * scale),
    height: getEvenDimension(videoHeight * scale),
  }
}

function resolveCanvasDimensions(
  aspectRatio: VideoAspectRatio,
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 }
    case "1:1":
      return { width: 720, height: 720 }
    case "16:9":
      return { width: 1280, height: 720 }
    case "original":
    default:
      return computeCanvasSize(sourceWidth, sourceHeight)
  }
}

function cleanCaptionScript(raw: string): string {
  return raw
    .replace(/\[pause\s+\d+(?:\.\d+)?\s*s?\]/gi, " ")
    .replace(/\[\s*\d+(?::\d+)?\s*s?(?:\s*[-–—]\s*\d+(?::\d+)?\s*s?)?[^\]]*\]/gi, " ")
    .replace(/\[(hook|body|cta|intro|outro|scene\s*\d*)[^\]]*\]/gi, " ")
    .replace(/[*#`_~]/g, "")
    .replace(/\r?\n+/g, "\n")
    .trim()
}

function splitLongPhrase(phrase: string, maxChars = 42): string[] {
  const trimmed = phrase.trim()
  if (trimmed.length <= maxChars) return [trimmed]

  const words = trimmed.split(/\s+/)
  if (words.length > 1) {
    const lines: string[] = []
    let current = ""
    for (const word of words) {
      if (current && current.length + word.length + 1 > maxChars) {
        lines.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) lines.push(current)
    return lines
  }

  // Fallback for continuous Myanmar text without spaces
  const chunks: string[] = []
  const chars = Array.from(trimmed)
  for (let i = 0; i < chars.length; i += maxChars) {
    chunks.push(chars.slice(i, i + maxChars).join(""))
  }
  return chunks
}

export function buildSubtitleSegments(script: string, totalDuration: number): SubtitleSegment[] {
  const cleaned = cleanCaptionScript(script)
  if (!cleaned || totalDuration <= 0) return []

  const rawLines = cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[။။.!?])\s*/))
    .flatMap((part) => part.split(/(?<=[၊,])\s*/))
    .map((p) => p.trim())
    .filter(Boolean)

  const phrases = rawLines.flatMap((line) => splitLongPhrase(line, 44)).filter(Boolean)
  if (phrases.length === 0) return []

  const weights = phrases.map((p) => Math.max(4, Array.from(p).length))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  const segments: SubtitleSegment[] = []
  let cursor = 0
  for (let i = 0; i < phrases.length; i += 1) {
    const sliceDuration = (weights[i] / totalWeight) * totalDuration
    const endTime = i === phrases.length - 1 ? totalDuration : cursor + sliceDuration
    segments.push({
      text: phrases[i],
      startTime: cursor,
      endTime,
    })
    cursor = endTime
  }
  return segments
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hrs = Math.floor(clamped / 3600)
  const mins = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000)
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const pad3 = (n: number) => String(n).padStart(3, "0")
  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`
}

export function generateSrtContent(script: string, totalDuration: number): string {
  const segments = buildSubtitleSegments(script, totalDuration)
  return segments
    .map(
      (seg, index) =>
        `${index + 1}\n${formatSrtTimestamp(seg.startTime)} --> ${formatSrtTimestamp(seg.endTime)}\n${seg.text}`
    )
    .join("\n\n")
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text]

  const words = text.split(/\s+/)
  if (words.length > 1) {
    const lines: string[] = []
    let current = ""
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    return lines.slice(0, 2)
  }

  const chars = Array.from(text)
  const lines: string[] = []
  let current = ""
  for (const ch of chars) {
    const candidate = current + ch
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = ch
      if (lines.length >= 2) break
    } else {
      current = candidate
    }
  }
  if (current && lines.length < 2) lines.push(current)
  return lines
}

function drawSubtitleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  style: SubtitleStylePreset = "dark_pill"
) {
  const minSide = Math.min(width, height)
  const fontSize = Math.max(20, Math.min(44, Math.round(minSide * 0.044)))
  const lineHeight = Math.round(fontSize * 1.38)
  const maxTextWidth = width * 0.84

  ctx.save()
  ctx.font = `700 ${fontSize}px "Noto Sans Myanmar", "Padauk", "Myanmar Text", system-ui, -apple-system, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const lines = wrapCanvasText(ctx, text, maxTextWidth)
  const measuredWidths = lines.map((l) => ctx.measureText(l).width)
  const blockWidth = Math.min(maxTextWidth, Math.max(...measuredWidths))

  const padX = Math.round(fontSize * 0.85)
  const padY = Math.round(fontSize * 0.45)
  const boxWidth = blockWidth + padX * 2
  const boxHeight = lines.length * lineHeight + padY * 2
  const boxX = (width - boxWidth) / 2
  const bottomMargin = Math.round(height * 0.09)
  const boxY = height - bottomMargin - boxHeight

  if (style === "bold_outline") {
    ctx.lineJoin = "round"
    ctx.miterLimit = 2
    ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.22))
    ctx.strokeStyle = "rgba(0, 0, 0, 0.92)"
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)"
    ctx.shadowBlur = 8
    ctx.fillStyle = "#ffffff"
    for (let i = 0; i < lines.length; i += 1) {
      const lineY = boxY + padY + lineHeight * (i + 0.5)
      ctx.strokeText(lines[i], width / 2, lineY)
      ctx.fillText(lines[i], width / 2, lineY)
    }
    ctx.restore()
    return
  }

  if (style === "yellow_box") {
    drawRoundedRectPath(ctx, boxX, boxY, boxWidth, boxHeight, Math.round(fontSize * 0.38))
    ctx.fillStyle = "rgba(250, 204, 21, 0.96)"
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = "rgba(17, 24, 39, 0.2)"
    ctx.stroke()

    ctx.fillStyle = "#111827"
    for (let i = 0; i < lines.length; i += 1) {
      const lineY = boxY + padY + lineHeight * (i + 0.5)
      ctx.fillText(lines[i], width / 2, lineY)
    }
    ctx.restore()
    return
  }

  // Default: dark_pill
  drawRoundedRectPath(ctx, boxX, boxY, boxWidth, boxHeight, Math.round(fontSize * 0.55))
  ctx.fillStyle = "rgba(10, 12, 18, 0.78)"
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
  ctx.stroke()

  ctx.fillStyle = "#ffffff"
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)"
  ctx.shadowBlur = 4
  for (let i = 0; i < lines.length; i += 1) {
    const lineY = boxY + padY + lineHeight * (i + 0.5)
    ctx.fillText(lines[i], width / 2, lineY)
  }
  ctx.restore()
}

function drawWatermarkOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  watermarkText: string
) {
  const clean = watermarkText.trim()
  if (!clean) return

  const minSide = Math.min(width, height)
  const fontSize = Math.max(13, Math.min(24, Math.round(minSide * 0.025)))
  const padX = Math.round(fontSize * 0.7)
  const padY = Math.round(fontSize * 0.38)
  const margin = Math.round(minSide * 0.035)

  ctx.save()
  ctx.font = `600 ${fontSize}px "Noto Sans Myanmar", "Padauk", system-ui, -apple-system, sans-serif`
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"

  const maxW = width * 0.55
  const textWidth = Math.min(maxW, ctx.measureText(clean).width)
  const boxWidth = textWidth + padX * 2
  const boxHeight = fontSize * 1.35 + padY * 2

  drawRoundedRectPath(ctx, margin, margin, boxWidth, boxHeight, Math.round(boxHeight / 2))
  ctx.fillStyle = "rgba(15, 18, 25, 0.45)"
  ctx.fill()

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)"
  ctx.fillText(clean, margin + padX, margin + boxHeight / 2, maxW)
  ctx.restore()
}

function computeCoverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

function computeContainRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.min(dstW / srcW, dstH / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

function drawFramedMedia(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number,
  options: {
    blurredBg: boolean
    preBlurredBg?: HTMLCanvasElement | null
    zoomScale?: number
    panX?: number
    panY?: number
    alpha?: number
  }
) {
  const { blurredBg, preBlurredBg, zoomScale = 1, panX = 0, panY = 0, alpha = 1 } = options
  const srcRatio = srcW / Math.max(1, srcH)
  const dstRatio = canvasW / Math.max(1, canvasH)
  const sameAspect = Math.abs(srcRatio - dstRatio) < 0.04

  ctx.save()
  ctx.globalAlpha = alpha

  if (sameAspect) {
    const cover = computeCoverRect(srcW, srcH, canvasW, canvasH)
    const zw = cover.w * zoomScale
    const zh = cover.h * zoomScale
    const zx = (canvasW - zw) / 2 + panX
    const zy = (canvasH - zh) / 2 + panY
    ctx.drawImage(source, zx, zy, zw, zh)
    ctx.restore()
    return
  }

  if (blurredBg) {
    if (preBlurredBg) {
      ctx.drawImage(preBlurredBg, 0, 0, canvasW, canvasH)
    } else {
      const bg = computeCoverRect(srcW, srcH, canvasW, canvasH)
      const pad = 1.08
      const bw = bg.w * pad
      const bh = bg.h * pad
      ctx.save()
      ctx.filter = "blur(22px) brightness(0.6)"
      ctx.drawImage(source, (canvasW - bw) / 2, (canvasH - bh) / 2, bw, bh)
      ctx.restore()
      ctx.fillStyle = "rgba(8, 10, 16, 0.25)"
      ctx.fillRect(0, 0, canvasW, canvasH)
    }
  } else {
    ctx.fillStyle = "#090b10"
    ctx.fillRect(0, 0, canvasW, canvasH)
  }

  const fg = computeContainRect(srcW, srcH, canvasW, canvasH)
  if (zoomScale !== 1 || panX !== 0 || panY !== 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(fg.x, fg.y, fg.w, fg.h)
    ctx.clip()
    const zw = fg.w * zoomScale
    const zh = fg.h * zoomScale
    const zx = fg.x + (fg.w - zw) / 2 + panX
    const zy = fg.y + (fg.h - zh) / 2 + panY
    ctx.drawImage(source, zx, zy, zw, zh)
    ctx.restore()
  } else {
    ctx.drawImage(source, fg.x, fg.y, fg.w, fg.h)
  }

  ctx.restore()
}

function createPreBlurredPhotoCanvas(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
): HTMLCanvasElement {
  const offscreen = document.createElement("canvas")
  offscreen.width = canvasW
  offscreen.height = canvasH
  const octx = offscreen.getContext("2d", { alpha: false })
  if (octx) {
    const bg = computeCoverRect(img.naturalWidth, img.naturalHeight, canvasW, canvasH)
    const pad = 1.1
    const bw = bg.w * pad
    const bh = bg.h * pad
    octx.save()
    octx.filter = "blur(24px) brightness(0.58)"
    octx.drawImage(img, (canvasW - bw) / 2, (canvasH - bh) / 2, bw, bh)
    octx.restore()
    octx.fillStyle = "rgba(8, 10, 16, 0.28)"
    octx.fillRect(0, 0, canvasW, canvasH)
  }
  return offscreen
}

/**
 * Synthesize a seamless 8-second loopable ambient/promo background music AudioBuffer
 * using pure Web Audio synthesis (zero external assets).
 */
export function synthesizePresetMusicBuffer(
  audioCtx: BaseAudioContext,
  preset: Exclude<BackgroundMusicPreset, "none" | "custom">
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate
  const duration = 8.0
  const length = Math.floor(sampleRate * duration)
  const buffer = audioCtx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  // Chord progressions (Hz)
  const chords =
    preset === "upbeat_promo"
      ? [
          [261.63, 329.63, 392.0], // C
          [196.0, 246.94, 293.66], // G
          [220.0, 261.63, 329.63], // Am
          [174.61, 220.0, 261.63], // F
        ]
      : preset === "soft_vlog"
        ? [
            [261.63, 329.63, 392.0, 493.88], // Cmaj7
            [220.0, 261.63, 329.63, 392.0], // Am7
            [174.61, 220.0, 261.63, 329.63], // Fmaj7
            [196.0, 246.94, 293.66, 392.0], // G6
          ]
        : [
            [220.0, 261.63, 329.63, 392.0], // Am7
            [174.61, 220.0, 261.63, 329.63], // Fmaj7
            [261.63, 329.63, 392.0, 493.88], // Cmaj7
            [196.0, 246.94, 293.66, 349.23], // G7
          ]

  const chordDuration = duration / chords.length
  const beatDur = preset === "upbeat_promo" ? 0.5 : preset === "soft_vlog" ? 0.6667 : 0.8

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / chordDuration))
    const chordLocalT = t - chordIdx * chordDuration
    const chord = chords[chordIdx]

    // Smooth chord pad envelope
    const padEnv =
      Math.min(1, chordLocalT / 0.08) *
      Math.min(1, (chordDuration - chordLocalT) / 0.08)

    let pad = 0
    for (let n = 0; n < chord.length; n += 1) {
      const freq = chord[n]
      pad += Math.sin(2 * Math.PI * freq * t) * (preset === "calm_lofi" ? 0.16 : 0.14)
      if (preset === "upbeat_promo") {
        pad += Math.sin(2 * Math.PI * freq * 2 * t) * 0.03
      }
    }

    // Bass root
    const bassFreq = chord[0] * 0.5
    const beatLocal = t % beatDur
    const bassPulse =
      preset === "upbeat_promo"
        ? Math.exp(-beatLocal * 6.5) * 0.24
        : Math.exp(-beatLocal * 3.2) * 0.16
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassPulse

    // Subtle percussive / pluck accent
    let accent = 0
    if (preset === "upbeat_promo") {
      const kickEnv = Math.exp(-beatLocal * 28)
      const kickFreq = 55 + 85 * Math.exp(-beatLocal * 35)
      accent = Math.sin(2 * Math.PI * kickFreq * beatLocal) * kickEnv * 0.22
    } else if (preset === "soft_vlog") {
      const noteIdx = Math.floor(t / (beatDur * 0.5)) % chord.length
      const pluckT = t % (beatDur * 0.5)
      accent =
        Math.sin(2 * Math.PI * chord[noteIdx] * 2 * t) *
        Math.exp(-pluckT * 7) *
        0.09
    }

    const sample = (pad * padEnv + bass + accent) * 0.72
    data[i] = Math.max(-0.95, Math.min(0.95, sample))
  }

  return buffer
}

/**
 * Analyze voiceover speech activity and schedule GainNode auto-ducking
 * so background music dips to ~12% while speaking and rises smoothly during pauses.
 */
function scheduleAutoDucking(
  musicGain: GainNode,
  voiceoverBuffer: AudioBuffer,
  startTime: number,
  baseVolume: number,
  duckVolume = 0.12
) {
  const channelData = voiceoverBuffer.getChannelData(0)
  const sampleRate = voiceoverBuffer.sampleRate
  const windowSec = 0.06
  const windowSamples = Math.max(1, Math.floor(sampleRate * windowSec))
  const totalWindows = Math.ceil(channelData.length / windowSamples)

  const threshold = 0.015
  const hangoverWindows = 4 // ~240ms before rising back up
  let silenceCounter = hangoverWindows
  let isDucked = false

  musicGain.gain.setValueAtTime(baseVolume, startTime)

  for (let w = 0; w < totalWindows; w += 1) {
    const startIdx = w * windowSamples
    const endIdx = Math.min(channelData.length, startIdx + windowSamples)
    let sumSq = 0
    for (let i = startIdx; i < endIdx; i += 1) {
      const s = channelData[i]
      sumSq += s * s
    }
    const rms = Math.sqrt(sumSq / Math.max(1, endIdx - startIdx))
    const timeAt = startTime + w * windowSec

    if (rms > threshold) {
      silenceCounter = 0
      if (!isDucked) {
        isDucked = true
        musicGain.gain.setTargetAtTime(Math.min(baseVolume, duckVolume), timeAt, 0.07)
      }
    } else {
      silenceCounter += 1
      if (isDucked && silenceCounter >= hangoverWindows) {
        isDucked = false
        musicGain.gain.setTargetAtTime(baseVolume, timeAt, 0.18)
      }
    }
  }
}

let activePreviewCleanup: (() => void) | null = null

export function stopBackgroundMusicPreview() {
  if (activePreviewCleanup) {
    activePreviewCleanup()
    activePreviewCleanup = null
  }
}

export async function previewBackgroundMusic(
  preset: BackgroundMusicPreset,
  customFile?: File | null
): Promise<void> {
  stopBackgroundMusicPreview()
  if (preset === "none" || typeof window === "undefined") return

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return

  const ctx = new AudioCtx()
  if (ctx.state === "suspended") {
    await ctx.resume()
  }

  let buffer: AudioBuffer
  if (preset === "custom") {
    if (!customFile) {
      await ctx.close().catch(() => {})
      return
    }
    buffer = await ctx.decodeAudioData(await customFile.arrayBuffer())
  } else {
    buffer = synthesizePresetMusicBuffer(ctx, preset)
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const gain = ctx.createGain()
  gain.gain.value = 0.45
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start(0)

  const timer = window.setTimeout(() => {
    stopBackgroundMusicPreview()
  }, 8000)

  activePreviewCleanup = () => {
    window.clearTimeout(timer)
    try {
      src.stop()
    } catch {
      // Ignore
    }
    ctx.close().catch(() => {})
  }
}

async function loadImageElements(files: File[]): Promise<{
  images: HTMLImageElement[]
  urls: string[]
}> {
  const urls: string[] = []
  const images: HTMLImageElement[] = []

  for (const file of files) {
    const url = URL.createObjectURL(file)
    urls.push(url)
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))
      img.src = url
    })
    images.push(img)
  }

  return { images, urls }
}

/**
 * Merge a video file OR a set of photos (2-10 images) with a synthesized voiceover track
 * and optional background music (with auto-ducking) entirely on the client using
 * <canvas>, AudioContext, and MediaRecorder.
 */
export async function mergeVideoWithVoiceover({
  videoFile,
  imageFiles = [],
  voiceoverAudio,
  originalVolume,
  voiceoverVolume = 1.0,
  durationSyncMode,
  aspectRatio,
  enableBlurredBackground = true,
  backgroundMusicPreset = "none",
  backgroundMusicFile = null,
  backgroundMusicVolume = 0.38,
  enableAutoDucking = true,
  enableSubtitles = false,
  subtitleScript = "",
  subtitleStyle = "dark_pill",
  watermarkText = "",
  onProgress,
  signal,
}: MergeVideoAudioOptions): Promise<MergeVideoAudioResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Client-side video merging is not supported in this browser.")
  }

  const isPhotoMode = !videoFile && imageFiles.length > 0
  if (!videoFile && !isPhotoMode) {
    throw new Error("Please upload a video or photos before creating the video.")
  }

  if (signal?.aborted) {
    throw new DOMException("Merge cancelled.", "AbortError")
  }

  const mimeType = pickSupportedVideoMimeType()
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const audioCtx = new AudioCtx()
  let rafId = 0
  let combinedStream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let voiceoverSource: AudioBufferSourceNode | null = null
  let musicSource: AudioBufferSourceNode | null = null
  let videoObjectUrl: string | null = null
  let video: HTMLVideoElement | null = null
  let photoUrls: string[] = []

  const cleanup = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    try {
      voiceoverSource?.stop()
    } catch {
      // Ignore
    }
    try {
      musicSource?.stop()
    } catch {
      // Ignore
    }
    if (video) {
      try {
        video.pause()
        video.loop = false
        video.removeAttribute("src")
        video.load()
      } catch {
        // Ignore
      }
    }
    combinedStream?.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore
      }
    })
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl)
    }
    for (const u of photoUrls) {
      URL.revokeObjectURL(u)
    }
    audioCtx.close().catch(() => {})
  }

  try {
    onProgress?.(0)

    if (audioCtx.state === "suspended") {
      await audioCtx.resume()
    }

    const voiceoverBuffer =
      voiceoverAudio instanceof AudioBuffer
        ? voiceoverAudio
        : await audioCtx.decodeAudioData(await voiceoverAudio.arrayBuffer())

    const voiceDuration =
      Number.isFinite(voiceoverBuffer.duration) && voiceoverBuffer.duration > 0
        ? voiceoverBuffer.duration
        : 5

    let sourceWidth = 720
    let sourceHeight = 1280
    let videoDuration = voiceDuration
    let loadedImages: HTMLImageElement[] = []

    if (isPhotoMode) {
      const loaded = await loadImageElements(imageFiles)
      loadedImages = loaded.images
      photoUrls = loaded.urls
      sourceWidth = loadedImages[0]?.naturalWidth || 720
      sourceHeight = loadedImages[0]?.naturalHeight || 1280
    } else if (videoFile) {
      videoObjectUrl = URL.createObjectURL(videoFile)
      video = document.createElement("video")
      video.src = videoObjectUrl
      video.playsInline = true
      video.preload = "auto"
      video.crossOrigin = "anonymous"

      await new Promise<void>((resolve, reject) => {
        if (!video) {
          reject(new Error("Video element not initialized."))
          return
        }
        const onLoaded = () => {
          cleanupListeners()
          resolve()
        }
        const onError = () => {
          cleanupListeners()
          reject(new Error("Could not load video metadata for merging."))
        }
        const cleanupListeners = () => {
          video?.removeEventListener("loadedmetadata", onLoaded)
          video?.removeEventListener("error", onError)
        }
        video.addEventListener("loadedmetadata", onLoaded)
        video.addEventListener("error", onError)
      })

      videoDuration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
      sourceWidth = video.videoWidth || 720
      sourceHeight = video.videoHeight || 1280
    }

    if (signal?.aborted) {
      throw new DOMException("Merge cancelled.", "AbortError")
    }

    const resolvedAspect: VideoAspectRatio =
      aspectRatio ?? (isPhotoMode ? "9:16" : "original")
    const { width, height } = resolveCanvasDimensions(
      resolvedAspect,
      sourceWidth,
      sourceHeight
    )

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) {
      throw new Error("Could not initialize 2D canvas for video rendering.")
    }

    const preBlurredPhotos = isPhotoMode && enableBlurredBackground
      ? loadedImages.map((img) => createPreBlurredPhotoCanvas(img, width, height))
      : []

    const resolvedSyncMode: VideoDurationSyncMode = isPhotoMode
      ? "loop_video"
      : durationSyncMode ?? (voiceDuration > videoDuration ? "loop_video" : "fit_video")

    const targetDuration =
      resolvedSyncMode === "loop_video" ? voiceDuration : videoDuration

    if (video && resolvedSyncMode === "loop_video" && voiceDuration > videoDuration) {
      video.loop = true
    }

    const subtitles =
      enableSubtitles && subtitleScript.trim()
        ? buildSubtitleSegments(subtitleScript, voiceDuration)
        : []

    const streamDestination = audioCtx.createMediaStreamDestination()

    // Route original video audio (do not mute video element)
    if (video) {
      const videoAudioSource = audioCtx.createMediaElementSource(video)
      const originalGain = audioCtx.createGain()
      originalGain.gain.value = originalVolume
      videoAudioSource.connect(originalGain)
      originalGain.connect(streamDestination)
    }

    // Route AI voiceover audio
    voiceoverSource = audioCtx.createBufferSource()
    voiceoverSource.buffer = voiceoverBuffer
    const voiceoverGain = audioCtx.createGain()
    voiceoverGain.gain.value = voiceoverVolume
    voiceoverSource.connect(voiceoverGain)
    voiceoverGain.connect(streamDestination)

    // Route optional Background Music with Auto-Ducking
    let musicGain: GainNode | null = null
    if (backgroundMusicPreset !== "none") {
      let musicBuffer: AudioBuffer | null = null
      if (backgroundMusicPreset === "custom" && backgroundMusicFile) {
        musicBuffer = await audioCtx.decodeAudioData(await backgroundMusicFile.arrayBuffer())
      } else if (backgroundMusicPreset !== "custom") {
        musicBuffer = synthesizePresetMusicBuffer(audioCtx, backgroundMusicPreset)
      }

      if (musicBuffer) {
        musicSource = audioCtx.createBufferSource()
        musicSource.buffer = musicBuffer
        musicSource.loop = true
        musicGain = audioCtx.createGain()
        musicGain.gain.value = backgroundMusicVolume
        musicSource.connect(musicGain)
        musicGain.connect(streamDestination)
      }
    }

    const canvasStream = canvas.captureStream(30)
    combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...streamDestination.stream.getAudioTracks(),
    ])

    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    }
    if (mimeType) {
      recorderOptions.mimeType = mimeType
    }

    recorder = new MediaRecorder(combinedStream, recorderOptions)
    const recordedChunks: BlobPart[] = []

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    }

    const drawSlideshowFrame = (elapsedSec: number) => {
      const count = loadedImages.length
      if (count === 0) return
      const sliceDuration = targetDuration / count
      const fadeDuration = Math.min(0.45, sliceDuration * 0.25)
      const clampedT = Math.min(Math.max(0, elapsedSec), Math.max(0.001, targetDuration - 0.001))
      const slideIdx = Math.min(count - 1, Math.floor(clampedT / sliceDuration))
      const localT = (clampedT - slideIdx * sliceDuration) / sliceDuration

      const getKenBurns = (idx: number, progress: number) => {
        const mode = idx % 4
        if (mode === 0) {
          return { zoomScale: 1 + progress * 0.08, panX: progress * 8, panY: progress * 5 }
        }
        if (mode === 1) {
          return { zoomScale: 1.08 - progress * 0.08, panX: -progress * 8, panY: 0 }
        }
        if (mode === 2) {
          return { zoomScale: 1 + progress * 0.07, panX: -progress * 6, panY: -progress * 6 }
        }
        return { zoomScale: 1.07 - progress * 0.07, panX: progress * 6, panY: -progress * 4 }
      }

      const currentImg = loadedImages[slideIdx]
      const kb = getKenBurns(slideIdx, localT)

      drawFramedMedia(ctx, currentImg, currentImg.naturalWidth, currentImg.naturalHeight, width, height, {
        blurredBg: enableBlurredBackground,
        preBlurredBg: preBlurredPhotos[slideIdx] ?? null,
        zoomScale: kb.zoomScale,
        panX: kb.panX,
        panY: kb.panY,
        alpha: 1,
      })

      // Crossfade into next slide near end of slice
      const timeRemainingInSlide = (slideIdx + 1) * sliceDuration - clampedT
      if (slideIdx < count - 1 && fadeDuration > 0 && timeRemainingInSlide < fadeDuration) {
        const nextAlpha = 1 - timeRemainingInSlide / fadeDuration
        const nextImg = loadedImages[slideIdx + 1]
        const nextKb = getKenBurns(slideIdx + 1, 0)
        drawFramedMedia(ctx, nextImg, nextImg.naturalWidth, nextImg.naturalHeight, width, height, {
          blurredBg: enableBlurredBackground,
          preBlurredBg: preBlurredPhotos[slideIdx + 1] ?? null,
          zoomScale: nextKb.zoomScale,
          panX: nextKb.panX,
          panY: nextKb.panY,
          alpha: Math.max(0, Math.min(1, nextAlpha)),
        })
      }
    }

    const drawVideoFrame = () => {
      if (!video) return
      drawFramedMedia(ctx, video, video.videoWidth || width, video.videoHeight || height, width, height, {
        blurredBg: enableBlurredBackground,
      })
    }

    // Draw initial frame before starting MediaRecorder
    if (isPhotoMode) {
      drawSlideshowFrame(0)
    } else if (video) {
      video.currentTime = 0
      drawVideoFrame()
    }

    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      if (!recorder) {
        reject(new Error("MediaRecorder failed to initialize."))
        return
      }

      let finished = false

      const finishRecording = () => {
        if (finished) return
        finished = true
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        try {
          voiceoverSource?.stop()
        } catch {
          // Ignore
        }
        try {
          musicSource?.stop()
        } catch {
          // Ignore
        }
        if (recorder && recorder.state !== "inactive") {
          recorder.stop()
        }
      }

      const handleAbort = () => {
        if (finished) return
        finished = true
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        try {
          if (recorder && recorder.state !== "inactive") {
            recorder.stop()
          }
        } catch {
          // Ignore
        }
        reject(new DOMException("Merge cancelled.", "AbortError"))
      }

      signal?.addEventListener("abort", handleAbort, { once: true })

      recorder.onstop = () => {
        signal?.removeEventListener("abort", handleAbort)
        if (signal?.aborted) return
        const resolvedMime = recorder?.mimeType || mimeType || "video/webm"
        resolve(new Blob(recordedChunks, { type: resolvedMime }))
      }

      recorder.onerror = () => {
        signal?.removeEventListener("abort", handleAbort)
        reject(new Error("MediaRecorder encountered an error while exporting video."))
      }

      if (video && resolvedSyncMode === "fit_video") {
        video.addEventListener("ended", finishRecording, { once: true })
      }

      let startPerfMs = 0

      const drawOverlays = (elapsedSec: number) => {
        if (watermarkText.trim()) {
          drawWatermarkOverlay(ctx, width, height, watermarkText)
        }
        if (subtitles.length > 0) {
          const active = subtitles.find(
            (seg) => elapsedSec >= seg.startTime && elapsedSec <= seg.endTime
          )
          if (active) {
            drawSubtitleOverlay(ctx, width, height, active.text, subtitleStyle)
          }
        }
      }

      const renderFrame = () => {
        if (finished || signal?.aborted) return
        const elapsedSec = startPerfMs > 0 ? (performance.now() - startPerfMs) / 1000 : 0

        if (isPhotoMode) {
          drawSlideshowFrame(elapsedSec)
          drawOverlays(elapsedSec)
          const pct = Math.min(99, Math.max(1, Math.round((elapsedSec / targetDuration) * 100)))
          onProgress?.(pct)
        } else if (video && !video.paused && !video.ended) {
          drawVideoFrame()
          drawOverlays(elapsedSec)
          const pct = Math.min(99, Math.max(1, Math.round((elapsedSec / targetDuration) * 100)))
          onProgress?.(pct)
        }

        const reachedEnd =
          !isPhotoMode && video && resolvedSyncMode === "fit_video"
            ? video.ended || elapsedSec >= targetDuration - 0.02
            : elapsedSec >= targetDuration - 0.02

        if (reachedEnd) {
          if (isPhotoMode) {
            drawSlideshowFrame(targetDuration)
          } else {
            drawVideoFrame()
          }
          drawOverlays(elapsedSec)
          finishRecording()
          return
        }
        rafId = requestAnimationFrame(renderFrame)
      }

      recorder.start(250)
      startPerfMs = performance.now()
      const audioStartTime = audioCtx.currentTime
      voiceoverSource?.start(audioStartTime)
      if (musicSource && musicGain) {
        if (enableAutoDucking) {
          scheduleAutoDucking(
            musicGain,
            voiceoverBuffer,
            audioStartTime,
            backgroundMusicVolume,
            0.12
          )
        }
        musicSource.start(audioStartTime)
      }

      if (isPhotoMode) {
        rafId = requestAnimationFrame(renderFrame)
      } else if (video) {
        video
          .play()
          .then(() => {
            rafId = requestAnimationFrame(renderFrame)
          })
          .catch((playErr) => {
            reject(
              new Error(
                playErr instanceof Error
                  ? `Could not start video playback for merging: ${playErr.message}`
                  : "Could not start video playback for merging."
              )
            )
          })
      }
    })

    onProgress?.(100)
    const finalMime = resultBlob.type || mimeType || "video/webm"
    const fileExtension: "mp4" | "webm" = finalMime.toLowerCase().includes("mp4") ? "mp4" : "webm"
    const videoUrl = URL.createObjectURL(resultBlob)

    return {
      blob: resultBlob,
      videoUrl,
      mimeType: finalMime,
      fileExtension,
      durationSeconds: targetDuration,
    }
  } finally {
    cleanup()
  }
}

export interface AutoCutSegment {
  start: number
  end: number
  isSilent: boolean
}

export interface VideoSilenceAnalysis {
  audioBuffer: AudioBuffer
  originalDuration: number
  keptDuration: number
  trimmedSeconds: number
  keepSegments: Array<{ start: number; end: number }>
  silentSegments: Array<{ start: number; end: number }>
  timeline: AutoCutSegment[]
}

export interface AnalyzeSilenceOptions {
  thresholdDb?: number
  minSilenceSeconds?: number
  paddingSeconds?: number
}

/**
 * Decode a video file's audio track via Web Audio API (`decodeAudioData`)
 * and detect silent dead-air pauses above `minSilenceSeconds`.
 */
export async function analyzeVideoSilence(
  file: File,
  options: AnalyzeSilenceOptions = {}
): Promise<VideoSilenceAnalysis> {
  const thresholdDb = options.thresholdDb ?? -35
  const minSilenceSeconds = options.minSilenceSeconds ?? 0.6
  const paddingSeconds = options.paddingSeconds ?? 0.08

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  let audioBuffer: AudioBuffer
  try {
    const arrayBuffer = await file.arrayBuffer()
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    await ctx.close().catch(() => {})
  }

  const originalDuration = audioBuffer.duration
  if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
    throw new Error("Could not read audio duration from this video.")
  }

  const sampleRate = audioBuffer.sampleRate
  const frameDuration = 0.02 // 20ms analysis window
  const frameSize = Math.max(1, Math.floor(sampleRate * frameDuration))
  const totalSamples = audioBuffer.length
  const totalFrames = Math.ceil(totalSamples / frameSize)
  const thresholdLinear = Math.pow(10, thresholdDb / 20)

  const channels: Float32Array[] = []
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
    channels.push(audioBuffer.getChannelData(ch))
  }

  const isFrameSilent = new Uint8Array(totalFrames)
  for (let f = 0; f < totalFrames; f += 1) {
    const start = f * frameSize
    const end = Math.min(totalSamples, start + frameSize)
    let sumSq = 0
    let count = 0
    for (let i = start; i < end; i += 2) {
      let peak = 0
      for (let c = 0; c < channels.length; c += 1) {
        const v = Math.abs(channels[c][i])
        if (v > peak) peak = v
      }
      sumSq += peak * peak
      count += 1
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0
    isFrameSilent[f] = rms < thresholdLinear ? 1 : 0
  }

  // Group contiguous silent runs >= minSilenceSeconds
  const rawSilentRuns: Array<{ start: number; end: number }> = []
  let runStartFrame: number | null = null

  for (let f = 0; f < totalFrames; f += 1) {
    if (isFrameSilent[f] === 1 && runStartFrame === null) {
      runStartFrame = f
    } else if (isFrameSilent[f] === 0 && runStartFrame !== null) {
      const startSec = runStartFrame * frameDuration
      const endSec = Math.min(originalDuration, f * frameDuration)
      if (endSec - startSec >= minSilenceSeconds) {
        rawSilentRuns.push({ start: startSec, end: endSec })
      }
      runStartFrame = null
    }
  }
  if (runStartFrame !== null) {
    const startSec = runStartFrame * frameDuration
    const endSec = originalDuration
    if (endSec - startSec >= minSilenceSeconds) {
      rawSilentRuns.push({ start: startSec, end: endSec })
    }
  }

  // Apply padding around kept speech so words aren't clipped
  const paddedSilentRuns: Array<{ start: number; end: number }> = []
  for (const run of rawSilentRuns) {
    const trimmedStart = run.start === 0 ? 0 : run.start + paddingSeconds
    const trimmedEnd =
      run.end >= originalDuration - 0.02 ? originalDuration : run.end - paddingSeconds
    if (trimmedEnd - trimmedStart >= Math.max(0.25, minSilenceSeconds * 0.5)) {
      paddedSilentRuns.push({ start: trimmedStart, end: trimmedEnd })
    }
  }

  // Build keepSegments as complement of paddedSilentRuns
  const keepSegments: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const silent of paddedSilentRuns) {
    if (silent.start > cursor + 0.02) {
      keepSegments.push({ start: cursor, end: silent.start })
    }
    cursor = Math.max(cursor, silent.end)
  }
  if (cursor < originalDuration - 0.02) {
    keepSegments.push({ start: cursor, end: originalDuration })
  }

  // If entire video was silent, keep a tiny fallback or return empty keepSegments
  const timeline: AutoCutSegment[] = []
  let tCursor = 0
  for (const seg of keepSegments) {
    if (seg.start > tCursor + 0.01) {
      timeline.push({ start: tCursor, end: seg.start, isSilent: true })
    }
    timeline.push({ start: seg.start, end: seg.end, isSilent: false })
    tCursor = seg.end
  }
  if (tCursor < originalDuration - 0.01) {
    timeline.push({ start: tCursor, end: originalDuration, isSilent: true })
  }

  const keptDuration = keepSegments.reduce((sum, s) => sum + (s.end - s.start), 0)
  const trimmedSeconds = Math.max(0, originalDuration - keptDuration)

  return {
    audioBuffer,
    originalDuration,
    keptDuration,
    trimmedSeconds,
    keepSegments,
    silentSegments: paddedSilentRuns,
    timeline,
  }
}

export interface ExportAutoCutOptions {
  videoFile: File
  analysis: VideoSilenceAnalysis
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/**
 * Render and export a continuous video with silent dead-air segments skipped.
 */
export async function exportAutoCutVideo(
  options: ExportAutoCutOptions
): Promise<MergeVideoAudioResult> {
  const { videoFile, analysis, onProgress, signal } = options
  if (analysis.keepSegments.length === 0) {
    throw new Error("No speech segments detected to export. Try lowering the silence threshold.")
  }

  const mimeType = pickSupportedVideoMimeType()
  if (!mimeType) {
    throw new Error("Your browser does not support video recording export.")
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const videoUrlObj = URL.createObjectURL(videoFile)
  const video = document.createElement("video")
  video.src = videoUrlObj
  video.muted = true
  video.playsInline = true
  video.preload = "auto"

  const audioCtx = new AudioCtx()
  let recorder: MediaRecorder | null = null
  let rafId = 0

  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId)
    try {
      video.pause()
      video.removeAttribute("src")
      video.load()
    } catch {
      // Ignore
    }
    URL.revokeObjectURL(videoUrlObj)
    audioCtx.close().catch(() => {})
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve()
      const onErr = () => reject(new Error("Could not load video file for Auto-Cut export."))
      video.addEventListener("loadedmetadata", onLoaded, { once: true })
      video.addEventListener("error", onErr, { once: true })
    })

    if (signal?.aborted) {
      throw new DOMException("Export aborted", "AbortError")
    }

    const size = computeCanvasSize(video.videoWidth || 720, video.videoHeight || 1280)
    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const ctx2d = canvas.getContext("2d")
    if (!ctx2d) {
      throw new Error("Could not initialize 2D canvas context.")
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume()
    }

    const audioDest = audioCtx.createMediaStreamDestination()
    const canvasStream = canvas.captureStream(30)
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ])

    const chunks: BlobPart[] = []
    recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    })
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    const stoppedPromise = new Promise<Blob>((resolve, reject) => {
      if (!recorder) return
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }))
      }
      recorder.onerror = () => {
        reject(new Error("MediaRecorder failed during Auto-Cut export."))
      }
    })

    const seekTo = (timeSec: number) =>
      new Promise<void>((resolve) => {
        const clamped = Math.max(0, Math.min(video.duration || timeSec, timeSec))
        if (Math.abs(video.currentTime - clamped) < 0.01) {
          resolve()
          return
        }
        const onSeeked = () => resolve()
        video.addEventListener("seeked", onSeeked, { once: true })
        video.currentTime = clamped
      })

    recorder.start(250)
    let completedKept = 0
    const totalKept = Math.max(0.1, analysis.keptDuration)

    for (const seg of analysis.keepSegments) {
      if (signal?.aborted) {
        recorder.stop()
        throw new DOMException("Export aborted", "AbortError")
      }

      const segDuration = Math.max(0.05, seg.end - seg.start)
      await seekTo(seg.start)
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)

      const src = audioCtx.createBufferSource()
      src.buffer = analysis.audioBuffer
      const gain = audioCtx.createGain()
      const now = audioCtx.currentTime
      const fade = Math.min(0.012, segDuration / 4)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(1, now + fade)
      gain.gain.setValueAtTime(1, Math.max(now + fade, now + segDuration - fade))
      gain.gain.linearRampToValueAtTime(0, now + segDuration)
      src.connect(gain)
      gain.connect(audioDest)

      src.start(now, seg.start, segDuration)
      await video.play()

      await new Promise<void>((resolve) => {
        const step = () => {
          if (signal?.aborted) {
            video.pause()
            try {
              src.stop()
            } catch {
              // Ignore
            }
            resolve()
            return
          }

          ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)
          const segElapsed = Math.max(0, Math.min(segDuration, video.currentTime - seg.start))
          const pct = Math.min(99, Math.round(((completedKept + segElapsed) / totalKept) * 100))
          onProgress?.(pct)

          if (video.currentTime >= seg.end - 0.015 || video.ended) {
            video.pause()
            try {
              src.stop()
            } catch {
              // Ignore
            }
            resolve()
            return
          }
          rafId = requestAnimationFrame(step)
        }
        rafId = requestAnimationFrame(step)
      })

      completedKept += segDuration
    }

    if (signal?.aborted) {
      throw new DOMException("Export aborted", "AbortError")
    }

    if (recorder.state !== "inactive") {
      recorder.stop()
    }
    const resultBlob = await stoppedPromise
    onProgress?.(100)

    const finalMime = resultBlob.type || mimeType || "video/webm"
    const fileExtension: "mp4" | "webm" = finalMime.toLowerCase().includes("mp4") ? "mp4" : "webm"
    const videoUrl = URL.createObjectURL(resultBlob)

    return {
      blob: resultBlob,
      videoUrl,
      mimeType: finalMime,
      fileExtension,
      durationSeconds: analysis.keptDuration,
    }
  } finally {
    cleanup()
  }
}

/**
 * Decode an audio Blob (e.g. a microphone recording or uploaded voice file)
 * to determine its exact playback duration in seconds.
 */
export async function getAudioBlobDurationSeconds(blob: Blob): Promise<number> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  if (AudioCtx) {
    const ctx = new AudioCtx()
    try {
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
      if (Number.isFinite(buffer.duration) && buffer.duration > 0) {
        return buffer.duration
      }
    } catch {
      // Fallback to HTMLAudioElement below
    } finally {
      await ctx.close().catch(() => {})
    }
  }

  return await new Promise<number>((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      URL.revokeObjectURL(url)
      resolve(dur)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    audio.src = url
  })
}

