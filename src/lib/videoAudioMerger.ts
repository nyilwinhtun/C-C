import {
  decodeAudioBlob,
  getRecorderTimesliceMs,
  isAppleTouchDevice,
} from "@/lib/iosAudio"

export type OriginalAudioVolume = 0 | 0.15 | 0.5
export type VideoDurationSyncMode = "loop_video" | "fit_video"
export type VideoAspectRatio = "original" | "9:16" | "1:1" | "16:9"
export type VideoExportQualityPreset = "mobile_fast" | "studio_hd"
export type BackgroundMusicPreset = "none" | "upbeat_promo" | "soft_vlog" | "calm_lofi" | "custom"
export type SubtitleStylePreset = "dark_pill" | "yellow_box" | "bold_outline"

export const VIDEO_BLOB_REVOKE_DELAY_MS = 60_000

/**
 * Delay URL.revokeObjectURL by at least 60s so iOS Safari and Android Chrome
 * can finish background video/file downloads before the blob URL is released.
 */
export function revokeBlobUrlAfterDelay(
  url: string | null | undefined,
  delayMs = VIDEO_BLOB_REVOKE_DELAY_MS
): void {
  if (!url) return
  const safeDelay = Math.max(VIDEO_BLOB_REVOKE_DELAY_MS, delayMs)
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // Ignore already-revoked URLs
      }
    }, safeDelay)
  } else {
    URL.revokeObjectURL(url)
  }
}

export function detectMobileVideoDevice(): boolean {
  if (typeof window === "undefined") return false
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true
  }
  if (window.innerWidth < 768) return true
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    return true
  }
  return false
}

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
  qualityPreset?: VideoExportQualityPreset
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
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
] as const

function pickSupportedVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.")
  }
  for (const candidate of MIME_CANDIDATES) {
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

function createSafeVideoMediaRecorder(
  stream: MediaStream,
  mimeType: string,
  qualityPreset: VideoExportQualityPreset
): MediaRecorder {
  const videoBitsPerSecond = qualityPreset === "mobile_fast" ? 2_500_000 : 4_000_000
  const audioBitsPerSecond = qualityPreset === "mobile_fast" ? 96_000 : 128_000
  const attempts: MediaRecorderOptions[] = []
  if (mimeType) {
    attempts.push({ mimeType, videoBitsPerSecond, audioBitsPerSecond })
    attempts.push({ mimeType, videoBitsPerSecond })
    attempts.push({ mimeType })
  } else {
    attempts.push({ videoBitsPerSecond, audioBitsPerSecond })
  }

  for (const opts of attempts) {
    try {
      return new MediaRecorder(stream, opts)
    } catch {
      // Fallback if WebKit rejects bitrate or mimeType options
    }
  }
  return new MediaRecorder(stream)
}

function resolveRecordedVideoMime(
  recorderMimeType: string | undefined,
  chunks: BlobPart[],
  requestedMime: string
): string {
  const firstChunkMime =
    chunks.length > 0 && chunks[0] instanceof Blob ? chunks[0].type : ""
  const resolved = recorderMimeType || firstChunkMime || requestedMime
  if (resolved) return resolved

  return isAppleTouchDevice() ? "video/mp4" : "video/webm"
}

function getEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function computeCanvasSize(
  videoWidth: number,
  videoHeight: number,
  maxDimension = 1920
): { width: number; height: number } {
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
  sourceHeight: number,
  qualityPreset: VideoExportQualityPreset = "studio_hd"
): { width: number; height: number } {
  if (qualityPreset === "mobile_fast") {
    switch (aspectRatio) {
      case "9:16":
        return { width: 540, height: 960 }
      case "1:1":
        return { width: 540, height: 540 }
      case "16:9":
        return { width: 960, height: 540 }
      case "original":
      default:
        return computeCanvasSize(sourceWidth, sourceHeight, 960)
    }
  }

  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 }
    case "1:1":
      return { width: 720, height: 720 }
    case "16:9":
      return { width: 1280, height: 720 }
    case "original":
    default:
      return computeCanvasSize(sourceWidth, sourceHeight, 1920)
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
  qualityPreset,
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
  let originalAudioSource: AudioBufferSourceNode | null = null
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
      originalAudioSource?.stop()
    } catch {
      // Ignore
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
      video.muted = true
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

    const resolvedQuality: VideoExportQualityPreset =
      qualityPreset ?? (detectMobileVideoDevice() ? "mobile_fast" : "studio_hd")
    const targetFps = resolvedQuality === "mobile_fast" ? 24 : 30
    const resolvedAspect: VideoAspectRatio =
      aspectRatio ?? (isPhotoMode ? "9:16" : "original")
    const { width, height } = resolveCanvasDimensions(
      resolvedAspect,
      sourceWidth,
      sourceHeight,
      resolvedQuality
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

    // Route original video audio: prefer decoding via Web Audio so video.muted=true
    // stays intact (iOS Safari blocks unmuted video.play() after async awaits).
    if (video && videoFile && originalVolume > 0) {
      let decodedOriginal: AudioBuffer | null = null
      try {
        decodedOriginal = await decodeAudioBlob(videoFile)
      } catch {
        decodedOriginal = null
      }

      if (decodedOriginal) {
        originalAudioSource = audioCtx.createBufferSource()
        originalAudioSource.buffer = decodedOriginal
        originalAudioSource.loop = video.loop
        const originalGain = audioCtx.createGain()
        originalGain.gain.value = originalVolume
        originalAudioSource.connect(originalGain)
        originalGain.connect(streamDestination)
      } else {
        video.muted = false
        const videoAudioSource = audioCtx.createMediaElementSource(video)
        const originalGain = audioCtx.createGain()
        originalGain.gain.value = originalVolume
        videoAudioSource.connect(originalGain)
        originalGain.connect(streamDestination)
      }
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

    const canvasStream = canvas.captureStream(targetFps)
    combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...streamDestination.stream.getAudioTracks(),
    ])

    recorder = createSafeVideoMediaRecorder(combinedStream, mimeType, resolvedQuality)
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
          originalAudioSource?.stop()
        } catch {
          // Ignore
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
        const resolvedMime = resolveRecordedVideoMime(
          recorder?.mimeType,
          recordedChunks,
          mimeType
        )
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

      const startRecordingAndAudio = () => {
        if (finished || signal?.aborted || !recorder) return
        const timesliceMs = getRecorderTimesliceMs(mimeType)
        if (timesliceMs !== undefined) {
          recorder.start(timesliceMs)
        } else {
          recorder.start()
        }
        startPerfMs = performance.now()
        const audioStartTime = audioCtx.currentTime
        originalAudioSource?.start(audioStartTime)
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
        rafId = requestAnimationFrame(renderFrame)
      }

      if (isPhotoMode) {
        startRecordingAndAudio()
      } else if (video) {
        video
          .play()
          .then(() => {
            startRecordingAndAudio()
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

