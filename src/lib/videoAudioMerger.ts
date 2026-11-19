export type OriginalAudioVolume = 0 | 0.15 | 0.5
export type VideoDurationSyncMode = "loop_video" | "fit_video"

export interface SubtitleSegment {
  text: string
  startTime: number
  endTime: number
}

export interface MergeVideoAudioOptions {
  videoFile: File
  voiceoverAudio: AudioBuffer | Blob
  originalVolume: OriginalAudioVolume
  voiceoverVolume?: number
  durationSyncMode?: VideoDurationSyncMode
  enableSubtitles?: boolean
  subtitleScript?: string
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

function cleanCaptionScript(raw: string): string {
  return raw
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
  text: string
) {
  const minSide = Math.min(width, height)
  const fontSize = Math.max(18, Math.min(42, Math.round(minSide * 0.042)))
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
  const bottomMargin = Math.round(height * 0.085)
  const boxY = height - bottomMargin - boxHeight

  // Dark translucent rounded pill background
  drawRoundedRectPath(ctx, boxX, boxY, boxWidth, boxHeight, Math.round(fontSize * 0.55))
  ctx.fillStyle = "rgba(10, 12, 18, 0.76)"
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
  ctx.stroke()

  // High-contrast bold white text
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

/**
 * Merge a video file with a synthesized voiceover track entirely on the client
 * using <video>, <canvas>, AudioContext, and MediaRecorder (no backend or
 * SharedArrayBuffer required).
 */
export async function mergeVideoWithVoiceover({
  videoFile,
  voiceoverAudio,
  originalVolume,
  voiceoverVolume = 1.0,
  durationSyncMode,
  enableSubtitles = false,
  subtitleScript = "",
  watermarkText = "",
  onProgress,
  signal,
}: MergeVideoAudioOptions): Promise<MergeVideoAudioResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Client-side video merging is not supported in this browser.")
  }

  if (signal?.aborted) {
    throw new DOMException("Merge cancelled.", "AbortError")
  }

  const mimeType = pickSupportedVideoMimeType()
  const videoObjectUrl = URL.createObjectURL(videoFile)

  const video = document.createElement("video")
  video.src = videoObjectUrl
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    URL.revokeObjectURL(videoObjectUrl)
    throw new Error("Web Audio API is not supported in this browser.")
  }

  const audioCtx = new AudioCtx()
  let rafId = 0
  let combinedStream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let voiceoverSource: AudioBufferSourceNode | null = null

  const cleanup = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    try {
      voiceoverSource?.stop()
    } catch {
      // Ignore if already stopped
    }
    try {
      video.pause()
      video.loop = false
      video.removeAttribute("src")
      video.load()
    } catch {
      // Ignore cleanup errors
    }
    combinedStream?.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore
      }
    })
    URL.revokeObjectURL(videoObjectUrl)
    audioCtx.close().catch(() => {})
  }

  try {
    onProgress?.(0)

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanupListeners()
        resolve()
      }
      const onError = () => {
        cleanupListeners()
        reject(new Error("Could not load video metadata for merging."))
      }
      const cleanupListeners = () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("error", onError)
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("error", onError)
    })

    if (signal?.aborted) {
      throw new DOMException("Merge cancelled.", "AbortError")
    }

    const videoDuration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const { width, height } = computeCanvasSize(
      video.videoWidth || 720,
      video.videoHeight || 1280
    )

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) {
      throw new Error("Could not initialize 2D canvas for video rendering.")
    }

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
        : videoDuration

    const resolvedSyncMode: VideoDurationSyncMode =
      durationSyncMode ?? (voiceDuration > videoDuration ? "loop_video" : "fit_video")

    const targetDuration =
      resolvedSyncMode === "loop_video" ? voiceDuration : videoDuration

    if (resolvedSyncMode === "loop_video" && voiceDuration > videoDuration) {
      video.loop = true
    }

    const subtitles =
      enableSubtitles && subtitleScript.trim()
        ? buildSubtitleSegments(subtitleScript, voiceDuration)
        : []

    const streamDestination = audioCtx.createMediaStreamDestination()

    // Route original video audio (do not set video.muted = true, or MediaElementSource outputs silence)
    const videoAudioSource = audioCtx.createMediaElementSource(video)
    const originalGain = audioCtx.createGain()
    originalGain.gain.value = originalVolume
    videoAudioSource.connect(originalGain)
    originalGain.connect(streamDestination)

    // Route AI voiceover audio at 100%
    voiceoverSource = audioCtx.createBufferSource()
    voiceoverSource.buffer = voiceoverBuffer
    const voiceoverGain = audioCtx.createGain()
    voiceoverGain.gain.value = voiceoverVolume
    voiceoverSource.connect(voiceoverGain)
    voiceoverGain.connect(streamDestination)

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

    // Draw initial frame before starting MediaRecorder
    video.currentTime = 0
    ctx.drawImage(video, 0, 0, width, height)

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

      if (resolvedSyncMode === "fit_video") {
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
            drawSubtitleOverlay(ctx, width, height, active.text)
          }
        }
      }

      const renderFrame = () => {
        if (finished || signal?.aborted) return
        const elapsedSec = startPerfMs > 0 ? (performance.now() - startPerfMs) / 1000 : 0

        if (!video.paused && !video.ended) {
          ctx.drawImage(video, 0, 0, width, height)
          drawOverlays(elapsedSec)
          const pct = Math.min(
            99,
            Math.max(1, Math.round((elapsedSec / targetDuration) * 100))
          )
          onProgress?.(pct)
        }

        const reachedEnd =
          resolvedSyncMode === "fit_video"
            ? video.ended || elapsedSec >= targetDuration - 0.02
            : elapsedSec >= targetDuration - 0.02

        if (reachedEnd) {
          ctx.drawImage(video, 0, 0, width, height)
          drawOverlays(elapsedSec)
          finishRecording()
          return
        }
        rafId = requestAnimationFrame(renderFrame)
      }

      recorder.start(250)
      startPerfMs = performance.now()
      voiceoverSource?.start(0)
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

