"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Pause,
  Play,
  Share2,
  Sparkles,
  Square,
  Tag,
  Upload,
  User,
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
import { detectMouthFromImage } from "@/lib/mouthDetector"
import { useUIStore } from "@/store/useUIStore"
import { formatAudioClockDuration } from "@/api/ttsService"
import {
  getAudioContextConstructor,
  unlockIosAudio,
} from "@/lib/iosAudio"
import {
  createBuiltinPresenterController,
  createLipSyncAnalyzer,
  drawCaptionBar,
  drawTalkingPhotoFrame,
  drawPresenterCardFrame,
  getTalkingPhotoRect,
  loadCustomAvatarFromFile,
  type AvatarController,
  type BuiltinPresenterId,
  type LipSyncAnalyzer,
  type PresenterGestureStyle,
  type PresenterOutfitColor,
} from "@/lib/vrmLipSync"

type CharacterKind = "model" | "photo"
type AspectPreset = "9:16" | "1:1"
type FramingPreset = "upper_body" | "close_up"
type BackdropPreset = "warm_paper" | "soft_charcoal" | "solid_color" | "photo"

interface ExportedVideoState {
  url: string
  blob: Blob
  mimeType: string
  extension: "mp4" | "webm"
  fileName: string
}

const CANVAS_DIMENSIONS: Record<AspectPreset, { width: number; height: number }> = {
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
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

function createSafeRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  const attempts: MediaRecorderOptions[] = mimeType
    ? [
        { mimeType, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 },
        { mimeType, videoBitsPerSecond: 3_500_000 },
        { mimeType },
      ]
    : [{ videoBitsPerSecond: 3_500_000 }]

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
    selectedVoice,
    shopProfile,
    mascotPresets,
    saveMascotPreset,
    deleteMascotPreset,
    presenterLogoDataUrl,
    presenterOutfitColor,
    presenterGestureStyle,
    setPresenterLogoDataUrl,
    setPresenterOutfitColor,
    setPresenterGestureStyle,
  } = useContentStore(
    useShallow((state) => ({
      generatedAudioUrl: state.generatedAudioUrl,
      generatedAudioBlob: state.generatedAudioBlob,
      generatedAudioTitle: state.generatedAudioTitle,
      generatedAudioDuration: state.generatedAudioDuration,
      selectedVoice: state.selectedVoice,
      shopProfile: state.shopProfile,
      mascotPresets: state.mascotPresets,
      saveMascotPreset: state.saveMascotPreset,
      deleteMascotPreset: state.deleteMascotPreset,
      presenterLogoDataUrl: state.presenterLogoDataUrl,
      presenterOutfitColor: state.presenterOutfitColor,
      presenterGestureStyle: state.presenterGestureStyle,
      setPresenterLogoDataUrl: state.setPresenterLogoDataUrl,
      setPresenterOutfitColor: state.setPresenterOutfitColor,
      setPresenterGestureStyle: state.setPresenterGestureStyle,
    }))
  )

  const defaultPreset: BuiltinPresenterId = useMemo(() => {
    const voice = String(selectedVoice || "").toLowerCase()
    if (voice.includes("khant") || voice.includes("thiha") || voice.includes("male")) {
      return "male_kokhant"
    }
    return "female_nilar"
  }, [selectedVoice])

  // Character & Scene state
  const [characterKind, setCharacterKind] = useState<CharacterKind>("model")
  const [photoDims, setPhotoDims] = useState<{ w: number; h: number } | null>(null)
  const [photoName, setPhotoName] = useState("")
  const [mouthX, setMouthX] = useState(0.5)
  const [mouthY, setMouthY] = useState(0.42)
  const [mouthWidth, setMouthWidth] = useState(0.12)
  const [jawOpenness, setJawOpenness] = useState(1)
  const [jawBottom, setJawBottom] = useState(0.56)
  const [jawHalfWidth, setJawHalfWidth] = useState(0.14)
  const [photoStyle, setPhotoStyle] = useState<"lipsync" | "card">("lipsync")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState("")
  const [mascotName, setMascotName] = useState("")
  const [captionsOn, setCaptionsOn] = useState(false)
  const [captionText, setCaptionText] = useState("")
  const characterPhotoRef = useRef<HTMLImageElement | null>(null)
  const characterPhotoUrlRef = useRef<string | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const draggingMouthRef = useRef(false)
  const [avatarMode, setAvatarMode] = useState<"preset" | "custom">("preset")
  const [presetId, setPresetId] = useState<BuiltinPresenterId>(defaultPreset)
  const [customAvatarName, setCustomAvatarName] = useState<string>("")
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false)

  const [aspectRatio, setAspectRatio] = useState<AspectPreset>("9:16")
  const [framing, setFraming] = useState<FramingPreset>("upper_body")
  const [backdrop, setBackdrop] = useState<BackdropPreset>("warm_paper")
  const [solidColor, setSolidColor] = useState("#F5EFE6")
  const [blurPhotoBackdrop, setBlurPhotoBackdrop] = useState(true)
  const [showShopBadge, setShowShopBadge] = useState(Boolean(shopProfile.name.trim()))
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

  // Refs for Three.js & Canvas compositing
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const avatarRef = useRef<AvatarController | null>(null)
  const backdropImageRef = useRef<HTMLImageElement | null>(null)
  const backdropImageUrlRef = useRef<string | null>(null)

  // Refs for Web Audio & Render loop
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const lipSyncRef = useRef<LipSyncAnalyzer | null>(null)
  const playbackStartCtxTimeRef = useRef<number>(0)
  const isPlayingRef = useRef(false)
  const isRenderingRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Scene appearance refs so animation loop reads latest values without re-creating WebGL context
  const sceneSettingsRef = useRef({
    aspectRatio,
    framing,
    backdrop,
    solidColor,
    blurPhotoBackdrop,
    showShopBadge,
    badgeText,
    characterKind,
    mouthX,
    mouthY,
    mouthWidth,
    jawOpenness,
    jawBottom,
    jawHalfWidth,
    photoStyle,
    captionsOn,
    captionText,
  })
  sceneSettingsRef.current = {
    aspectRatio,
    framing,
    backdrop,
    solidColor,
    blurPhotoBackdrop,
    showShopBadge,
    badgeText,
    characterKind,
    mouthX,
    mouthY,
    mouthWidth,
    jawOpenness,
    jawBottom,
    jawHalfWidth,
    photoStyle,
    captionsOn,
    captionText,
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

  // Keep exported video URL clean
  useEffect(() => {
    return () => {
      if (exportedVideo?.url) {
        URL.revokeObjectURL(exportedVideo.url)
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
        console.warn("Failed to decode audio for 3D lip-sync:", err)
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

  // Update camera framing when framing or aspect ratio changes
  const applyCameraFraming = useCallback(
    (camera: THREE.PerspectiveCamera, currentFraming: FramingPreset, currentAspect: AspectPreset) => {
      const dims = CANVAS_DIMENSIONS[currentAspect]
      camera.aspect = dims.width / dims.height
      camera.fov = currentAspect === "9:16" ? 32 : 30

      if (currentFraming === "close_up") {
        camera.position.set(0, 1.44, 0.72)
        camera.lookAt(0, 1.42, 0)
      } else {
        camera.position.set(0, 1.28, 1.38)
        camera.lookAt(0, 1.22, 0)
      }
      camera.updateProjectionMatrix()
    },
    []
  )

  // Initialize Three.js WebGLRenderer, Scene, Camera, and Animation/Composite Loop
  useEffect(() => {
    const displayCanvas = displayCanvasRef.current
    if (!displayCanvas) return

    const glCanvas = document.createElement("canvas")
    glCanvasRef.current = glCanvas

    const renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Balanced 3-Point Studio Lighting (warm key, cool fill, soft back rim)
    const hemiLight = new THREE.HemisphereLight(0xfffaf3, 0xd6d3d1, 0.65)
    scene.add(hemiLight)

    const ambientLight = new THREE.AmbientLight(0xfffaf3, 0.28)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xfff2e0, 2.1)
    keyLight.position.set(1.6, 2.2, 2.4)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.9)
    fillLight.position.set(-1.9, 1.5, 1.6)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xfde68a, 1.35)
    rimLight.position.set(-0.4, 2.1, -2.1)
    scene.add(rimLight)

    const hairRimLight = new THREE.DirectionalLight(0xe0f2fe, 0.55)
    hairRimLight.position.set(1.1, 1.9, -1.8)
    scene.add(hairRimLight)

    const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.1, 30)
    cameraRef.current = camera

    // Load initial preset avatar with persisted uniform, logo & gesture style
    const storeSnapshot = useContentStore.getState()
    const initialAvatar = createBuiltinPresenterController(defaultPreset, {
      outfitColor: storeSnapshot.presenterOutfitColor,
      logoDataUrl: storeSnapshot.presenterLogoDataUrl,
      gestureStyle: storeSnapshot.presenterGestureStyle,
    })
    scene.add(initialAvatar.object)
    avatarRef.current = initialAvatar

    const clock = new THREE.Clock()
    let rafId = 0

    const renderFrame = () => {
      rafId = requestAnimationFrame(renderFrame)

      const delta = Math.min(clock.getDelta(), 0.05)
      const elapsed = clock.elapsedTime
      const settings = sceneSettingsRef.current
      const dims = CANVAS_DIMENSIONS[settings.aspectRatio]

      if (displayCanvas.width !== dims.width || displayCanvas.height !== dims.height) {
        displayCanvas.width = dims.width
        displayCanvas.height = dims.height
      }
      if (glCanvas.width !== dims.width || glCanvas.height !== dims.height) {
        renderer.setSize(dims.width, dims.height, false)
        applyCameraFraming(camera, settings.framing, settings.aspectRatio)
      }

      // Lip-sync weights from active AnalyserNode
      const lip = lipSyncRef.current
        ? lipSyncRef.current.update(delta)
        : { aa: 0, oh: 0, ee: 0, ih: 0, energy: 0 }

      // Update playback progress if playing
      if (isPlayingRef.current && audioCtxRef.current && audioBufferRef.current) {
        const current = Math.max(0, audioCtxRef.current.currentTime - playbackStartCtxTimeRef.current)
        const total = audioBufferRef.current.duration || 1
        setPlaybackTime(Math.min(current, total))
        if (isRenderingRef.current) {
          setRenderProgress(Math.min(99, Math.round((current / total) * 100)))
        }
      }

      if (avatarRef.current) {
        avatarRef.current.update(delta, elapsed, lip)
      }

      renderer.render(scene, camera)

      // Composite Backdrop + WebGL 3D Character + Shop Badge onto displayCanvas
      const ctx = displayCanvas.getContext("2d")
      if (!ctx) return

      ctx.clearRect(0, 0, dims.width, dims.height)

      // 1. Draw Backdrop
      if (settings.backdrop === "photo" && backdropImageRef.current) {
        const img = backdropImageRef.current
        const scale = Math.max(dims.width / img.width, dims.height / img.height)
        const drawW = img.width * scale
        const drawH = img.height * scale
        const drawX = (dims.width - drawW) / 2
        const drawY = (dims.height - drawH) / 2

        ctx.save()
        if (settings.blurPhotoBackdrop) {
          ctx.filter = "blur(14px) brightness(0.92)"
        }
        ctx.drawImage(img, drawX - 16, drawY - 16, drawW + 32, drawH + 32)
        ctx.restore()
      } else if (settings.backdrop === "soft_charcoal") {
        const grad = ctx.createRadialGradient(
          dims.width * 0.5,
          dims.height * 0.35,
          dims.width * 0.1,
          dims.width * 0.5,
          dims.height * 0.5,
          dims.height * 0.75
        )
        grad.addColorStop(0, "#27272A")
        grad.addColorStop(1, "#18181B")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)
      } else if (settings.backdrop === "solid_color") {
        ctx.fillStyle = settings.solidColor || "#F5EFE6"
        ctx.fillRect(0, 0, dims.width, dims.height)
      } else {
        // Warm Studio Paper
        const grad = ctx.createRadialGradient(
          dims.width * 0.5,
          dims.height * 0.35,
          dims.width * 0.1,
          dims.width * 0.5,
          dims.height * 0.5,
          dims.height * 0.8
        )
        grad.addColorStop(0, "#FFFDF9")
        grad.addColorStop(1, "#EFEAE1")
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)
      }

      // 2. Draw character layer: 2.5D Talking Photo or 3D WebGL
      if (settings.characterKind === "photo") {
        const photo = characterPhotoRef.current
        if (photo && settings.photoStyle === "card") {
          drawPresenterCardFrame(ctx, photo, dims.width, dims.height, lip, elapsed)
        } else if (photo) {
          drawTalkingPhotoFrame(
            ctx,
            photo,
            dims.width,
            dims.height,
            {
              mouthX: settings.mouthX,
              mouthY: settings.mouthY,
              mouthWidth: settings.mouthWidth,
              jawOpenness: settings.jawOpenness,
              jawBottom: settings.jawBottom,
              jawHalfWidth: settings.jawHalfWidth,
            },
            lip,
            elapsed
          )
        }
      } else {
        ctx.drawImage(glCanvas, 0, 0, dims.width, dims.height)
      }

      // 3. Draw optional Shop Name Badge Overlay
      const cleanBadge = settings.badgeText.trim()
      if (settings.showShopBadge && cleanBadge) {
        const paddingX = 24
        const badgeHeight = 46
        ctx.save()
        ctx.font = "600 22px system-ui, -apple-system, sans-serif"
        const textWidth = ctx.measureText(cleanBadge).width
        const pillWidth = Math.min(dims.width - 48, textWidth + paddingX * 2)
        const pillX = 28
        const pillY = 28

        ctx.fillStyle =
          settings.backdrop === "soft_charcoal"
            ? "rgba(250, 248, 245, 0.92)"
            : "rgba(24, 24, 27, 0.86)"
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillWidth, badgeHeight, 23)
        ctx.fill()

        ctx.fillStyle = settings.backdrop === "soft_charcoal" ? "#18181B" : "#FAF8F5"
        ctx.textBaseline = "middle"
        ctx.fillText(cleanBadge, pillX + paddingX, pillY + badgeHeight / 2 + 1, pillWidth - paddingX * 2)
        ctx.restore()
      }

      // 4. Optional live captions (Talking Photo mode)
      if (settings.characterKind === "photo" && settings.captionsOn) {
        drawCaptionBar(ctx, settings.captionText, dims.width, dims.height)
      }
    }

    rafId = requestAnimationFrame(renderFrame)

    return () => {
      cancelAnimationFrame(rafId)
      stopAudioPlayback()
      if (avatarRef.current) {
        scene.remove(avatarRef.current.object)
        avatarRef.current.dispose()
        avatarRef.current = null
      }
      renderer.dispose()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      if (backdropImageUrlRef.current) {
        URL.revokeObjectURL(backdropImageUrlRef.current)
        backdropImageUrlRef.current = null
      }
      if (characterPhotoUrlRef.current) {
        URL.revokeObjectURL(characterPhotoUrlRef.current)
        characterPhotoUrlRef.current = null
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [applyCameraFraming, defaultPreset, stopAudioPlayback])

  // Re-apply camera framing whenever user toggles Upper-Body / Close-Up or Aspect Ratio
  useEffect(() => {
    if (cameraRef.current) {
      applyCameraFraming(cameraRef.current, framing, aspectRatio)
    }
  }, [applyCameraFraming, framing, aspectRatio])

  const swapAvatarController = useCallback((next: AvatarController) => {
    const scene = sceneRef.current
    if (!scene) {
      next.dispose()
      return
    }
    if (avatarRef.current) {
      scene.remove(avatarRef.current.object)
      avatarRef.current.dispose()
    }
    scene.add(next.object)
    avatarRef.current = next
  }, [])

  // Sync persisted outfit color & chest logo to active built-in preset
  useEffect(() => {
    avatarRef.current?.setOutfitColor?.(presenterOutfitColor)
  }, [presenterOutfitColor])

  useEffect(() => {
    avatarRef.current?.setLogoDataUrl?.(presenterLogoDataUrl)
  }, [presenterLogoDataUrl])

  useEffect(() => {
    avatarRef.current?.setGestureStyle?.(presenterGestureStyle)
  }, [presenterGestureStyle])

  const handleSelectPreset = (id: BuiltinPresenterId) => {
    triggerHaptic(8)
    setPresetId(id)
    setAvatarMode("preset")
    setCustomAvatarName("")
    swapAvatarController(
      createBuiltinPresenterController(id, {
        outfitColor: presenterOutfitColor,
        logoDataUrl: presenterLogoDataUrl,
        gestureStyle: presenterGestureStyle,
      })
    )
  }

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
      try {
        const max = 256
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement("canvas")
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
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.logoInvalid"))
    }
    img.src = url
  }

  const handleUploadAvatarFile = async (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0]
    if (!(e instanceof File)) e.target.value = ""
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext !== "vrm" && ext !== "glb") {
      toast.error(t(language, "presenter3d.invalidAvatarFile"))
      return
    }

    setIsLoadingAvatar(true)
    try {
      const controller = await loadCustomAvatarFromFile(file)
      swapAvatarController(controller)
      setAvatarMode("custom")
      setCustomAvatarName(file.name)
      toast.success(t(language, "presenter3d.avatarLoaded"))
    } catch (err) {
      console.error("Failed to load 3D avatar:", err)
      toast.error(t(language, "presenter3d.avatarLoadError"))
    } finally {
      setIsLoadingAvatar(false)
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
      applyCharacterImage(img, file.name, null)
      toast.success(t(language, "presenter3d.photoLoaded"))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(t(language, "presenter3d.photoCharLoadError"))
    }
    img.src = url
  }

  /** Installs a photo as the character and (unless coordinates are given) auto-detects the mouth. */
  const applyCharacterImage = (
    img: HTMLImageElement,
    name: string,
    known: {
      mouthX: number
      mouthY: number
      mouthWidth: number
      jawBottom: number
      jawHalfWidth: number
      jawOpenness: number
    } | null
  ) => {
    characterPhotoRef.current = img
    setPhotoDims({ w: img.width, h: img.height })
    setPhotoName(name)
    setPhotoDataUrl("")
    // Downscaled copy for saving as a mascot (keeps localStorage small)
    try {
      const max = 640
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height)
      setPhotoDataUrl(c.toDataURL("image/jpeg", 0.85))
    } catch {
      /* ignore */
    }
    if (known) {
      setMouthX(known.mouthX)
      setMouthY(known.mouthY)
      setMouthWidth(known.mouthWidth)
      setJawBottom(known.jawBottom)
      setJawHalfWidth(known.jawHalfWidth)
      setJawOpenness(known.jawOpenness)
      return
    }
    setIsDetecting(true)
    void detectMouthFromImage(img).then((m) => {
      if (characterPhotoRef.current !== img) return
      setMouthX(m.x)
      setMouthY(m.y)
      setMouthWidth(m.width)
      setJawBottom(m.jawBottom)
      setJawHalfWidth(m.jawHalfWidth)
      setIsDetecting(false)
      if (m.detected) toast.success("✅ နှုတ်ခမ်းနေရာကို အလိုအလျောက် တွေ့ရှိပြီး")
      else toast.info("မျက်နှာမတွေ့ပါ – အလယ်တည့်တည့်ကို သုံးထားပါသည် (အသေးစိတ်ညှိနိုင်သည်)")
    })
  }

  const handleSaveMascot = () => {
    if (!photoDataUrl) return
    const name = mascotName.trim() || shopProfile.name.trim() || photoName || "Mascot"
    saveMascotPreset({
      name,
      photoDataUrl,
      mouthX,
      mouthY,
      mouthWidth,
      jawBottom,
      jawHalfWidth,
      jawOpenness,
    })
    setMascotName("")
    toast.success(`💾 "${name}" Mascot သိမ်းပြီးပါပြီ`)
  }

  const handleLoadMascot = (m: (typeof mascotPresets)[number]) => {
    const img = new Image()
    img.onload = () => {
      setCharacterKind("photo")
      applyCharacterImage(img, m.name, m)
      toast.success(`"${m.name}" ကို ခေါ်ပြီးပါပြီ`)
    }
    img.onerror = () => toast.error(t(language, "presenter3d.photoCharLoadError"))
    img.src = m.photoDataUrl
  }

  const placeMouthFromPointer = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage || !photoDims) return
    const box = stage.getBoundingClientRect()
    const dims = CANVAS_DIMENSIONS[aspectRatio]
    const rect = getTalkingPhotoRect(dims.width, dims.height, photoDims.w, photoDims.h)
    const cx = (clientX - box.left) / box.width
    const cy = (clientY - box.top) / box.height
    setMouthX(Math.min(1, Math.max(0, (cx - rect.x) / rect.w)))
    setMouthY(Math.min(1, Math.max(0, (cy - rect.y) / rect.h)))
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
      setBackdrop("photo")
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
    enabled: characterKind === "photo",
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
      // Cancel active render
      isRenderingRef.current = false
      setIsRenderingVideo(false)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      stopAudioPlayback()
      return
    }

    if (characterKind === "photo" && !characterPhotoRef.current) {
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

      const canvasStream = canvas.captureStream(30)
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
      const recorder = createSafeRecorder(combinedStream, mimeType)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data)
        }
      }

      recorder.onstop = () => {
        for (const track of combinedStream.getTracks()) {
          track.stop()
        }
        isRenderingRef.current = false
        setIsRenderingVideo(false)
        setRenderProgress(100)
        stopAudioPlayback()

        if (chunks.length === 0) {
          toast.error(t(language, "presenter3d.renderFailed"))
          return
        }

        const finalMime = recorder.mimeType || mimeType || `video/${extension}`
        const blob = new Blob(chunks, { type: finalMime })
        const url = URL.createObjectURL(blob)
        const baseName = (activeAudioSource?.title || "presenter-video")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .toLowerCase() || "presenter-video"

        setExportedVideo((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url)
          return {
            url,
            blob,
            mimeType: finalMime,
            extension,
            fileName: `${baseName}-${characterKind === "photo" ? "photo" : "3d"}.${extension}`,
          }
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

      recorder.start(250)
      source.start(0)
    } catch (err) {
      console.error("3D video render failed:", err)
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
        {/* Left: Live 3D Stage & Video Export */}
        <div className="lg:col-span-6 rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.stagePreview")}
            </span>
            <span className="rounded-full bg-[#EFEAE1] dark:bg-[#27272A] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#1C1917] dark:text-[#F5F5F4]">
              {aspectRatio} • {framing === "close_up" ? "Close-Up" : "Upper-Body"}
            </span>
          </div>

          {/* Canvas Preview Container */}
          <FileDropzone
            accept={[".jpg", ".jpeg", ".png", ".webp"]}
            disabled={characterKind !== "photo"}
            onFiles={(f) => handleUploadCharacterPhoto(f[0])}
          >
          <div className="flex items-center justify-center rounded-2xl bg-[#EFEAE1]/70 dark:bg-[#09090B]/70 p-3 border border-[#E7E5E4]/80 dark:border-[#27272A]">
            <div
              ref={stageRef}
              onPointerDown={(e) => {
                if (characterKind !== "photo" || !photoDims || isRenderingVideo || !showAdvanced || photoStyle !== "lipsync") return
                draggingMouthRef.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                placeMouthFromPointer(e.clientX, e.clientY)
              }}
              onPointerMove={(e) => {
                if (draggingMouthRef.current) placeMouthFromPointer(e.clientX, e.clientY)
              }}
              onPointerUp={() => {
                draggingMouthRef.current = false
              }}
              onPointerCancel={() => {
                draggingMouthRef.current = false
              }}
              className={cn(
                characterKind === "photo" && photoDims && showAdvanced && photoStyle === "lipsync" && "touch-none cursor-crosshair",
                "relative overflow-hidden rounded-2xl shadow-md border border-black/10 dark:border-white/10 w-full",
                aspectRatio === "9:16" ? "max-w-[300px] aspect-[9/16]" : "max-w-[380px] aspect-square"
              )}
            >
              <canvas
                ref={displayCanvasRef}
                className="w-full h-full block object-contain"
              />
              {characterKind === "photo" && photoDims && !isRenderingVideo && showAdvanced && photoStyle === "lipsync" && (() => {
                const dims = CANVAS_DIMENSIONS[aspectRatio]
                const rect = getTalkingPhotoRect(dims.width, dims.height, photoDims.w, photoDims.h)
                const diameter = Math.max(18, mouthWidth * rect.w * 100)
                return (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 shadow-[0_0_0_2px_rgba(0,0,0,0.45)] bg-amber-400/15"
                    style={{
                      left: `${(rect.x + mouthX * rect.w) * 100}%`,
                      top: `${(rect.y + mouthY * rect.h) * 100}%`,
                      width: `${diameter}%`,
                      aspectRatio: "1 / 1",
                    }}
                  />
                )
              })()}
              {characterKind === "photo" && !photoDims && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                  {t(language, "presenter3d.uploadPhotoFirst")}
                </div>
              )}
              {isLoadingAvatar && (
                <div className="absolute inset-0 bg-black/45 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white text-xs font-myanmar">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>{t(language, "presenter3d.loadingAvatar")}</span>
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
              <FileDropzone accept={["audio/*", ".mp3", ".wav", ".m4a", ".ogg", ".webm"]} onFiles={(f) => handleUploadLocalAudio(f[0])}>
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
              disabled={!activeAudioSource || isLoadingAvatar || (characterKind === "photo" && !photoDims)}
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

        {/* Right: Controls (Character, Framing, Backdrop & Branding) */}
        <div className="lg:col-span-6 space-y-4">
          {/* 1. Character Selector */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                {t(language, "presenter3d.characterTitle")}
              </Label>
              {characterKind === "model" && avatarMode === "custom" && customAvatarName && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 truncate max-w-[180px]">
                  {customAvatarName}
                </span>
              )}
              {characterKind === "photo" && photoName && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 truncate max-w-[180px]">
                  {photoName}
                </span>
              )}
            </div>

            <div
              role="tablist"
              aria-label={t(language, "presenter3d.modeTitle")}
              className="grid grid-cols-2 gap-1 rounded-2xl bg-[#EFEAE1] dark:bg-[#27272A] p-1"
            >
              {(
                [
                  { id: "model", labelKey: "presenter3d.mode3d" },
                  { id: "photo", labelKey: "presenter3d.modePhoto" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={characterKind === opt.id}
                  onClick={() => {
                    triggerHaptic(6)
                    if (isRenderingVideo) return
                    setCharacterKind(opt.id)
                  }}
                  className={cn(
                    "rounded-xl py-2 px-2 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer font-myanmar",
                    characterKind === opt.id
                      ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B] shadow-xs"
                      : "text-[#57534E] dark:text-[#A1A1AA]"
                  )}
                >
                  {t(language, opt.labelKey)}
                </button>
              ))}
            </div>

            {characterKind === "photo" && (
              <div className="space-y-3">
                <FileDropzone accept={[".jpg", ".jpeg", ".png", ".webp"]} onFiles={(f) => handleUploadCharacterPhoto(f[0])}>
                  <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-white/70 dark:bg-[#27272A]/70 py-2.5 px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#27272A] cursor-pointer transition-colors font-myanmar">
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>{t(language, "presenter3d.photoUpload")}</span>
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
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["lipsync", "🎤 Lip-Sync Animation"],
                        ["card", "✨ Presenter Card (ပုံအသန့် + အသံလှိုင်း)"],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setPhotoStyle(id)
                            if (id === "card") {
                              setShowAdvanced(false)
                              if (shopProfile.name.trim()) setShowShopBadge(true)
                            }
                          }}
                          className={cn(
                            "rounded-xl border px-2 py-2 text-[11px] font-semibold font-myanmar cursor-pointer transition-colors",
                            photoStyle === id
                              ? "border-[#1C1917] bg-[#1C1917] text-[#FAF8F5] dark:border-[#F5F5F4] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                              : "border-[#E7E5E4] dark:border-[#3F3F46] text-[#57534E] dark:text-[#A1A1AA]"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {isDetecting && (
                      <p className="flex items-center gap-1.5 text-[11px] text-amber-700 font-myanmar">
                        <Loader2 className="h-3 w-3 animate-spin" /> နှုတ်ခမ်းနေရာ ရှာနေသည်...
                      </p>
                    )}

                    <div className="space-y-1.5 rounded-xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] p-2">
                      <div className="flex gap-1.5">
                        <Input
                          value={mascotName}
                          onChange={(e) => setMascotName(e.target.value)}
                          placeholder={shopProfile.name.trim() || "Mascot အမည် (ဥပမာ The Boys Mobile)"}
                          className="h-8 rounded-lg text-[11px] font-myanmar"
                        />
                        <button
                          type="button"
                          onClick={handleSaveMascot}
                          disabled={!photoDataUrl}
                          className="shrink-0 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-white disabled:opacity-50 cursor-pointer font-myanmar"
                        >
                          💾 Mascot သိမ်းထားမည်
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

                    {photoStyle === "lipsync" && (
                      <button
                        type="button"
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] underline-offset-2 hover:underline cursor-pointer font-myanmar"
                      >
                        ⚙️ အသေးစိတ်ညှိရန် {showAdvanced ? "▲" : "▼"}
                      </button>
                    )}
                    {showAdvanced && photoStyle === "lipsync" && (
                    <div className="space-y-2.5">
                    <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                      {t(language, "presenter3d.photoHint")}
                    </p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-medium font-myanmar">
                        <span>{t(language, "presenter3d.mouthWidth")}</span>
                        <span className="tabular-nums">{Math.round(mouthWidth * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.04}
                        max={0.3}
                        step={0.005}
                        value={mouthWidth}
                        onChange={(e) => setMouthWidth(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-medium font-myanmar">
                        <span>{t(language, "presenter3d.jawOpenness")}</span>
                        <span className="tabular-nums">{jawOpenness.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={2}
                        step={0.05}
                        value={jawOpenness}
                        onChange={(e) => setJawOpenness(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>
                    </div>
                    )}

                    <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium font-myanmar">
                          {t(language, "presenter3d.captionToggle")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCaptionsOn((v) => !v)}
                          className={cn(
                            "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                            captionsOn
                              ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                              : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#18181B] dark:text-[#A1A1AA]"
                          )}
                        >
                          {captionsOn ? "ON" : "OFF"}
                        </button>
                      </div>
                      {captionsOn && (
                        <Input
                          value={captionText}
                          onChange={(e) => setCaptionText(e.target.value)}
                          placeholder={t(language, "presenter3d.captionPlaceholder")}
                          className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {characterKind === "model" && (
            <>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectPreset("female_nilar")}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all cursor-pointer",
                  avatarMode === "preset" && presetId === "female_nilar"
                    ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                )}
              >
                <User className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate font-myanmar">
                    {t(language, "presenter3d.presetNilar")}
                  </div>
                  <div className="text-[10px] opacity-75 truncate">Female Presenter</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("male_kokhant")}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all cursor-pointer",
                  avatarMode === "preset" && presetId === "male_kokhant"
                    ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4]"
                )}
              >
                <User className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate font-myanmar">
                    {t(language, "presenter3d.presetKoKhant")}
                  </div>
                  <div className="text-[10px] opacity-75 truncate">Male Presenter</div>
                </div>
              </button>
            </div>

            <FileDropzone accept={[".vrm", ".glb"]} onFiles={(f) => handleUploadAvatarFile(f[0])}>
              <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-white/70 dark:bg-[#27272A]/70 py-2.5 px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#27272A] cursor-pointer transition-colors font-myanmar">
                <Upload className="h-3.5 w-3.5" />
                <span>{t(language, "presenter3d.uploadCustomAvatar")}</span>
                <input
                  type="file"
                  accept=".vrm,.glb"
                  onChange={handleUploadAvatarFile}
                  className="hidden"
                />
              </label>
            </FileDropzone>

            {avatarMode === "preset" && (
              <div className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white/80 dark:bg-[#27272A]/80 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-1.5 font-myanmar">
                    <Tag className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>{t(language, "presenter3d.uniformTitle")}</span>
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

                {/* 4 Outfit Color Swatches */}
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: "navy", hex: "#1e293b", labelKey: "presenter3d.colorNavy" },
                      { id: "charcoal", hex: "#27272a", labelKey: "presenter3d.colorCharcoal" },
                      { id: "emerald", hex: "#115e59", labelKey: "presenter3d.colorEmerald" },
                      { id: "cream", hex: "#e7dfd3", labelKey: "presenter3d.colorCream" },
                    ] as const satisfies readonly {
                      id: PresenterOutfitColor
                      hex: string
                      labelKey: string
                    }[]
                  ).map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic(6)
                        setPresenterOutfitColor(swatch.id)
                      }}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl border py-1.5 px-2 text-[11px] font-medium transition-all cursor-pointer font-myanmar",
                        presenterOutfitColor === swatch.id
                          ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#EFEAE1] dark:bg-[#18181B] text-[#1C1917] dark:text-[#F5F5F4] shadow-xs"
                          : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                        style={{ backgroundColor: swatch.hex }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{t(language, swatch.labelKey)}</span>
                    </button>
                  ))}
                </div>

                {/* Chest Logo Upload / Drop Button */}
                <FileDropzone
                  accept={[".png", ".jpg", ".jpeg", ".webp"]}
                  onFiles={(f) => handleUploadUniformLogo(f[0])}
                >
                  <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#D6D3D1] dark:border-[#52525B] bg-[#FAF8F5] dark:bg-[#18181B]/70 py-2 px-3 text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-white dark:hover:bg-[#18181B] cursor-pointer transition-colors font-myanmar">
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
            )}
            {avatarMode === "preset" && (
              <div className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white/80 dark:bg-[#27272A]/80 p-3 space-y-2.5">
                <span className="text-[11px] font-semibold text-[#1C1917] dark:text-[#F5F5F4] block font-myanmar">
                  {t(language, "presenter3d.gestureStyleTitle")}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      {
                        id: "natural",
                        labelKey: "presenter3d.gestureNatural",
                        descKey: "presenter3d.gestureNaturalDesc",
                      },
                      {
                        id: "energetic",
                        labelKey: "presenter3d.gestureEnergetic",
                        descKey: "presenter3d.gestureEnergeticDesc",
                      },
                      {
                        id: "calm",
                        labelKey: "presenter3d.gestureCalm",
                        descKey: "presenter3d.gestureCalmDesc",
                      },
                    ] as const satisfies readonly {
                      id: PresenterGestureStyle
                      labelKey: string
                      descKey: string
                    }[]
                  ).map((styleOpt) => (
                    <button
                      key={styleOpt.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic(6)
                        setPresenterGestureStyle(styleOpt.id)
                      }}
                      title={t(language, styleOpt.descKey)}
                      className={cn(
                        "rounded-xl border py-2 px-2 text-center transition-all cursor-pointer font-myanmar",
                        presenterGestureStyle === styleOpt.id
                          ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B] shadow-xs"
                          : "border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] text-[#57534E] dark:text-[#A1A1AA]"
                      )}
                    >
                      <div className="text-[11px] font-semibold leading-tight truncate">
                        {t(language, styleOpt.labelKey)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </div>

          {/* 2. Aspect Ratio & Framing */}
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
                    "rounded-2xl border py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
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
          </div>

          {/* 3. Backdrop & Shop Branding */}
          <div className="rounded-3xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "presenter3d.backdropTitle")}
            </Label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBackdrop("warm_paper")}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer font-myanmar",
                  backdrop === "warm_paper"
                    ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A]"
                )}
              >
                {t(language, "presenter3d.backdropWarmPaper")}
              </button>

              <button
                type="button"
                onClick={() => setBackdrop("soft_charcoal")}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer font-myanmar",
                  backdrop === "soft_charcoal"
                    ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A]"
                )}
              >
                {t(language, "presenter3d.backdropCharcoal")}
              </button>

              <label
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer font-myanmar",
                  backdrop === "solid_color"
                    ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                    : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A]"
                )}
              >
                <input
                  type="color"
                  value={solidColor}
                  onChange={(e) => {
                    setSolidColor(e.target.value)
                    setBackdrop("solid_color")
                  }}
                  className="h-4 w-4 rounded border-0 bg-transparent cursor-pointer"
                />
                <span>{t(language, "presenter3d.backdropSolid")}</span>
              </label>
            </div>

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

              {backdrop === "photo" && (
                <button
                  type="button"
                  onClick={() => setBlurPhotoBackdrop((v) => !v)}
                  className="rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-3 py-2 text-xs font-medium cursor-pointer font-myanmar"
                >
                  {blurPhotoBackdrop
                    ? t(language, "presenter3d.photoBlurOn")
                    : t(language, "presenter3d.photoBlurOff")}
                </button>
              )}
            </div>

            {/* Optional Shop Name Badge */}
            <div className="pt-2 border-t border-[#E7E5E4]/80 dark:border-[#3F3F46]/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  {t(language, "presenter3d.shopBadgeToggle")}
                </span>
                <button
                  type="button"
                  onClick={() => setShowShopBadge((v) => !v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer transition-colors",
                    showShopBadge
                      ? "bg-[#1C1917] text-[#FAF8F5] dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "bg-[#EFEAE1] text-[#57534E] dark:bg-[#27272A] dark:text-[#A1A1AA]"
                  )}
                >
                  {showShopBadge ? "ON" : "OFF"}
                </button>
              </div>

              {showShopBadge && (
                <Input
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder={t(language, "presenter3d.shopBadgePlaceholder")}
                  className="h-9 rounded-xl bg-white dark:bg-[#27272A] border-[#E7E5E4] dark:border-[#3F3F46] text-xs font-myanmar"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
