export type OriginalAudioVolume = 0 | 0.15 | 0.5

export interface MergeVideoAudioOptions {
  videoFile: File
  voiceoverAudio: AudioBuffer | Blob
  originalVolume: OriginalAudioVolume
  voiceoverVolume?: number
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

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
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

      video.addEventListener("ended", finishRecording, { once: true })

      const renderFrame = () => {
        if (finished || signal?.aborted) return
        if (!video.paused && !video.ended) {
          ctx.drawImage(video, 0, 0, width, height)
          const pct = Math.min(99, Math.max(1, Math.round((video.currentTime / duration) * 100)))
          onProgress?.(pct)
        }
        if (video.ended || video.currentTime >= duration - 0.02) {
          ctx.drawImage(video, 0, 0, width, height)
          finishRecording()
          return
        }
        rafId = requestAnimationFrame(renderFrame)
      }

      recorder.start(250)
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
      durationSeconds: duration,
    }
  } finally {
    cleanup()
  }
}

