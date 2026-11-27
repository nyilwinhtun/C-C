"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Upload,
  Video,
  X,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { FileDropzone } from "@/components/shared/file-dropzone"
import { useImagePaste } from "@/lib/use-image-paste"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, triggerHaptic } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { formatAudioClockDuration } from "@/api/ttsService"
import {
  getAudioContextConstructor,
  getRecorderTimesliceMs,
  unlockIosAudio,
} from "@/lib/iosAudio"
import { revokeBlobUrlAfterDelay } from "@/lib/videoAudioMerger"
import {
  extractForegroundCutout,
  isMobileViewport,
  type ForegroundCutoutMode,
} from "@/lib/mascotCutout"
import {
  createLipSyncAnalyzer,
  drawBroadcastLowerThird,
  drawCaptionBar,
  drawCornerLogoWatermark,
  drawMascotCutoutFrame,
  drawPipPhoneOverlay,
  type CaptionStyle,
  type LipSyncAnalyzer,
  type PipCorner,
  type PresenterStudioSet,
} from "@/lib/vrmLipSync"

type AspectPreset = "9:16" | "1:1"
type FramingPreset = "upper_body" | "close_up"
type RenderQualityPreset = "mobile_fast" | "studio_hd"

const QUALITY_FPS: Record<RenderQualityPreset, number> = {
  mobile_fast: 24,
  studio_hd: 30,
}

const QUALITY_VIDEO_BITRATE: Record<RenderQualityPreset, number> = {
  mobile_fast: 2_500_000,
  studio_hd: 3_500_000,
}

const CANVAS_DIMENSIONS_BY_QUALITY: Record<
  RenderQualityPreset,
  Record<AspectPreset, { width: number; height: number }>
> = {
  mobile_fast: {
    "9:16": { width: 540, height: 960 },
    "1:1": { width: 540, height: 540 },
  },
  studio_hd: {
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 1080, height: 1080 },
  },
}

function encodeCanvasForStorage(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", 0.88)
  if (webp.startsWith("data:image/webp")) return webp
  return canvas.toDataURL("image/png")
}

interface ExportedVideoState {
  url: string
  blob: Blob
  mimeType: string
  extension: "mp4" | "webm"
  fileName: string
}

const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const

function pickVideoRecorderMimeType(): { mimeType: string; extension: "mp4" | "webm" } {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.")
  }
  for (const candidate of VIDEO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return {
          mimeType: candidate,
          extension: candidate.startsWith("video/mp4") ? "mp4" : "webm",
        }
      }
    } catch {
      // Ignore unsupported codec query errors
    }
  }
  return { mimeType: "", extension: "webm" }
}

function createSafeRecorder(
  stream: MediaStream,
  mimeType: string,
  qualityPreset: RenderQualityPreset
): MediaRecorder {
  const videoBitsPerSecond = QUALITY_VIDEO_BITRATE[qualityPreset]
  const audioBitsPerSecond = qualityPreset === "mobile_fast" ? 96_000 : 128_000
  const attempts: MediaRecorderOptions[] = mimeType
    ? [
        { mimeType, videoBitsPerSecond, audioBitsPerSecond },
        { mimeType, videoBitsPerSecond },
        { mimeType },
      ]
    : [{ videoBitsPerSecond }]

  for (const opts of attempts) {
    try {
      return new MediaRecorder(stream, opts)
    } catch {
      // Try next fallback option
    }
  }
  return new MediaRecorder(stream)
}

export function Presenter3DPage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setActivePageKey: state.setActivePageKey,
    }))
  )

  const {
    generatedAudioUrl,
    generatedAudioBlob,
    generatedAudioTitle,
    generatedAudioDuration,
    shopProfile,
    mascotPresets,
    saveMascotPreset,
    deleteMascotPreset,
    presenterMascotDataUrl,
    presenter3dPopCutoutUrl,
    presenterLogoDataUrl,
    presenterStudioSet,
    presenterShowLowerThird,
    presenterShowCornerLogo,
    setPresenterMascotDataUrl,
    setPresenter3dPopCutoutUrl,
    setPresenterLogoDataUrl,
    setPresenterStudioSet,
    setPresenterShowLowerThird,
    setPresenterShowCornerLogo,
  } = useContentStore(
    useShallow((state) => ({
      generatedAudioUrl: state.generatedAudioUrl,
      generatedAudioBlob: state.generatedAudioBlob,
      generatedAudioTitle: state.generatedAudioTitle,
      generatedAudioDuration: state.generatedAudioDuration,
      shopProfile: state.shopProfile,
      mascotPresets: state.mascotPresets,
      saveMascotPreset: state.saveMascotPreset,
      deleteMascotPreset: state.deleteMascotPreset,
      presenterMascotDataUrl: state.presenterMascotDataUrl,
      presenter3dPopCutoutUrl: state.presenter3dPopCutoutUrl,
      presenterLogoDataUrl: state.presenterLogoDataUrl,
      presenterStudioSet: state.presenterStudioSet,
      presenterShowLowerThird: state.presenterShowLowerThird,
      presenterShowCornerLogo: state.presenterShowCornerLogo,
      setPresenterMascotDataUrl: state.setPresenterMascotDataUrl,
      setPresenter3dPopCutoutUrl: state.setPresenter3dPopCutoutUrl,
      setPresenterLogoDataUrl: state.setPresenterLogoDataUrl,
      setPresenterStudioSet: state.setPresenterStudioSet,
      setPresenterShowLowerThird: state.setPresenterShowLowerThird,
      setPresenterShowCornerLogo: state.setPresenterShowCornerLogo,
    }))
  )

  // 2D Mascot Cutout state
  const [photoDims, setPhotoDims] = useState<{ w: number; h: number } | null>(null)
  const [photoName, setPhotoName] = useState("")
  const [photoDataUrl, setPhotoDataUrl] = useState("")
  const [mascotName, setMascotName] = useState("")
  const [isExtractingCutout, setIsExtractingCutout] = useState(false)
  const [cutoutStage, setCutoutStage] = useState<"cutting_out" | "building_foreground" | null>(null)
  const [foregroundCutoutMode, setForegroundCutoutMode] = useState<ForegroundCutoutMode>(() =>
    isMobileViewport() ? "instant" : "smart"
  )

  // Captions, Safe Zone, and PiP state
  const [captionsOn, setCaptionsOn] = useState(false)
  const [captionText, setCaptionText] = useState("")
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("dynamic_pop")
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [pipEnabled, setPipEnabled] = useState(false)
  const [pipImageDataUrl, setPipImageDataUrl] = useState<string | null>(null)
  const [pipRemoveBg, setPipRemoveBg] = useState(true)
  const [isRemovingPipBg, setIsRemovingPipBg] = useState(false)
  const [pipPriceText, setPipPriceText] = useState("")
  const [pipPromoTag, setPipPromoTag] = useState("")
  const [pipCorner, setPipCorner] = useState<PipCorner>("top_left")

  // Stage & Export settings
  const [aspectRatio, setAspectRatio] = useState<AspectPreset>("9:16")
  const [qualityPreset, setQualityPreset] = useState<RenderQualityPreset>(() =>
    isMobileViewport() ? "mobile_fast" : "studio_hd"
  )
  const [framing, setFraming] = useState<FramingPreset>("upper_body")
  const [solidColor, setSolidColor] = useState("#F5EFE6")
  const [photoBlurRadius, setPhotoBlurRadius] = useState(14)
  const [badgeText, setBadgeText] = useState(shopProfile.name.trim() || "")

  // Audio state (linked from Recording Booth or local upload)
  const [localAudioFile, setLocalAudioFile] = useState<{
    blob: Blob
    title: string
  } | null>(null)
  const [audioDuration, setAudioDuration] = useState<number>(generatedAudioDuration || 0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)

  // Video Export state
  const [isRenderingVideo, setIsRenderingVideo] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [exportedVideo, setExportedVideo] = useState<ExportedVideoState | null>(null)

  // Refs for 2D Canvas compositing & images
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const characterPhotoRef = useRef<HTMLImageElement | null>(null)
  const cutoutPhotoRef = useRef<HTMLImageElement | null>(null)
  const characterPhotoUrlRef = useRef<string | null>(null)
  const pipImageRef = useRef<HTMLImageElement | null>(null)
  const cornerLogoImgRef = useRef<HTMLImageElement | null>(null)
  const backdropImageRef = useRef<HTMLImageElement | null>(null)
  const backdropImageUrlRef = useRef<string | null>(null)
  const pipCutoutCacheRef = useRef<Map<string, string>>(new Map())
  const mascotCutoutCacheRef = useRef<Map<string, string>>(new Map())
  const cutoutAbortRef = useRef<AbortController | null>(null)

  // Refs for Web Audio & Render loop
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const lipSyncRef = useRef<LipSyncAnalyzer | null>(null)
  const playbackStartCtxTimeRef = useRef<number>(0)
  const isPlayingRef = useRef(false)
  const isRenderingRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Scene appearance refs so animation loop reads latest values without restarting rAF
  const sceneSettingsRef = useRef({
    aspectRatio,
    qualityPreset,
    framing,
    presenterStudioSet,
    solidColor,
    photoBlurRadius,
    presenterShowLowerThird,
    presenterShowCornerLogo,
    badgeText,
    photoName,
    mascotName,
    captionsOn,
    captionText,
    captionStyle,
    pipEnabled,
    pipPriceText,
    pipPromoTag,
    pipCorner,
  })
  sceneSettingsRef.current = {
    aspectRatio,
    qualityPreset,
    framing,
    presenterStudioSet,
    solidColor,
    photoBlurRadius,
    presenterShowLowerThird,
    presenterShowCornerLogo,
    badgeText,
    photoName,
    mascotName,
    captionsOn,
    captionText,
    captionStyle,
    pipEnabled,
    pipPriceText,
    pipPromoTag,
    pipCorner,
  }

  const activeAudioSource = useMemo(() => {
    if (localAudioFile) {
      return {
        blob: localAudioFile.blob,
        url: null as string | null,
        title: localAudioFile.title,
      }
    }
    if (generatedAudioBlob || generatedAudioUrl) {
      return {
        blob: generatedAudioBlob,
        url: generatedAudioUrl,
        title: generatedAudioTitle || t(language, "booth.audioFallbackTitle"),
      }
    }
    return null
  }, [localAudioFile, generatedAudioBlob, generatedAudioUrl, generatedAudioTitle, language])

  // Keep exported video URL alive for at least 60s after unmount/replace for mobile downloads
  useEffect(() => {
    const urlToRevoke = exportedVideo?.url
    return () => {
      if (urlToRevoke) {
        revokeBlobUrlAfterDelay(urlToRevoke)
      }
    }
  }, [exportedVideo])

  // Decode active audio into an AudioBuffer whenever source changes
  useEffect(() => {
    let cancelled = false
    audioBufferRef.current = null

    const decodeSource = async () => {
      if (!activeAudioSource) {
        setAudioDuration(0)
        return
      }
      try {
        const AudioCtx = getAudioContextConstructor()
        if (!AudioCtx) return
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx()
        }
        let arrayBuf: ArrayBuffer
        if (activeAudioSource.blob) {
          arrayBuf = await activeAudioSource.blob.arrayBuffer()
        } else if (activeAudioSource.url) {
          const res = await fetch(activeAudioSource.url)
          arrayBuf = await res.arrayBuffer()
        } else {
          return
        }
        const decoded = await audioCtxRef.current.decodeAudioData(arrayBuf.slice(0))
        if (!cancelled) {
          audioBufferRef.current = decoded
          setAudioDuration(decoded.duration)
        }
      } catch (err) {
        console.warn("Failed to decode audio for lip-sync:", err)
      }
    }

    void decodeSource()
    return () => {
      cancelled = true
    }
  }, [activeAudioSource])

  const stopAudioPlayback = useCallback(() => {
    isPlayingRef.current = false
    setIsPlaying(false)
    setPlaybackTime(0)

    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null
        activeSourceRef.current.stop()
        activeSourceRef.current.disconnect()
      } catch {
        // Ignore already stopped source
      }
      activeSourceRef.current = null
    }
    if (lipSyncRef.current) {
      lipSyncRef.current.dispose()
      lipSyncRef.current = null
    }
  }, [])

  // Pure 2D Canvas Animation & Composite Loop
  useEffect(() => {
    const displayCanvas = displayCanvasRef.current
    if (!displayCanvas) return

    let rafId = 0
    let lastRenderMs = 0
    let lastFrameMs = 0
    const startMs = performance.now()

    const renderFrame = (nowMs: number) => {
      rafId = requestAnimationFrame(renderFrame)

      const settings = sceneSettingsRef.current
      const lowPower = settings.qualityPreset === "mobile_fast"
      const targetFps = QUALITY_FPS[settings.qualityPreset]
      if (lowPower && lastRenderMs > 0 && nowMs - lastRenderMs < 1000 / targetFps - 1) {
        return
      }
      lastRenderMs = nowMs

      const delta = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.08) : 1 / 60
      lastFrameMs = nowMs
      const elapsed = (nowMs - startMs) / 1000

      const dims = CANVAS_DIMENSIONS_BY_QUALITY[settings.qualityPreset][settings.aspectRatio]
      if (displayCanvas.width !== dims.width || displayCanvas.height !== dims.height) {
        displayCanvas.width = dims.width
        displayCanvas.height = dims.height
      }

      // Lip-sync weights from active AnalyserNode
      const lip = lipSyncRef.current
        ? lipSyncRef.current.update(delta)
        : { aa: 0, oh: 0, ou: 0, ee: 0, ih: 0, energy: 0 }

      // Update playback progress if playing
      if (isPlayingRef.current && audioCtxRef.current && audioBufferRef.current) {
        const current = Math.max(0, audioCtxRef.current.currentTime - playbackStartCtxTimeRef.current)
        const total = audioBufferRef.current.duration || 1
        setPlaybackTime(Math.min(current, total))
        if (isRenderingRef.current) {
          setRenderProgress(Math.min(99, Math.round((current / total) * 100)))
        }
      }

      const ctx = displayCanvas.getContext("2d")
      if (!ctx) return

      ctx.clearRect(0, 0, dims.width, dims.height)

      // 1. Draw Stage Backdrop
      if (settings.presenterStudioSet === "custom_photo") {
        if (backdropImageRef.current) {
          const img = backdropImageRef.current
          const scale = Math.max(dims.width / img.width, dims.height / img.height)
          const drawW = img.width * scale
          const drawH = img.height * scale
          const drawX = (dims.width - drawW) / 2
          const drawY = (dims.height - drawH) / 2
          const blurPx = lowPower ? 0 : Math.max(0, settings.photoBlurRadius)
          const pad = blurPx > 0 ? blurPx * 1.4 : 0

          ctx.save()
          if (blurPx > 0) {
            ctx.filter = `blur(${blurPx}px) brightness(0.92)`
          }
          ctx.drawImage(img, drawX - pad, drawY - pad, drawW + pad * 2, drawH + pad * 2)
          if (lowPower) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.08)"
            ctx.fillRect(0, 0, dims.width, dims.height)
          }
          ctx.restore()
        } else {
          ctx.fillStyle = settings.solidColor || "#F5EFE6"
          ctx.fillRect(0, 0, dims.width, dims.height)
        }
      } else if (settings.presenterStudioSet === "tech_podcast") {
        const grad = ctx.createRadialGradient(
          dims.width * 0.5,
          dims.height * 0.35,
          dims.width * 0.1,
          dims.width * 0.5,
          dims.height * 0.5,
          dims.height * 0.78
        )
        grad.addColorStop(0, "#232329")
        grad.addColorStop(1, "#141418")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)
      } else if (settings.presenterStudioSet === "soft_bokeh") {
        const grad = ctx.createRadialGradient(
          dims.width * 0.5,
          dims.height * 0.35,
          dims.width * 0.1,
          dims.width * 0.5,
          dims.height * 0.5,
          dims.height * 0.78
        )
        grad.addColorStop(0, "#312E81")
        grad.addColorStop(0.55, "#1E1B4B")
        grad.addColorStop(1, "#0F172A")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)
      } else {
        // Warm Paper architectural studio gradient
        const grad = ctx.createRadialGradient(
          dims.width * 0.5,
          dims.height * 0.35,
          dims.width * 0.1,
          dims.width * 0.5,
          dims.height * 0.5,
          dims.height * 0.8
        )
        grad.addColorStop(0, "#FAF6EE")
        grad.addColorStop(1, "#DDD5C8")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)
      }

      // 2. Draw 2D Mascot Cutout directly on the stage backdrop
      const activeMascotImg = cutoutPhotoRef.current || characterPhotoRef.current
      if (activeMascotImg) {
        drawMascotCutoutFrame(ctx, activeMascotImg, dims.width, dims.height, lip, elapsed, {
          framing: settings.framing,
          lowPower,
        })
      }

      // 3. Top-Right Corner Brand Bug (Watermark at 80% opacity)
      if (settings.presenterShowCornerLogo && cornerLogoImgRef.current) {
        drawCornerLogoWatermark(ctx, cornerLogoImgRef.current, dims.width, { lowPower })
      }

      // 4. TV-Style Lower-Third Nameplate
      if (settings.presenterShowLowerThird) {
        const presenterName =
          settings.mascotName.trim() ||
          settings.photoName.replace(/\.[^.]+$/, "") ||
          "Mascot"
        drawBroadcastLowerThird(
          ctx,
          {
            presenterName,
            shopName: settings.badgeText.trim(),
            logoImg: cornerLogoImgRef.current,
            lip,
            elapsed,
            captionsOn: settings.captionsOn,
            lowPower,
          },
          dims.width,
          dims.height
        )
      }

      // 5. Picture-in-Picture (PiP) Phone + Price Tag & Trust Badge Overlay
      if (settings.pipEnabled) {
        drawPipPhoneOverlay(
          ctx,
          {
            phoneImg: pipImageRef.current,
            priceText: settings.pipPriceText,
            promoTag: settings.pipPromoTag,
            corner: settings.pipCorner,
            lip,
            elapsed,
            hasCornerLogo: Boolean(settings.presenterShowCornerLogo && cornerLogoImgRef.current),
            hasLowerThird: settings.presenterShowLowerThird,
            captionsOn: settings.captionsOn,
            lowPower,
          },
          dims.width,
          dims.height
        )
      }

      // 6. Optional live Burmese captions
      if (settings.captionsOn) {
        drawCaptionBar(ctx, settings.captionText, dims.width, dims.height, {
          style: settings.captionStyle,
          lip,
          elapsed,
          hasLowerThird: settings.presenterShowLowerThird,
          lowPower,
        })
      }
    }

    rafId = requestAnimationFrame(renderFrame)

    return () => {
      cancelAnimationFrame(rafId)
      cutoutAbortRef.current?.abort()
      cutoutAbortRef.current = null
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          // Ignore recorder stop errors on unmount
        }
      }
      mediaRecorderRef.current = null
      stopAudioPlayback()
      displayCanvas.width = 0
      displayCanvas.height = 0
      pipImageRef.current = null
      cornerLogoImgRef.current = null
      backdropImageRef.current = null
      characterPhotoRef.current = null
      cutoutPhotoRef.current = null
      if (backdropImageUrlRef.current) {
        URL.revokeObjectURL(backdropImageUrlRef.current)
        backdropImageUrlRef.current = null
      }
      if (characterPhotoUrlRef.current) {
        URL.revokeObjectURL(characterPhotoUrlRef.current)
        characterPhotoUrlRef.current = null
      }
      pipCutoutCacheRef.current.clear()
      mascotCutoutCacheRef.current.clear()
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [stopAudioPlayback])

  // Sync cached transparent 2D mascot cutout into an HTMLImageElement ref
  useEffect(() => {
    if (!presenter3dPopCutoutUrl) {
      cutoutPhotoRef.current = null
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) {
        cutoutPhotoRef.current = img
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        cutoutPhotoRef.current = null
      }
    }
    img.src = presenter3dPopCutoutUrl
    return () => {
      cancelled = true
    }
  }, [presenter3dPopCutoutUrl])

  const runMascotCutout = useCallback(
    async (
      source: File | string,
      options?: { modeOverride?: ForegroundCutoutMode; silent?: boolean }
    ) => {
      if (isRenderingRef.current || isPlayingRef.current) return
      const activeCutoutMode = options?.modeOverride ?? foregroundCutoutMode
      const cacheKey =
        typeof source === "string"
          ? `${source}::${activeCutoutMode}`
          : `${source.name}:${source.size}:${source.lastModified}:${activeCutoutMode}`

      const cachedCutout = mascotCutoutCacheRef.current.get(cacheKey)
      if (cachedCutout) {
        setPresenter3dPopCutoutUrl(cachedCutout)
        return
      }

      cutoutAbortRef.current?.abort()
      const controller = new AbortController()
      cutoutAbortRef.current = controller

      setIsExtractingCutout(true)
      setCutoutStage("cutting_out")
      try {
        const mobile = isMobileViewport()
        const cutout = await extractForegroundCutout(source, {
          mode: activeCutoutMode,
          maxDimension: mobile ? 512 : 640,
          timeoutMs: 12_000,
          signal: controller.signal,
          onProgress: (p) => setCutoutStage(p.stage),
        })
        if (controller.signal.aborted) return
        setCutoutStage("building_foreground")
        mascotCutoutCacheRef.current.set(cacheKey, cutout.dataUrl)
        setPresenter3dPopCutoutUrl(cutout.dataUrl)
        if (!options?.silent) {
          if (cutout.usedFallback) {
            toast.info(t(language, "presenter3d.cutoutFallbackToast"))
          } else {
            toast.success(t(language, "presenter3d.pop3dSuccess"))
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("2D mascot cutout failed:", err)
        if (!options?.silent) {
          toast.error(t(language, "presenter3d.pop3dError"))
        }
      } finally {
        if (cutoutAbortRef.current === controller) {
          cutoutAbortRef.current = null
        }
        setIsExtractingCutout(false)
        setCutoutStage(null)
      }
    },
    [foregroundCutoutMode, language, setPresenter3dPopCutoutUrl]
  )

  // Restore persisted mascot photo on mount if available
  useEffect(() => {
    if (!presenterMascotDataUrl || characterPhotoRef.current) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      characterPhotoRef.current = img
      setPhotoDims({ w: img.width, h: img.height })
      setPhotoDataUrl(presenterMascotDataUrl)
      if (!photoName) {
        setPhotoName(shopProfile.name.trim() || "Saved Mascot")
      }
    }
    img.src = presenterMascotDataUrl
    return () => {
      cancelled = true
    }
  }, [presenterMascotDataUrl, photoName, shopProfile.name])

  // Sync persisted shop logo watermark
  useEffect(() => {
    if (!presenterLogoDataUrl) {
      cornerLogoImgRef.current = null
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) {
        cornerLogoImgRef.current = img
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        cornerLogoImgRef.current = null
      }
    }
    img.src = presenterLogoDataUrl
    return () => {
      cancelled = true
    }
  }, [presenterLogoDataUrl])

  const handleUploadUniformLogo = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return

    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      toast.error(t(language, "presenter3d.logoInvalid"))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      try {
        const max = 256
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/png")
        setPresenterLogoDataUrl(dataUrl)
        toast.success(t(language, "presenter3d.logoLoaded"))
      } catch {
        toast.error(t(language, "presenter3d.logoInvalid"))
      } finally {
        canvas.width = 0
        canvas.height = 0
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.logoInvalid"))
    }
    img.src = url
  }

  const handleUploadPipPhone = async (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return

    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      toast.error(t(language, "presenter3d.pipInvalid"))
      return
    }

    const cacheKey = `${file.name}:${file.size}:${file.lastModified}:${foregroundCutoutMode}`
    if (pipRemoveBg && pipCutoutCacheRef.current.has(cacheKey)) {
      const cachedDataUrl = pipCutoutCacheRef.current.get(cacheKey)!
      const finalImg = new Image()
      finalImg.onload = () => {
        pipImageRef.current = finalImg
        setPipImageDataUrl(cachedDataUrl)
        setPipEnabled(true)
        toast.success(t(language, "presenter3d.pipLoaded"))
      }
      finalImg.src = cachedDataUrl
      return
    }

    let workingBlob: Blob = file
    if (pipRemoveBg && !isRenderingRef.current && !isPlayingRef.current) {
      setIsRemovingPipBg(true)
      try {
        const mobile = isMobileViewport()
        const cutout = await extractForegroundCutout(file, {
          mode: foregroundCutoutMode,
          maxDimension: mobile ? 512 : 640,
          timeoutMs: 12_000,
        })
        workingBlob = cutout.blob
      } catch (err) {
        console.warn("PiP background removal skipped; using original image:", err)
      } finally {
        setIsRemovingPipBg(false)
      }
    }

    const url = URL.createObjectURL(workingBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      try {
        const max = 640
        const scale = Math.min(1, max / Math.max(img.width, img.height, 1))
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext("2d")
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/png")
        if (pipRemoveBg && workingBlob !== file) {
          pipCutoutCacheRef.current.set(cacheKey, dataUrl)
        }

        const finalImg = new Image()
        finalImg.onload = () => {
          pipImageRef.current = finalImg
          setPipImageDataUrl(dataUrl)
          setPipEnabled(true)
          toast.success(t(language, "presenter3d.pipLoaded"))
        }
        finalImg.src = dataUrl
      } catch {
        toast.error(t(language, "presenter3d.pipInvalid"))
      } finally {
        canvas.width = 0
        canvas.height = 0
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.pipInvalid"))
    }
    img.src = url
  }

  /** Installs a mascot photo, persists it to the store, and triggers automatic 2D cutout. */
  const applyCharacterImage = (img: HTMLImageElement, name: string, existingDataUrl?: string) => {
    characterPhotoRef.current = img
    setPhotoDims({ w: img.width, h: img.height })
    setPhotoName(name)
    if (existingDataUrl) {
      setPhotoDataUrl(existingDataUrl)
      setPresenterMascotDataUrl(existingDataUrl)
      return existingDataUrl
    }
    const c = document.createElement("canvas")
    try {
      const max = 640
      const k = Math.min(1, max / Math.max(img.width, img.height, 1))
      c.width = Math.max(1, Math.round(img.width * k))
      c.height = Math.max(1, Math.round(img.height * k))
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height)
      const dataUrl = encodeCanvasForStorage(c)
      setPhotoDataUrl(dataUrl)
      setPresenterMascotDataUrl(dataUrl)
      return dataUrl
    } catch {
      setPhotoDataUrl("")
      return ""
    } finally {
      c.width = 0
      c.height = 0
    }
  }

  const handleUploadCharacterPhoto = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      toast.error(t(language, "presenter3d.photoInvalid"))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      if (characterPhotoUrlRef.current) URL.revokeObjectURL(characterPhotoUrlRef.current)
      characterPhotoUrlRef.current = url
      applyCharacterImage(img, file.name)
      // Automatically remove background into a crisp transparent 2D cutout (or keep transparent PNG)
      void runMascotCutout(file)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.photoCharLoadError"))
    }
    img.src = url
  }

  const handleClearMascotPhoto = () => {
    triggerHaptic(6)
    cutoutAbortRef.current?.abort()
    cutoutAbortRef.current = null
    if (characterPhotoUrlRef.current) {
      URL.revokeObjectURL(characterPhotoUrlRef.current)
      characterPhotoUrlRef.current = null
    }
    characterPhotoRef.current = null
    cutoutPhotoRef.current = null
    setPhotoDims(null)
    setPhotoName("")
    setPhotoDataUrl("")
    setPresenterMascotDataUrl(null)
    setPresenter3dPopCutoutUrl(null)
  }

  const handleSaveMascot = () => {
    const saveUrl = presenter3dPopCutoutUrl || photoDataUrl
    if (!saveUrl) return
    const name = mascotName.trim() || shopProfile.name.trim() || photoName || "Mascot"
    saveMascotPreset({
      name,
      photoDataUrl: saveUrl,
      mouthX: 0.5,
      mouthY: 0.42,
      mouthWidth: 0.12,
      jawBottom: 0.56,
      jawHalfWidth: 0.14,
      jawOpenness: 1,
    })
    setMascotName("")
    toast.success(`💾 "${name}" Mascot သိမ်းပြီးပါပြီ`)
  }

  const handleLoadMascot = (m: (typeof mascotPresets)[number]) => {
    const img = new Image()
    img.onload = () => {
      applyCharacterImage(img, m.name, m.photoDataUrl)
      void runMascotCutout(m.photoDataUrl, { silent: true })
      toast.success(`"${m.name}" ကို ခေါ်ပြီးပါပြီ`)
    }
    img.onerror = () => toast.error(t(language, "presenter3d.photoCharLoadError"))
    img.src = m.photoDataUrl
  }

  const handleUploadBackdropPhoto = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      if (backdropImageUrlRef.current) {
        URL.revokeObjectURL(backdropImageUrlRef.current)
      }
      backdropImageUrlRef.current = url
      backdropImageRef.current = img
      setPresenterStudioSet("custom_photo")
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.photoLoadError"))
    }
    img.src = url
  }

  const handleUploadLocalAudio = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return
    stopAudioPlayback()
    setLocalAudioFile({ blob: file, title: file.name })
  }

  useImagePaste((file) => handleUploadCharacterPhoto(file), {
    enabled: true,
    message: t(language, "dropzone.pasted"),
  })

  const handleTogglePreviewPlay = async () => {
    triggerHaptic(10)
    if (isPlaying) {
      stopAudioPlayback()
      return
    }

    if (!audioBufferRef.current) {
      toast.error(t(language, "presenter3d.noAudioError"))
      return
    }

    unlockIosAudio()
    const AudioCtx = getAudioContextConstructor()
    if (!AudioCtx) return
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === "suspended") {
      await ctx.resume()
    }

    const source = ctx.createBufferSource()
    source.buffer = audioBufferRef.current

    const lipSync = createLipSyncAnalyzer({
      audioContext: ctx,
      sourceNode: source,
    })
    source.connect(ctx.destination)

    activeSourceRef.current = source
    lipSyncRef.current = lipSync
    playbackStartCtxTimeRef.current = ctx.currentTime
    isPlayingRef.current = true
    setIsPlaying(true)

    source.onended = () => {
      if (!isRenderingRef.current) {
        stopAudioPlayback()
      }
    }

    source.start(0)
  }

  const handleRenderVideo = async () => {
    triggerHaptic(15)
    if (isRenderingVideo) {
      isRenderingRef.current = false
      setIsRenderingVideo(false)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      stopAudioPlayback()
      return
    }

    if (!cutoutPhotoRef.current && !characterPhotoRef.current) {
      toast.error(t(language, "presenter3d.noPhotoError"))
      return
    }

    if (!audioBufferRef.current || !displayCanvasRef.current) {
      toast.error(t(language, "presenter3d.noAudioError"))
      return
    }

    stopAudioPlayback()
    unlockIosAudio()

    try {
      const AudioCtx = getAudioContextConstructor()
      if (!AudioCtx) throw new Error("AudioContext not supported")
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === "suspended") {
        await ctx.resume()
      }

      const canvas = displayCanvasRef.current
      if (typeof canvas.captureStream !== "function") {
        throw new Error("Canvas captureStream is not supported in this browser.")
      }

      const targetFps = QUALITY_FPS[qualityPreset]
      const canvasStream = canvas.captureStream(targetFps)
      const audioDest = ctx.createMediaStreamDestination()

      const source = ctx.createBufferSource()
      source.buffer = audioBufferRef.current

      const lipSync = createLipSyncAnalyzer({
        audioContext: ctx,
        sourceNode: source,
      })

      // Route audio both to MediaStreamDestination (for video recording) and speakers (live monitor)
      source.connect(audioDest)
      source.connect(ctx.destination)

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])

      const { mimeType, extension } = pickVideoRecorderMimeType()
      const recorder = createSafeRecorder(combinedStream, mimeType, qualityPreset)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data)
        }
      }

      recorder.onerror = () => {
        for (const track of combinedStream.getTracks()) {
          track.stop()
        }
        isRenderingRef.current = false
        setIsRenderingVideo(false)
        stopAudioPlayback()
        toast.error(t(language, "presenter3d.renderFailed"))
      }

      recorder.onstop = () => {
        const wasCancelled = !isRenderingRef.current
        for (const track of combinedStream.getTracks()) {
          track.stop()
        }
        isRenderingRef.current = false
        setIsRenderingVideo(false)
        stopAudioPlayback()

        if (wasCancelled) {
          return
        }

        setRenderProgress(100)

        if (chunks.length === 0) {
          toast.error(t(language, "presenter3d.renderFailed"))
          return
        }

        const finalMime = recorder.mimeType || mimeType || `video/${extension}`
        const blob = new Blob(chunks, { type: finalMime })
        const url = URL.createObjectURL(blob)
        const baseName =
          (activeAudioSource?.title || "mascot-video")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .toLowerCase() || "mascot-video"

        setExportedVideo({
          url,
          blob,
          mimeType: finalMime,
          extension,
          fileName: `${baseName}-mascot.${extension}`,
        })
        toast.success(t(language, "presenter3d.renderSuccess"))
      }

      mediaRecorderRef.current = recorder
      activeSourceRef.current = source
      lipSyncRef.current = lipSync
      playbackStartCtxTimeRef.current = ctx.currentTime
      isPlayingRef.current = true
      isRenderingRef.current = true
      setIsPlaying(true)
      setIsRenderingVideo(true)
      setRenderProgress(0)

      source.onended = () => {
        if (recorder.state !== "inactive") {
          recorder.stop()
        }
      }

      const timesliceMs = getRecorderTimesliceMs(mimeType)
      if (timesliceMs !== undefined) {
        recorder.start(timesliceMs)
      } else {
        recorder.start()
      }
      source.start(0)
    } catch (err) {
      console.error("Mascot video render failed:", err)
      isRenderingRef.current = false
      setIsRenderingVideo(false)
      stopAudioPlayback()
      toast.error(err instanceof Error ? err.message : t(language, "presenter3d.renderFailed"))
    }
  }

  const handleDownloadVideo = () => {
    if (!exportedVideo) return
    const link = document.createElement("a")
    link.href = exportedVideo.url
    link.download = exportedVideo.fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleShareVideo = async () => {
    if (!exportedVideo) return
    const file = new File([exportedVideo.blob], exportedVideo.fileName, {
      type: exportedVideo.mimeType,
    })

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: exportedVideo.fileName,
          })
          return
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
      }
    }
    handleDownloadVideo()
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-bold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>{t(language, "presenter3d.title")}</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.subtitle")}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setActivePageKey("voiceover")}
            className="h-9 rounded-xl border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar"
          >
            <Mic className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            <span>{t(language, "presenter3d.openBooth")}</span>
          </Button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Live 2D Mascot Stage & Video Export */}
        <div className="lg:col-span-6 rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.stagePreview")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6)
                  setShowSafeZone((v) => !v)
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors cursor-pointer font-myanmar whitespace-nowrap",
                  showSafeZone
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white/80 dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                )}
              >
                <ShieldCheck className="h-3 w-3 shrink-0" />
                <span>{t(language, "presenter3d.safeZoneBtn")}</span>
              </button>
              <span className="rounded-full bg-[#EFEAE1] dark:bg-[#27272A] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#1C1917] dark:text-[#F5F5F4] whitespace-nowrap">
                {aspectRatio} • {qualityPreset === "mobile_fast" ? "540p 24fps" : "HD 30fps"}
              </span>
            </div>
          </div>

          {/* Canvas Preview Container */}
          <FileDropzone
            accept={[".jpg", ".jpeg", ".png", ".webp"]}
            onFiles={(f) => {
              const file = f[0]
              if (file) handleUploadCharacterPhoto(file)
            }}
          >
            <div className="flex items-center justify-center rounded-2xl bg-[#EFEAE1]/70 dark:bg-[#09090B]/70 p-3 border border-[#E7E5E4]/80 dark:border-[#27272A]">
              <div
                className={cn(
                  "relative overflow-hidden rounded-2xl shadow-md border border-black/10 dark:border-white/10 w-full",
                  aspectRatio === "9:16" ? "max-w-[300px] aspect-[9/16]" : "max-w-[380px] aspect-square"
                )}
              >
                <canvas
                  ref={displayCanvasRef}
                  className="w-full h-full block object-contain"
                />

                {/* Preview-only TikTok / Reels Safe-Zone Guide (excluded from MediaRecorder exports) */}
                {showSafeZone && (
                  <div className="pointer-events-none select-none absolute inset-0 z-10">
                    {aspectRatio === "9:16" ? (
                      <>
                        <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-rose-400/80 bg-rose-500/15 flex items-end justify-center pb-1">
                          <span className="rounded bg-rose-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200 font-myanmar">
                            {t(language, "presenter3d.safeZoneHeader")}
                          </span>
                        </div>
                        <div className="absolute right-0 top-[44%] bottom-[22%] w-[16%] border-l border-y border-dashed border-rose-400/80 bg-rose-500/15 flex items-center justify-center">
                          <span className="-rotate-90 whitespace-nowrap rounded bg-rose-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200 font-myanmar">
                            {t(language, "presenter3d.safeZoneActions")}
                          </span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-dashed border-rose-400/80 bg-rose-500/15 flex items-start justify-center pt-1.5">
                          <span className="rounded bg-rose-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200 font-myanmar">
                            {t(language, "presenter3d.safeZoneBottom")}
                          </span>
                        </div>
                        <div className="absolute top-[12%] bottom-[22%] left-[3%] right-[16%] border border-dashed border-emerald-400/70 rounded-lg" />
                      </>
                    ) : (
                      <div className="absolute inset-[6%] border border-dashed border-emerald-400/75 rounded-xl" />
                    )}
                  </div>
                )}

                {!photoDims && !isExtractingCutout && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
                    <div className="rounded-2xl bg-white/85 dark:bg-[#18181B]/85 backdrop-blur-xs border border-[#E7E5E4] dark:border-[#3F3F46] p-4 shadow-sm space-y-2.5 max-w-[230px]">
                      <ImagePlus className="h-6 w-6 mx-auto text-amber-600 dark:text-amber-400" />
                      <p className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                        {t(language, "presenter3d.uploadPhotoFirst")}
                      </p>
                      <label className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B] px-3 py-1.5 text-[11px] font-semibold cursor-pointer font-myanmar">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{t(language, "presenter3d.choosePhotoBtn")}</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={handleUploadCharacterPhoto}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {isExtractingCutout && (
                  <div className="absolute inset-0 bg-black/45 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white text-xs font-myanmar px-4 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                    <span>
                      {cutoutStage === "building_foreground"
                        ? t(language, "presenter3d.stageBuildingCutout")
                        : t(language, "presenter3d.stageCuttingOut")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </FileDropzone>

          {/* Linked Audio Transport */}
          <div className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                  {t(language, "presenter3d.linkedAudio")}
                </p>
                <p className="text-xs sm:text-sm font-semibold text-[#1C1917] dark:text-[#F5F5F4] truncate font-myanmar">
                  {activeAudioSource ? activeAudioSource.title : t(language, "presenter3d.noAudioYet")}
                </p>
              </div>
              <FileDropzone
                accept={["audio/*", ".mp3", ".wav", ".m4a", ".ogg", ".webm"]}
                onFiles={(f) => handleUploadLocalAudio(f[0])}
              >
                <label className="shrink-0 cursor-pointer inline-flex items-center gap-1 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] px-2.5 py-1.5 text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#FAF8F5] dark:hover:bg-[#18181B]">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t(language, "presenter3d.uploadAudio")}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleUploadLocalAudio}
                    className="hidden"
                  />
                </label>
              </FileDropzone>
            </div>

            {activeAudioSource && (
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleTogglePreviewPlay}
                  disabled={isRenderingVideo}
                  className="h-9 rounded-xl bg-[#1C1917] text-[#FAF8F5] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:text-[#18181B] dark:hover:bg-[#E7E5E4] px-3 text-xs font-medium"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-1.5" />
                      <span>{t(language, "presenter3d.stopPreview")}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      <span>{t(language, "presenter3d.previewLipSync")}</span>
                    </>
                  )}
                </Button>

                <span className="text-xs tabular-nums text-[#57534E] dark:text-[#A1A1AA]">
                  {formatAudioClockDuration(playbackTime)} / {formatAudioClockDuration(audioDuration)}
                </span>
              </div>
            )}
          </div>

          {/* 1-Tap Render Video Button + Progress */}
          <div className="space-y-2.5">
            <Button
              type="button"
              onClick={handleRenderVideo}
              disabled={!activeAudioSource || !photoDims || isExtractingCutout}
              className={cn(
                "w-full h-12 rounded-2xl text-sm font-semibold transition-all font-myanmar cursor-pointer",
                isRenderingVideo
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-[#1C1917] hover:bg-[#292524] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] dark:text-[#18181B]"
              )}
            >
              {isRenderingVideo ? (
                <>
                  <Square className="h-4 w-4 mr-2 fill-current" />
                  <span>
                    {t(language, "presenter3d.renderingProgress", {
                      percent: String(renderProgress),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <Film className="h-4 w-4 mr-2" />
                  <span>{t(language, "presenter3d.renderVideoBtn")}</span>
                </>
              )}
            </Button>

            {isRenderingVideo && (
              <div className="h-2 w-full rounded-full bg-[#E7E5E4] dark:bg-[#3F3F46] overflow-hidden">
                <div
                  className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-150"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            )}

            {exportedVideo && (
              <div className="rounded-2xl border border-emerald-300/70 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 font-myanmar">
                    <Video className="h-4 w-4" />
                    <span>{t(language, "presenter3d.videoReady")}</span>
                  </span>
                  <span className="text-[11px] uppercase font-mono text-emerald-700 dark:text-emerald-300">
                    .{exportedVideo.extension}
                  </span>
                </div>

                <video
                  src={exportedVideo.url}
                  controls
                  playsInline
                  className="w-full max-h-[260px] rounded-xl bg-black"
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadVideo}
                    className="h-10 rounded-xl border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    <span>{t(language, "presenter3d.downloadBtn")}</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={handleShareVideo}
                    className="h-10 rounded-xl bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B] text-xs font-semibold"
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    <span>{t(language, "presenter3d.shareBtn")}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Controls (2D Mascot Cutout, Framing, Backdrop & Branding) */}
        <div className="lg:col-span-6 space-y-4">
          {/* 1. 2D Mascot Cutout Uploader & Presets */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                {t(language, "presenter3d.characterTitle")}
              </Label>
              {photoName && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 truncate max-w-[180px]">
                  {photoName}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {/* Cutout Mode Selector: Instant Cutout (No Model) vs Smart Cutout */}
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: "instant", labelKey: "presenter3d.cutoutModeInstant" },
                      { id: "smart", labelKey: "presenter3d.cutoutModeSmart" },
                    ] as const satisfies readonly {
                      id: ForegroundCutoutMode
                      labelKey: string
                    }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isExtractingCutout}
                      onClick={() => {
                        triggerHaptic(6)
                        setForegroundCutoutMode(opt.id)
                      }}
                      className={cn(
                        "rounded-xl border py-1.5 px-2 text-[10px] font-semibold leading-snug text-center transition-all cursor-pointer font-myanmar disabled:opacity-50",
                        foregroundCutoutMode === opt.id
                          ? "border-amber-600 dark:border-amber-400 bg-amber-500/15 text-amber-800 dark:text-amber-200"
                          : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                      )}
                    >
                      {t(language, opt.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#78716C] dark:text-[#A1A1AA] font-myanmar">
                  {foregroundCutoutMode === "instant"
                    ? t(language, "presenter3d.cutoutModeInstantHint")
                    : t(language, "presenter3d.cutoutModeSmartHint")}
                </p>
              </div>

              <FileDropzone
                accept={[".jpg", ".jpeg", ".png", ".webp"]}
                onFiles={(f) => handleUploadCharacterPhoto(f[0])}
              >
                <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-white/70 dark:bg-[#27272A]/70 py-2.5 px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#27272A] cursor-pointer transition-colors font-myanmar">
                  <ImagePlus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    {photoDims
                      ? t(language, "presenter3d.changePhotoBtn")
                      : t(language, "presenter3d.photoUpload")}
                  </span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleUploadCharacterPhoto}
                    className="hidden"
                  />
                </label>
              </FileDropzone>

              {photoDims && (
                <div className="space-y-2.5 rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {(presenter3dPopCutoutUrl || photoDataUrl) && (
                        <img
                          src={presenter3dPopCutoutUrl || photoDataUrl}
                          alt=""
                          className="h-9 w-9 rounded-lg object-contain bg-[#EFEAE1]/60 dark:bg-[#18181B] border border-black/10 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] truncate font-myanmar">
                          {photoName || t(language, "presenter3d.savedMascotLabel")}
                        </p>
                        {presenter3dPopCutoutUrl && !isExtractingCutout && (
                          <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 font-myanmar">
                            ✓ {t(language, "presenter3d.pop3dReady")}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearMascotPhoto}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0 font-myanmar"
                    >
                      <X className="h-3 w-3" />
                      <span>{t(language, "presenter3d.clearLogo")}</span>
                    </button>
                  </div>

                  {/* Re-run Cutout Button */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const src = photoDataUrl || presenterMascotDataUrl
                      if (src) void runMascotCutout(src)
                    }}
                    disabled={isExtractingCutout || (!photoDataUrl && !presenterMascotDataUrl)}
                    className="w-full h-8 rounded-xl border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] text-[11px] font-medium font-myanmar cursor-pointer"
                  >
                    {isExtractingCutout ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-amber-600" />
                        <span>
                          {cutoutStage === "building_foreground"
                            ? t(language, "presenter3d.stageBuildingCutout")
                            : t(language, "presenter3d.stageCuttingOut")}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-600 dark:text-amber-400" />
                        <span>
                          {presenter3dPopCutoutUrl
                            ? t(language, "presenter3d.pop3dRegenerateBtn")
                            : t(language, "presenter3d.pop3dGenerateBtn")}
                        </span>
                      </>
                    )}
                  </Button>

                  {/* Save Mascot Preset */}
                  <div className="space-y-1.5 rounded-xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] p-2">
                    <div className="flex gap-1.5">
                      <Input
                        value={mascotName}
                        onChange={(e) => setMascotName(e.target.value)}
                        placeholder={shopProfile.name.trim() || "Mascot / Presenter Name"}
                        className="h-8 min-w-0 flex-1 rounded-lg text-[11px] font-myanmar"
                      />
                      <button
                        type="button"
                        onClick={handleSaveMascot}
                        disabled={!photoDataUrl && !presenter3dPopCutoutUrl}
                        className="shrink-0 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-white disabled:opacity-50 cursor-pointer font-myanmar"
                      >
                        💾 Mascot သိမ်းမည်
                      </button>
                    </div>
                    {mascotPresets.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {mascotPresets.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#EFEAE1]/60 dark:bg-[#18181B] pl-1 pr-1.5 py-0.5"
                          >
                            <button
                              type="button"
                              onClick={() => handleLoadMascot(m)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                            >
                              <img src={m.photoDataUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                              {m.name}
                            </button>
                            <button
                              type="button"
                              aria-label="delete mascot"
                              onClick={() => deleteMascotPreset(m.id)}
                              className="text-[11px] text-[#A8A29E] hover:text-red-500 cursor-pointer"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mascotPresets.length > 0 && !photoDims && (
                <div className="flex flex-wrap gap-1.5">
                  {mascotPresets.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#EFEAE1]/60 dark:bg-[#18181B] pl-1 pr-1.5 py-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadMascot(m)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                      >
                        <img src={m.photoDataUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                        {m.name}
                      </button>
                      <button
                        type="button"
                        aria-label="delete mascot"
                        onClick={() => deleteMascotPreset(m.id)}
                        className="text-[11px] text-[#A8A29E] hover:text-red-500 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Captions Toggle & Input */}
            <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "presenter3d.captionToggle")}
                </span>
                <button
                  type="button"
                  onClick={() => setCaptionsOn((v) => !v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                    captionsOn
                      ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                  )}
                >
                  {captionsOn ? "ON" : "OFF"}
                </button>
              </div>
              {captionsOn && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                      {t(language, "presenter3d.captionStyleLabel")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: "dynamic_pop", labelKey: "presenter3d.captionStylePop" },
                          { id: "classic", labelKey: "presenter3d.captionStyleClassic" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic(6)
                            setCaptionStyle(opt.id)
                          }}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-colors cursor-pointer font-myanmar",
                            captionStyle === opt.id
                              ? "border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                          )}
                        >
                          {t(language, opt.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    placeholder={t(language, "presenter3d.captionPlaceholder")}
                    className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2. Aspect Ratio, Framing & Export Quality */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.framingTitle")}
            </Label>

            <div className="grid grid-cols-2 gap-2.5">
              {(["9:16", "1:1"] as AspectPreset[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => {
                    triggerHaptic(6)
                    setAspectRatio(ratio)
                  }}
                  className={cn(
                    "rounded-2xl border py-2.5 px-2 sm:px-3 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer",
                    aspectRatio === ratio
                      ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                  )}
                >
                  {ratio === "9:16" ? "9:16 • TikTok / Reels" : "1:1 • Facebook Square"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: "upper_body", labelKey: "presenter3d.framingUpperBody" },
                  { id: "close_up", labelKey: "presenter3d.framingCloseUp" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic(6)
                    setFraming(opt.id)
                  }}
                  className={cn(
                    "rounded-2xl border py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer font-myanmar",
                    framing === opt.id
                      ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                  )}
                >
                  {t(language, opt.labelKey)}
                </button>
              ))}
            </div>

            {/* Render Quality Toggle: Mobile Fast (540p / 24fps) vs Studio HD (720p–1080p / 30fps) */}
            <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "presenter3d.qualityLabel")}
                </span>
                <span className="text-[10px] text-[#78716C] dark:text-[#A1A1AA] font-myanmar">
                  {qualityPreset === "mobile_fast"
                    ? t(language, "presenter3d.qualityMobileHint")
                    : t(language, "presenter3d.qualityHdHint")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "mobile_fast", labelKey: "presenter3d.qualityMobileFast" },
                    { id: "studio_hd", labelKey: "presenter3d.qualityStudioHd" },
                  ] as const
                ).map((qOpt) => (
                  <button
                    key={qOpt.id}
                    type="button"
                    disabled={isRenderingVideo}
                    onClick={() => {
                      triggerHaptic(6)
                      setQualityPreset(qOpt.id)
                    }}
                    className={cn(
                      "rounded-2xl border py-2 px-2.5 text-[11px] font-semibold transition-all cursor-pointer font-myanmar disabled:opacity-50",
                      qualityPreset === qOpt.id
                        ? "border-emerald-600 dark:border-emerald-400 bg-emerald-600/12 text-emerald-800 dark:text-emerald-200"
                        : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                    )}
                  >
                    {t(language, qOpt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Stage Backdrop & Shop Branding */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.backdropTitle")}
            </Label>

            {/* 4 Backdrop Pills */}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "mobile_showroom", labelKey: "presenter3d.studioShowroom" },
                  { id: "tech_podcast", labelKey: "presenter3d.studioPodcast" },
                  { id: "soft_bokeh", labelKey: "presenter3d.studioBokeh" },
                  { id: "custom_photo", labelKey: "presenter3d.studioCustomPhoto" },
                ] as const satisfies readonly { id: PresenterStudioSet; labelKey: string }[]
              ).map((studioOpt) => (
                <button
                  key={studioOpt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic(6)
                    setPresenterStudioSet(studioOpt.id)
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer font-myanmar transition-all",
                    presenterStudioSet === studioOpt.id
                      ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B] shadow-xs"
                      : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                  )}
                >
                  {t(language, studioOpt.labelKey)}
                </button>
              ))}
            </div>

            {/* Custom Photo + Blur Slider + Solid Color Picker */}
            {presenterStudioSet === "custom_photo" && (
              <div className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white/80 dark:bg-[#27272A]/80 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FileDropzone accept={["image/*"]} onFiles={(f) => handleUploadBackdropPhoto(f[0])}>
                    <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-3 py-2 text-xs font-medium cursor-pointer font-myanmar">
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>{t(language, "presenter3d.uploadBackdropPhoto")}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadBackdropPhoto}
                        className="hidden"
                      />
                    </label>
                  </FileDropzone>

                  <label className="flex items-center gap-1.5 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-3 py-2 text-xs font-medium cursor-pointer font-myanmar">
                    <input
                      type="color"
                      value={solidColor}
                      onChange={(e) => {
                        setSolidColor(e.target.value)
                        if (backdropImageUrlRef.current) {
                          URL.revokeObjectURL(backdropImageUrlRef.current)
                          backdropImageUrlRef.current = null
                        }
                        backdropImageRef.current = null
                      }}
                      className="h-4 w-4 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <span>{t(language, "presenter3d.backdropSolid")}</span>
                  </label>
                </div>

                {backdropImageRef.current && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium font-myanmar text-[#57534E] dark:text-[#A1A1AA]">
                      <span>{t(language, "presenter3d.photoBlurLabel")}</span>
                      <span className="tabular-nums">{photoBlurRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={photoBlurRadius}
                      onChange={(e) => setPhotoBlurRadius(Number(e.target.value))}
                      className="w-full accent-amber-600"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Broadcast Overlays: Shop Logo + Corner Logo Watermark + Broadcast Nameplate */}
            <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "presenter3d.shopLogoLabel")}
                  </span>
                  {presenterLogoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(6)
                        setPresenterLogoDataUrl(null)
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer font-myanmar"
                    >
                      <X className="h-3 w-3" />
                      <span>{t(language, "presenter3d.clearLogo")}</span>
                    </button>
                  )}
                </div>
                <FileDropzone
                  accept={[".png", ".jpg", ".jpeg", ".webp"]}
                  onFiles={(f) => handleUploadUniformLogo(f[0])}
                >
                  <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-white/80 dark:bg-[#27272A]/80 py-2 px-3 text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#27272A] cursor-pointer transition-colors font-myanmar">
                    {presenterLogoDataUrl ? (
                      <>
                        <img
                          src={presenterLogoDataUrl}
                          alt="Shop logo"
                          className="h-5 w-5 rounded-full object-contain bg-white border border-black/10"
                        />
                        <span>{t(language, "presenter3d.changeLogo")}</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span>{t(language, "presenter3d.uploadLogo")}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      onChange={handleUploadUniformLogo}
                      className="hidden"
                    />
                  </label>
                </FileDropzone>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "presenter3d.cornerLogoToggle")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(6)
                    setPresenterShowCornerLogo(!presenterShowCornerLogo)
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                    presenterShowCornerLogo
                      ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                  )}
                >
                  {presenterShowCornerLogo ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "presenter3d.lowerThirdToggle")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(6)
                    setPresenterShowLowerThird(!presenterShowLowerThird)
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                    presenterShowLowerThird
                      ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                  )}
                >
                  {presenterShowLowerThird ? "ON" : "OFF"}
                </button>
              </div>

              {presenterShowLowerThird && (
                <Input
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder={t(language, "presenter3d.shopBadgePlaceholder")}
                  className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                />
              )}
            </div>
          </div>

          {/* 4. Picture-in-Picture (PiP) Phone + Price Tag & Trust Badge Overlay */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                  {t(language, "presenter3d.pipTitle")}
                </Label>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6)
                  setPipEnabled((v) => !v)
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                  pipEnabled
                    ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                )}
              >
                {pipEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {pipEnabled && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                    {t(language, "presenter3d.pipRemoveBgToggle")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(6)
                      setPipRemoveBg((v) => !v)
                    }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold cursor-pointer transition-colors",
                      pipRemoveBg
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40"
                        : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                    )}
                  >
                    {pipRemoveBg ? "ON" : "OFF"}
                  </button>
                </div>

                <FileDropzone
                  accept={[".jpg", ".jpeg", ".png", ".webp"]}
                  onFiles={(f) => void handleUploadPipPhone(f[0])}
                >
                  <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-white/80 dark:bg-[#27272A]/80 py-2.5 px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#27272A] cursor-pointer transition-colors font-myanmar">
                    {isRemovingPipBg ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                        <span>{t(language, "presenter3d.pipRemovingBg")}</span>
                      </>
                    ) : pipImageDataUrl ? (
                      <>
                        <img
                          src={pipImageDataUrl}
                          alt="Featured phone"
                          className="h-7 w-7 rounded-lg object-contain bg-zinc-900/10"
                        />
                        <span>{t(language, "presenter3d.pipChangePhone")}</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span>{t(language, "presenter3d.pipUploadPhone")}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleUploadPipPhone(e)}
                      className="hidden"
                    />
                  </label>
                </FileDropzone>

                {pipImageDataUrl && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(6)
                        pipImageRef.current = null
                        setPipImageDataUrl(null)
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer font-myanmar"
                    >
                      <X className="h-3 w-3" />
                      <span>{t(language, "presenter3d.pipClearPhone")}</span>
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                    {t(language, "presenter3d.pipPriceLabel")}
                  </span>
                  <Input
                    value={pipPriceText}
                    onChange={(e) => setPipPriceText(e.target.value)}
                    placeholder={t(language, "presenter3d.pipPricePlaceholder")}
                    className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                    {t(language, "presenter3d.pipPromoLabel")}
                  </span>
                  <Input
                    value={pipPromoTag}
                    onChange={(e) => setPipPromoTag(e.target.value)}
                    placeholder={t(language, "presenter3d.pipPromoPlaceholder")}
                    className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {["0% Downpayment", "COD", "Official Warranty"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          triggerHaptic(6)
                          setPipPromoTag(preset)
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer",
                          pipPromoTag === preset
                            ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                    {t(language, "presenter3d.pipCornerLabel")}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: "top_left", labelKey: "presenter3d.pipCornerTopLeft" },
                        { id: "top_right", labelKey: "presenter3d.pipCornerTopRight" },
                        { id: "bottom_left", labelKey: "presenter3d.pipCornerBottomLeft" },
                        { id: "bottom_right", labelKey: "presenter3d.pipCornerBottomRight" },
                      ] as const
                    ).map((cornerOpt) => (
                      <button
                        key={cornerOpt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic(6)
                          setPipCorner(cornerOpt.id)
                        }}
                        className={cn(
                          "rounded-xl border py-1.5 px-2.5 text-[11px] font-semibold transition-colors cursor-pointer font-myanmar",
                          pipCorner === cornerOpt.id
                            ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                            : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                        )}
                      >
                        {t(language, cornerOpt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
