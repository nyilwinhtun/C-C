"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Captions,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  Film,
  History,
  ImagePlus,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  RectangleVertical,
  Repeat,
  Scissors,
  ScrollText,
  Share2,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import { isSupportedVideoFile, transcribeAudioWithGemini } from "@/api/aiService"
import { prepareAudioForGemini } from "@/lib/audioProcessor"
import {
  MIN_VALID_RECORDING_BYTES,
  createWavAudioRecorder,
  getAudioContextConstructor,
  playBlobUrlWithPrimedAudio,
  unlockIosAudio,
  type WavAudioRecorderHandle,
} from "@/lib/iosAudio"
import {
  BURMESE_VOICE_PRESETS,
  SOUND_EFFECT_PRESETS,
  VOICE_DELIVERY_PRESETS,
  VOICEOVER_SPEEDS,
  cleanVoiceoverText,
  estimateSpokenDurationSeconds,
  formatAudioClockDuration,
  generateBurmeseDialogueVoiceover,
  generateBurmeseVoiceover,
  mixVoiceoverWithAutoDuckingMusic,
  optimizeScriptPreservingPauses,
  playSoundEffectPreview,
  toBurmeseDigits,
  type BurmeseVoiceType,
  type SoundEffectType,
  type VoiceDeliveryTone,
  type VoiceoverProgress,
  type VoiceoverResult,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import {
  generateSrtContent,
  getAudioBlobDurationSeconds,
  mergeVideoWithVoiceover,
  previewBackgroundMusic,
  stopBackgroundMusicPreview,
  type BackgroundMusicPreset,
  type MergeVideoAudioResult,
  type OriginalAudioVolume,
  type SubtitleStylePreset,
  type VideoAspectRatio,
  type VideoDurationSyncMode,
} from "@/lib/videoAudioMerger"
import { useContentStore, type UploadedPhotoItem } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { IosAudioPlayer } from "@/components/shared/IosAudioPlayer"
import { SquircleIcon } from "@/components/shared/squircle-icon"

const VOLUME_OPTIONS: Array<{
  value: OriginalAudioVolume
  label: string
  labelMy: string
}> = [
  { value: 0, label: "Mute 0%", labelMy: "အသံပိတ် 0%" },
  { value: 0.15, label: "Low 15%", labelMy: "နောက်ခံတိုး 15%" },
  { value: 0.5, label: "Normal 50%", labelMy: "ပုံမှန် 50%" },
]

const PAUSE_PILLS = [
  { tag: "[pause 0.5s]", label: "+0.5s" },
  { tag: "[pause 1s]", label: "+1s" },
  { tag: "[pause 2s]", label: "+2s" },
] as const

const ASPECT_RATIO_OPTIONS: Array<{
  id: VideoAspectRatio
  label: string
  sub: string
}> = [
  { id: "9:16", label: "9:16", sub: "TikTok/Reels" },
  { id: "1:1", label: "1:1", sub: "Square" },
  { id: "16:9", label: "16:9", sub: "YouTube" },
  { id: "original", label: "Original", sub: "Source" },
]

const MUSIC_PRESET_OPTIONS: Array<{
  id: BackgroundMusicPreset
  label: string
  labelMy: string
}> = [
  { id: "none", label: "None", labelMy: "မထည့်ပါ" },
  { id: "upbeat_promo", label: "Upbeat Promo", labelMy: "တက်ကြွ" },
  { id: "soft_vlog", label: "Soft Vlog", labelMy: "နူးညံ့" },
  { id: "calm_lofi", label: "Calm Lo-Fi", labelMy: "Lo-Fi" },
  { id: "custom", label: "Upload MP3", labelMy: "ကိုယ်ပိုင်ဖိုင်" },
]

const SUBTITLE_STYLE_OPTIONS: Array<{
  id: SubtitleStylePreset
  label: string
  previewClass: string
}> = [
  {
    id: "dark_pill",
    label: "Classic Dark Pill",
    previewClass: "bg-slate-900/90 text-white border-white/20",
  },
  {
    id: "yellow_box",
    label: "Viral Yellow Box",
    previewClass: "bg-yellow-400 text-slate-950 border-yellow-500 font-bold",
  },
  {
    id: "bold_outline",
    label: "Bold White Outline",
    previewClass: "bg-slate-700/80 text-white border-black font-extrabold [text-shadow:0_1px_2px_#000]",
  },
]

function triggerBlobDownload(url: string, filename: string) {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type AccordionSection = "voice" | "media" | "music"
type AudioSourceMode = "ai" | "original"

interface RecordedVoiceResult {
  blob: Blob
  audioUrl: string
  mimeType: string
  fileExtension: string
  durationSeconds: number
  label: string
}

function formatRecordTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

function inferAudioExtension(mimeType: string, fileName?: string): string {
  const cleanName = (fileName ?? "").toLowerCase()
  const match = cleanName.match(/\.([a-z0-9]+)$/)
  if (match && ["mp3", "m4a", "wav", "ogg", "webm", "aac"].includes(match[1])) {
    return match[1]
  }
  const lowerMime = mimeType.toLowerCase()
  if (lowerMime.includes("mp4") || lowerMime.includes("m4a")) return "m4a"
  if (lowerMime.includes("mpeg") || lowerMime.includes("mp3")) return "mp3"
  if (lowerMime.includes("wav")) return "wav"
  if (lowerMime.includes("ogg")) return "ogg"
  return "webm"
}

export function VoiceoverPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const {
    voiceoverDraftScript,
    setVoiceoverDraftScript,
    videoFile,
    videoPreviewUrl,
    setUploadedVideo,
    clearUploadedVideo,
    uploadedPhotos,
    setUploadedPhotos,
    clearUploadedPhotos,
    brandSignature,
    customPronunciations,
    addCustomPronunciation,
    removeCustomPronunciation,
    audioHistory,
    addAudioSession,
    deleteAudioSession,
  } = useContentStore(
    useShallow((state) => ({
      voiceoverDraftScript: state.voiceoverDraftScript,
      setVoiceoverDraftScript: state.setVoiceoverDraftScript,
      videoFile: state.uploadedVideoFile,
      videoPreviewUrl: state.videoPreviewUrl,
      setUploadedVideo: state.setUploadedVideo,
      clearUploadedVideo: state.clearUploadedVideo,
      uploadedPhotos: state.uploadedPhotos,
      setUploadedPhotos: state.setUploadedPhotos,
      clearUploadedPhotos: state.clearUploadedPhotos,
      brandSignature: state.brandSignature,
      customPronunciations: state.customPronunciations,
      addCustomPronunciation: state.addCustomPronunciation,
      removeCustomPronunciation: state.removeCustomPronunciation,
      audioHistory: state.audioHistory,
      addAudioSession: state.addAudioSession,
      deleteAudioSession: state.deleteAudioSession,
    }))
  )

  const [openSection, setOpenSection] = useState<AccordionSection | null>("voice")
  const [mediaMode, setMediaMode] = useState<"video" | "photos">(
    uploadedPhotos.length > 0 && !videoFile ? "photos" : "video"
  )

  const [dialogueMode, setDialogueMode] = useState(false)
  const [voiceType, setVoiceType] = useState<BurmeseVoiceType>("female")
  const [deliveryTone, setDeliveryTone] = useState<VoiceDeliveryTone>("promo")
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [introSfx, setIntroSfx] = useState<SoundEffectType>("none")
  const [originalVolume, setOriginalVolume] = useState<OriginalAudioVolume>(0.15)

  const [teleprompterOpen, setTeleprompterOpen] = useState(false)
  const [teleprompterPlaying, setTeleprompterPlaying] = useState(false)
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(1.2)
  const [teleprompterFontSize, setTeleprompterFontSize] = useState<"md" | "lg" | "xl">("lg")
  const teleprompterScrollRef = useRef<HTMLDivElement | null>(null)

  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16")
  const [enableBlurredBackground, setEnableBlurredBackground] = useState(true)

  const [musicPreset, setMusicPreset] = useState<BackgroundMusicPreset>("none")
  const [customMusicFile, setCustomMusicFile] = useState<File | null>(null)
  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false)

  const [isDictOpen, setIsDictOpen] = useState(false)
  const [newDictWord, setNewDictWord] = useState("")
  const [newDictPhonetic, setNewDictPhonetic] = useState("")

  const [enableSubtitles, setEnableSubtitles] = useState(true)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStylePreset>("dark_pill")
  const [enableWatermark, setEnableWatermark] = useState(false)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [durationSyncMode, setDurationSyncMode] = useState<VideoDurationSyncMode>("loop_video")

  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>("ai")
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false)
  const [recordedVoice, setRecordedVoice] = useState<RecordedVoiceResult | null>(null)

  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [voiceProgress, setVoiceProgress] = useState<VoiceoverProgress | null>(null)
  const [voiceoverResult, setVoiceoverResult] = useState<VoiceoverResult | null>(null)

  const [isMergingVideo, setIsMergingVideo] = useState(false)
  const [mergeProgress, setMergeProgress] = useState(0)
  const [mergedVideo, setMergedVideo] = useState<MergeVideoAudioResult | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const customMusicInputRef = useRef<HTMLInputElement | null>(null)
  const voiceUploadInputRef = useRef<HTMLInputElement | null>(null)
  const mergeAbortRef = useRef<AbortController | null>(null)
  const voiceUrlRef = useRef<string | null>(null)
  const recordedVoiceUrlRef = useRef<string | null>(null)
  const mergedUrlRef = useRef<string | null>(null)
  const wavRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<number | null>(null)
  const recordingSecondsRef = useRef(0)

  const revokeVoiceUrl = useCallback(() => {
    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current)
      voiceUrlRef.current = null
    }
  }, [])

  const revokeRecordedVoiceUrl = useCallback(() => {
    if (recordedVoiceUrlRef.current) {
      URL.revokeObjectURL(recordedVoiceUrlRef.current)
      recordedVoiceUrlRef.current = null
    }
  }, [])

  const revokeMergedUrl = useCallback(() => {
    if (mergedUrlRef.current) {
      URL.revokeObjectURL(mergedUrlRef.current)
      mergedUrlRef.current = null
    }
  }, [])

  const stopRecorderResources = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      mergeAbortRef.current?.abort()
      stopBackgroundMusicPreview()
      stopRecorderResources()
      revokeVoiceUrl()
      revokeRecordedVoiceUrl()
      revokeMergedUrl()
    }
  }, [stopRecorderResources, revokeVoiceUrl, revokeRecordedVoiceUrl, revokeMergedUrl])

  const processRecordedOrUploadedAudio = async (
    blob: Blob,
    mimeType: string,
    label: string,
    fileName?: string,
    fallbackDuration = 0
  ) => {
    const resolvedDuration =
      (await getAudioBlobDurationSeconds(blob)) || fallbackDuration || 1
    const fileExtension = inferAudioExtension(mimeType, fileName)

    revokeRecordedVoiceUrl()
    revokeMergedUrl()
    const url = URL.createObjectURL(blob)
    recordedVoiceUrlRef.current = url

    setRecordedVoice({
      blob,
      audioUrl: url,
      mimeType,
      fileExtension,
      durationSeconds: resolvedDuration,
      label,
    })
    setMergedVideo(null)
    if (videoDuration !== null) {
      setDurationSyncMode(resolvedDuration > videoDuration ? "loop_video" : "fit_video")
    }

    setIsTranscribingVoice(true)
    try {
      let uploadBlob: Blob = blob
      let uploadMime = mimeType
      let uploadName = fileName

      try {
        const processed = await prepareAudioForGemini(blob)
        if (processed.isSilent) {
          toast.error(
            isMy
              ? "အသံမကြားရပါ — မိုက်ခရိုဖုန်း စစ်ဆေးပါ"
              : "No audio detected — please check your microphone."
          )
          return
        }
        if (processed.wavBlob) {
          uploadBlob = processed.wavBlob
          uploadMime = processed.mimeType
          uploadName = fileName ? `${fileName.replace(/\.[^.]+$/, "")}.wav` : "recording.wav"
        }
      } catch {
        // Fallback to raw blob if browser cannot decode an uploaded file format
      }

      const cleanedText = await transcribeAudioWithGemini(
        uploadBlob,
        uploadMime,
        "auto",
        uploadName,
        true
      )
      if (cleanedText.trim()) {
        setVoiceoverDraftScript(cleanedText.trim())
        toast.success(
          isMy
            ? "အသံဖမ်းယူပြီး စာသားသန့်ရှင်းစွာ ပြောင်းလဲပြီးပါပြီ။"
            : "Voice captured & transcribed into clean script!"
        )
      } else {
        toast.info(
          isMy
            ? "အသံဖိုင် သိမ်းဆည်းပြီးပါပြီ (စကားသံ မတွေ့ရှိပါ)။"
            : "Audio saved, but no clear speech was detected."
        )
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to transcribe recorded audio."
      toast.error(msg)
    } finally {
      setIsTranscribingVoice(false)
    }
  }

  const startVoiceRecording = async () => {
    unlockIosAudio()

    if (!navigator.mediaDevices?.getUserMedia || !getAudioContextConstructor()) {
      toast.error(
        isMy
          ? "ဤ Browser တွင် အသံဖမ်းစနစ်ကို မပံ့ပိုးပါ။"
          : "Audio recording is not supported in this browser."
      )
      return
    }

    let recorderCtx: AudioContext | null = null
    const AudioCtx = getAudioContextConstructor()
    if (AudioCtx) {
      try {
        recorderCtx = new AudioCtx()
        if (recorderCtx.state === "suspended") {
          recorderCtx.resume().catch(() => {})
        }
      } catch {
        recorderCtx = null
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      wavRecorderRef.current = createWavAudioRecorder(stream, {
        audioContext: recorderCtx,
      })

      recordingSecondsRef.current = 0
      setRecordingSeconds(0)
      setIsRecordingVoice(true)
      recordTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1
        setRecordingSeconds(recordingSecondsRef.current)
      }, 1000)
    } catch (err) {
      recorderCtx?.close().catch(() => {})
      stopRecorderResources()
      setIsRecordingVoice(false)
      const msg =
        err instanceof Error ? err.message : "Microphone permission denied or unavailable."
      toast.error(msg)
    }
  }

  const stopVoiceRecording = async () => {
    const handle = wavRecorderRef.current
    wavRecorderRef.current = null
    const elapsed = recordingSecondsRef.current
    stopRecorderResources()
    setIsRecordingVoice(false)

    if (!handle) return
    try {
      const { blob, mimeType } = await handle.stop()
      if (blob.size <= MIN_VALID_RECORDING_BYTES) {
        toast.error(
          isMy
            ? "အသံဖမ်းယူမှု မအောင်မြင်ပါ သို့မဟုတ် အသံတိုလွန်းပါသည် — မိုက်ခရိုဖုန်း ခွင့်ပြုချက်ကို စစ်ဆေးပါ။"
            : "Recording was empty or too short. Please check microphone permissions and try again."
        )
        return
      }
      const label = isMy
        ? `ကိုယ်ပိုင်အသံသွင်းချက် (${formatRecordTimer(elapsed)})`
        : `My Recording (${formatRecordTimer(elapsed)})`
      void processRecordedOrUploadedAudio(blob, mimeType, label, "recording.wav", elapsed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to finalize WAV recording."
      toast.error(msg)
    }
  }

  const handleUploadVoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const mimeType = file.type || "audio/mpeg"
    await processRecordedOrUploadedAudio(file, mimeType, file.name, file.name)
  }

  const handleClearRecordedVoice = () => {
    revokeRecordedVoiceUrl()
    setRecordedVoice(null)
    revokeMergedUrl()
    setMergedVideo(null)
  }

  const handleDownloadRecordedVoice = () => {
    if (!recordedVoice) return
    const timestamp = new Date().toISOString().slice(0, 10)
    triggerBlobDownload(
      recordedVoice.audioUrl,
      `my-voice-${timestamp}.${recordedVoice.fileExtension}`
    )
  }

  const toggleSection = (section: AccordionSection) => {
    setOpenSection((prev) => (prev === section ? null : section))
  }

  const handleInsertPauseTag = (tag: string) => {
    const el = textareaRef.current
    if (!el) {
      const next = voiceoverDraftScript.trim()
        ? `${voiceoverDraftScript.trim()} ${tag} `
        : `${tag} `
      setVoiceoverDraftScript(next)
      return
    }
    const start = el.selectionStart ?? voiceoverDraftScript.length
    const end = el.selectionEnd ?? voiceoverDraftScript.length
    const before = voiceoverDraftScript.slice(0, start)
    const after = voiceoverDraftScript.slice(end)
    const padBefore = before && !/\s$/.test(before) ? " " : ""
    const padAfter = after && !/^\s/.test(after) ? " " : ""
    const inserted = `${padBefore}${tag}${padAfter}`
    const next = `${before}${inserted}${after}`
    setVoiceoverDraftScript(next)
    window.requestAnimationFrame(() => {
      el.focus()
      const cursor = start + inserted.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  const handleSelectVideoFile = (file?: File | null) => {
    if (!file) return
    if (!isSupportedVideoFile(file)) {
      toast.error(
        isMy
          ? "ပံ့ပိုးထားသော ဗီဒီယိုဖိုင် (MP4, MOV, WebM) ရွေးချယ်ပါ။"
          : "Please choose a supported video file (MP4, MOV, WebM)."
      )
      return
    }
    const url = URL.createObjectURL(file)
    setUploadedVideo(file, url)
    setMediaMode("video")
    setVideoDuration(null)
    revokeMergedUrl()
    setMergedVideo(null)
  }

  const handleSelectPhotoFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
    if (incoming.length === 0) {
      toast.error(
        isMy
          ? "ပံ့ပိုးထားသော ပုံဖိုင်များ (JPG, PNG, WebP) ရွေးချယ်ပါ။"
          : "Please choose valid image files (JPG, PNG, WebP)."
      )
      return
    }
    const combined: UploadedPhotoItem[] = [
      ...uploadedPhotos,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ].slice(0, 10)

    if (uploadedPhotos.length + incoming.length > 10) {
      toast.info(isMy ? "အများဆုံး ပုံ ၁၀ ပုံအထိသာ ထည့်နိုင်ပါသည်။" : "Maximum 10 photos allowed.")
    }

    setUploadedPhotos(combined)
    setMediaMode("photos")
    revokeMergedUrl()
    setMergedVideo(null)
  }

  const handleRemovePhoto = (id: string) => {
    setUploadedPhotos(uploadedPhotos.filter((p) => p.id !== id))
    revokeMergedUrl()
    setMergedVideo(null)
  }

  const handleSelectSfx = (sfx: SoundEffectType) => {
    setIntroSfx(sfx)
    if (sfx !== "none") {
      void playSoundEffectPreview(sfx)
    }
  }

  const handleToggleMusicPreview = async () => {
    if (isPreviewingMusic) {
      stopBackgroundMusicPreview()
      setIsPreviewingMusic(false)
      return
    }
    if (musicPreset === "none") return
    if (musicPreset === "custom" && !customMusicFile) {
      toast.info(isMy ? "အရင်ဆုံး .mp3/.m4a ဖိုင်ရွေးပါ။" : "Select an .mp3/.m4a file first.")
      return
    }
    setIsPreviewingMusic(true)
    try {
      await previewBackgroundMusic(musicPreset, customMusicFile)
      window.setTimeout(() => setIsPreviewingMusic(false), 8000)
    } catch {
      setIsPreviewingMusic(false)
    }
  }

  const handleAddPronunciation = () => {
    const word = newDictWord.trim()
    const phonetic = newDictPhonetic.trim()
    if (!word || !phonetic) {
      toast.error(
        isMy
          ? "စကားလုံးနှင့် မြန်မာအသံထွက် နှစ်ခုလုံး ထည့်ပါ။"
          : "Enter both the word and its Burmese phonetic spelling."
      )
      return
    }
    addCustomPronunciation(word, phonetic)
    setNewDictWord("")
    setNewDictPhonetic("")
    toast.success(isMy ? "အသံထွက်မှတ်စု ထည့်ပြီးပါပြီ။" : "Custom pronunciation saved!")
  }

  const handleOptimizeSpeechText = () => {
    const optimized = optimizeScriptPreservingPauses(
      voiceoverDraftScript,
      customPronunciations
    )
    if (!optimized) {
      toast.error(
        isMy
          ? "အသံထွက်စာသား ပြောင်းရန် စာသားအရင်ထည့်ပါ။"
          : "Please enter script text before optimizing."
      )
      return
    }
    setVoiceoverDraftScript(optimized)
    toast.success(
      isMy
        ? "အသံထွက်စာသား ပြောင်းလဲပြီးပါပြီ။"
        : "Speech text optimized for Burmese voiceover!"
    )
  }

  useEffect(() => {
    if (!teleprompterOpen || !teleprompterPlaying) return
    let rafId = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const el = teleprompterScrollRef.current
      if (el) {
        el.scrollTop += dt * 32 * teleprompterSpeed
      }
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [teleprompterOpen, teleprompterPlaying, teleprompterSpeed])

  const handleGenerateVoice = async () => {
    unlockIosAudio()
    const trimmed = cleanVoiceoverText(voiceoverDraftScript)
    if (!trimmed) {
      toast.error(
        isMy
          ? "အသံသွင်းရန် စာသားထည့်ပါ။"
          : "Please enter voiceover text before generating."
      )
      return
    }

    setIsGeneratingVoice(true)
    setVoiceProgress(null)
    try {
      let result = dialogueMode
        ? await generateBurmeseDialogueVoiceover(voiceoverDraftScript, speed, {
            deliveryTone,
            customPronunciations,
            introSfx,
            onProgress: setVoiceProgress,
          })
        : await generateBurmeseVoiceover(trimmed, voiceType, speed, {
            deliveryTone,
            customPronunciations,
            introSfx,
            onProgress: setVoiceProgress,
          })

      if (musicPreset !== "none") {
        const mixed = await mixVoiceoverWithAutoDuckingMusic({
          voiceoverBlob: result.blob,
          musicPreset,
          customMusicFile,
          musicVolume: 0.34,
        })
        URL.revokeObjectURL(result.audioUrl)
        result = {
          ...result,
          audioUrl: mixed.audioUrl,
          blob: mixed.blob,
          audioBuffer: mixed.audioBuffer,
          durationSeconds: mixed.durationSeconds,
          mimeType: "audio/wav",
          fileExtension: "wav",
        }
      }

      revokeVoiceUrl()
      revokeMergedUrl()
      voiceUrlRef.current = result.audioUrl
      setVoiceoverResult(result)
      setMergedVideo(null)
      if (videoDuration !== null) {
        setDurationSyncMode(result.durationSeconds > videoDuration ? "loop_video" : "fit_video")
      }
      addAudioSession({
        script: voiceoverDraftScript.trim(),
        voiceLabel: result.voiceName,
        mode: dialogueMode ? "dialogue" : "single",
        durationSeconds: result.durationSeconds,
      })
      void playBlobUrlWithPrimedAudio(result.audioUrl)
      toast.success(
        isMy ? "AI အသံနမူနာ ဖန်တီးပြီးပါပြီ။" : "Burmese AI voiceover generated!"
      )
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate Burmese voiceover."
      toast.error(msg)
    } finally {
      setIsGeneratingVoice(false)
      setVoiceProgress(null)
    }
  }

  const handleDownloadAudio = () => {
    if (!voiceoverResult) return
    const timestamp = new Date().toISOString().slice(0, 10)
    triggerBlobDownload(
      voiceoverResult.audioUrl,
      `burmese-voiceover-${voiceType}-${timestamp}.${voiceoverResult.fileExtension}`
    )
  }

  const handleShareAudio = async () => {
    if (!voiceoverResult) return
    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `burmese-voiceover-${voiceType}-${timestamp}.${voiceoverResult.fileExtension}`
    const file = new File([voiceoverResult.blob], filename, {
      type: voiceoverResult.mimeType,
    })

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: "Burmese AI Voiceover",
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        toast.error("Could not open share sheet. Use Download instead.")
      }
      return
    }

    triggerBlobDownload(voiceoverResult.audioUrl, filename)
    toast.info("Direct sharing is not supported on this browser; downloading audio instead.")
  }

  const activeVoiceoverAudio =
    audioSourceMode === "original"
      ? recordedVoice?.blob ?? null
      : voiceoverResult?.audioBuffer ?? null

  const activeVoiceoverDuration =
    audioSourceMode === "original"
      ? recordedVoice?.durationSeconds ?? null
      : voiceoverResult?.durationSeconds ?? null

  const handleDownloadSrt = () => {
    const duration = activeVoiceoverDuration ?? 15
    const srt = generateSrtContent(voiceoverDraftScript, duration)
    if (!srt) {
      toast.error(isMy ? ".SRT ထုတ်ရန် စာသားအရင်ထည့်ပါ။" : "Enter script text to export .SRT.")
      return
    }
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    triggerBlobDownload(url, `subtitles-${new Date().toISOString().slice(0, 10)}.srt`)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(isMy ? ".SRT စာတန်းဖိုင် ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။" : "Downloaded .SRT subtitle file!")
  }

  const hasReadyMedia =
    mediaMode === "video" ? Boolean(videoFile) : uploadedPhotos.length >= 2

  const handleMergeVideo = async () => {
    unlockIosAudio()
    if (!hasReadyMedia) {
      toast.error(
        mediaMode === "photos"
          ? isMy
            ? "အနည်းဆုံး ပုံ ၂ ပုံ (၂–၁၀ ပုံ) ရွေးချယ်ပါ။"
            : "Please upload 2–10 photos for the slideshow."
          : isMy
            ? "ဗီဒီယိုဖိုင် မရှိသေးပါ။ ဗီဒီယိုတစ်ခု တင်ပေးပါ။"
            : "No video file loaded. Upload a video first."
      )
      return
    }
    if (!activeVoiceoverAudio) {
      toast.error(
        audioSourceMode === "original"
          ? isMy
            ? "အရင်ဆုံး ကိုယ်ပိုင်အသံကို ဖမ်းယူပါ သို့မဟုတ် အသံဖိုင်တင်ပါ။"
            : "Record or upload your voice first."
          : isMy
            ? "အရင်ဆုံး AI Voiceover အသံဖန်တီးပါ။"
            : "Generate the AI voice preview first."
      )
      return
    }

    stopBackgroundMusicPreview()
    setIsPreviewingMusic(false)

    mergeAbortRef.current?.abort()
    const controller = new AbortController()
    mergeAbortRef.current = controller

    setIsMergingVideo(true)
    setMergeProgress(0)

    try {
      const merged = await mergeVideoWithVoiceover({
        videoFile: mediaMode === "video" ? videoFile : null,
        imageFiles: mediaMode === "photos" ? uploadedPhotos.map((p) => p.file) : [],
        voiceoverAudio: activeVoiceoverAudio,
        originalVolume,
        voiceoverVolume: 1.0,
        durationSyncMode,
        aspectRatio: mediaMode === "photos" && aspectRatio === "original" ? "9:16" : aspectRatio,
        enableBlurredBackground,
        backgroundMusicPreset: musicPreset,
        backgroundMusicFile: customMusicFile,
        backgroundMusicVolume: 0.38,
        enableAutoDucking: true,
        enableSubtitles,
        subtitleScript: voiceoverDraftScript,
        subtitleStyle,
        watermarkText: enableWatermark ? brandSignature : "",
        onProgress: setMergeProgress,
        signal: controller.signal,
      })

      revokeMergedUrl()
      mergedUrlRef.current = merged.videoUrl
      setMergedVideo(merged)

      const baseName =
        mediaMode === "video" && videoFile
          ? videoFile.name.replace(/\.[^.]+$/, "")
          : "photo-slideshow"
      triggerBlobDownload(
        merged.videoUrl,
        `${baseName}-burmese-ai.${merged.fileExtension}`
      )

      toast.success(
        isMy
          ? "အသံနှင့် ဗီဒီယို ပေါင်းစပ်ပြီး ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။"
          : "Video & AI voiceover created and downloaded!"
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      const msg =
        err instanceof Error ? err.message : "Failed to merge audio and video."
      toast.error(msg)
    } finally {
      setIsMergingVideo(false)
    }
  }

  const handleShareVideo = async () => {
    if (!mergedVideo) return
    const baseName =
      mediaMode === "video" && videoFile
        ? videoFile.name.replace(/\.[^.]+$/, "")
        : "burmese-ai-slideshow"
    const filename = `${baseName}-burmese-ai.${mergedVideo.fileExtension}`
    const file = new File([mergedVideo.blob], filename, {
      type: mergedVideo.mimeType,
    })

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: "Burmese AI Voiceover Video",
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        toast.error("Could not open share sheet. Use Download instead.")
      }
      return
    }

    triggerBlobDownload(mergedVideo.videoUrl, filename)
    toast.info("Direct sharing is not supported on this browser; downloading video instead.")
  }

  const canShareFiles =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  const voiceSummary =
    audioSourceMode === "original"
      ? recordedVoice
        ? `${isMy ? "ကိုယ်ပိုင်အသံ" : "My Voice"} · ${formatAudioClockDuration(recordedVoice.durationSeconds)}`
        : isMy
          ? "ကိုယ်ပိုင်အသံ (မသွင်းရသေးပါ)"
          : "My Voice (Not recorded)"
      : `${voiceType === "female" ? "Nilar" : "Thiha"} · ${speed.toFixed(1)}x${
          introSfx !== "none" ? ` · ${SOUND_EFFECT_PRESETS[introSfx].label}` : ""
        }`

  const mediaSummary =
    mediaMode === "photos"
      ? `${uploadedPhotos.length} Photos · ${aspectRatio === "original" ? "9:16" : aspectRatio}`
      : videoFile
        ? `Video · ${aspectRatio}`
        : `No media · ${aspectRatio}`

  const musicSummary = `${
    MUSIC_PRESET_OPTIONS.find((m) => m.id === musicPreset)?.label ?? "None"
  }${enableSubtitles ? ` · ${SUBTITLE_STYLE_OPTIONS.find((s) => s.id === subtitleStyle)?.label ?? "Subtitles"}` : ""}`

  return (
    <div className="max-w-3xl mx-auto space-y-4 lg:pb-6">
      <Card className="border-[#E7E5E4] dark:border-[#3F3F46] bg-card overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5 font-myanmar">
              <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isMy
                  ? "အသံသွင်းခန်းနှင့် ဗီဒီယိုထုတ်လုပ်ရေး စတူဒီယို"
                  : "Recording Booth & Video Studio"}
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 font-myanmar">
              {isMy
                ? "စာသားမှ အသံသွင်းပြီး ဗီဒီယို သို့မဟုတ် ဓာတ်ပုံ Slideshow နှင့် ပေါင်းစပ်ထုတ်ယူပါ"
                : "Record Burmese narration, mix music, and create 9:16 / 16:9 videos"}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            100% On-Device
          </Badge>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-5 space-y-3.5">
          {/* Dual Audio Source Mode 2-Pill Toggle */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/60">
              <button
                type="button"
                onClick={() => setAudioSourceMode("ai")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all cursor-pointer font-myanmar ${
                  audioSourceMode === "ai"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
              >
                <span aria-hidden="true">🤖</span>
                <span className="truncate">
                  {isMy ? "AI အသံသုံးမည် (AI TTS)" : "AI Voice (TTS)"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAudioSourceMode("original")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all cursor-pointer font-myanmar ${
                  audioSourceMode === "original"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
              >
                <span aria-hidden="true">🎙️</span>
                <span className="truncate">
                  {isMy ? "ကိုယ်ပိုင်အသံအစစ် သုံးမည် (My Voice)" : "My Recorded Voice"}
                </span>
              </button>
            </div>
          </div>

          {/* Built-In Voice Recorder & Auto-Transcriber + Script Input */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {!isRecordingVoice ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onTouchStart={() => unlockIosAudio()}
                    onClick={startVoiceRecording}
                    disabled={isTranscribingVoice || isGeneratingVoice || isMergingVideo}
                    className="h-8 px-3 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white border-0 font-myanmar"
                  >
                    <Mic className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    {isMy ? "🎤 အသံဖြင့် ပြောထည့်မည် (Record Voice)" : "🎤 Record Voice"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      {formatRecordTimer(recordingSeconds)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={stopVoiceRecording}
                      className="h-8 px-3 text-xs font-semibold font-myanmar"
                    >
                      <Square className="h-3 w-3 mr-1.5 fill-current" aria-hidden="true" />
                      {isMy ? "ရပ်မည်" : "Stop"}
                    </Button>
                  </div>
                )}

                <input
                  ref={voiceUploadInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm"
                  onChange={handleUploadVoiceFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => voiceUploadInputRef.current?.click()}
                  disabled={isRecordingVoice || isTranscribingVoice || isGeneratingVoice}
                  className="h-8 px-2.5 text-xs border-border/60 font-myanmar"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {isMy ? "အသံဖိုင်တင်မည်" : "Upload Audio"}
                </Button>
              </div>

              {isTranscribingVoice ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 font-myanmar">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {isMy
                    ? "Gemini 2.5 Flash ဖြင့် စာသားပြောင်းနေပါသည်..."
                    : "Transcribing & cleaning script..."}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground font-myanmar">
                  {isMy
                    ? "ပြောပြီးလျှင် စာသားအလိုအလျောက် ပြောင်းပေးပါမည်"
                    : "Auto-transcribes & cleans fillers"}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="voiceover-page-text"
                  className="text-xs font-medium text-muted-foreground font-myanmar"
                >
                  {isMy ? "အသံဖတ်မည့် စာသား" : "Spoken Script"}
                </Label>
                {voiceoverDraftScript.trim() && (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-myanmar"
                  >
                    <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                    {isMy
                      ? `ခန့်မှန်းကြာချိန်: ~${estimateSpokenDurationSeconds(voiceoverDraftScript, speed)} စက္ကန့်`
                      : `Est. duration: ~${estimateSpokenDurationSeconds(voiceoverDraftScript, speed)}s`}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTeleprompterPlaying(false)
                    setTeleprompterOpen(true)
                  }}
                  disabled={!voiceoverDraftScript.trim()}
                  className="h-7 px-2.5 text-[11px] font-medium font-myanmar border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                >
                  <ScrollText className="h-3 w-3 mr-1" />
                  {isMy ? "Teleprompter" : "Teleprompter"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOptimizeSpeechText}
                  disabled={!voiceoverDraftScript.trim() || isGeneratingVoice}
                  className="h-7 px-2.5 text-[11px] font-medium font-myanmar border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10"
                >
                  🪄 {isMy ? "အသံထွက်စာသား ပြောင်းမည်" : "Optimize for Voice"}
                </Button>
                {voiceoverDraftScript && (
                  <button
                    type="button"
                    onClick={() => setVoiceoverDraftScript("")}
                    className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {isMy ? "ရှင်းမည်" : "Clear"}
                  </button>
                )}
              </div>
            </div>

            <Textarea
              ref={textareaRef}
              id="voiceover-page-text"
              value={voiceoverDraftScript}
              onChange={(e) => setVoiceoverDraftScript(e.target.value)}
              rows={4}
              placeholder={
                isMy
                  ? "အသံပြောင်းလိုသော မြန်မာစာသားကို ရိုက်ထည့်ပါ... ([pause 1s] များထည့်နိုင်သည်)"
                  : "Type or paste Burmese script here... Use [pause 1s] pills for dramatic pauses."
              }
              className="text-sm font-myanmar leading-relaxed resize-y bg-background/80 border-border/60"
            />

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mr-0.5">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {isMy ? "အသံရပ်နားချိန်:" : "Insert Pause:"}
              </span>
              {PAUSE_PILLS.map((pill) => (
                <button
                  key={pill.tag}
                  type="button"
                  onClick={() => handleInsertPauseTag(pill.tag)}
                  className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer"
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accordion 1: Voice & SFX */}
          <div className="rounded-xl border border-border/60 bg-muted/15 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("voice")}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Mic className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>{isMy ? "Voice & SFX (အသံနှင့် SFX)" : "Voice & SFX"}</span>
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {voiceSummary}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                    openSection === "voice" ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {openSection === "voice" && (
              <div className="px-3.5 pb-3.5 pt-2 border-t border-border/50 space-y-3">
                {audioSourceMode === "original" && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300 font-myanmar">
                    {isMy
                      ? "🎙️ ကိုယ်ပိုင်အသံအစစ် (My Voice) မုဒ်ဖွင့်ထားပါသည် — AI TTS အသံအစား သင့်ကိုယ်ပိုင်အသံကို ဗီဒီယိုထဲသို့ တိုက်ရိုက်ထည့်သွင်းပေးပါမည်။"
                      : "🎙️ My Recorded Voice mode is active — your own recorded/uploaded voice will be used as the master track instead of AI TTS."}
                  </div>
                )}
                {audioSourceMode === "ai" && (
                  <>
                {/* Dual-Voice Dialogue Mode Toggle */}
                <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span>
                        {isMy ? "နှစ်ယောက်စကားပြော (Dual-Voice Dialogue)" : "Dual-Voice Dialogue (Nilar + Thiha)"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-myanmar mt-0.5">
                      {isMy
                        ? "Nilar: / Thiha: ဖြင့် ရေးပါ သို့မဟုတ် စာကြောင်းအလိုက် အလှည့်ကျပြောပါမည်"
                        : "Use Nilar: / Thiha: prefixes or alternate lines automatically."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {dialogueMode && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVoiceoverDraftScript(
                            isMy
                              ? "Nilar: မင်္ဂလာပါရှင်! ဒီနေ့တော့ အရမ်းမိုက်တဲ့ Product အသစ်လေးကို မိတ်ဆက်ပေးမယ်နော်။\nThiha: ဟုတ်ပါတယ်! ဈေးနှုန်းကလည်း အရမ်းတန်ပြီး Quality ကလည်း စိတ်ချရပါတယ်။"
                              : "Nilar: Hey everyone! Today we are checking out something super exciting.\nThiha: That's right, and the best part is how easy it is to use every day!"
                          )
                        }
                        className="h-7 px-2 text-[11px]"
                      >
                        {isMy ? "နမူနာ" : "Sample"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={dialogueMode ? "default" : "outline"}
                      onClick={() => setDialogueMode((prev) => !prev)}
                      className="h-7 px-2.5 text-[11px]"
                    >
                      {dialogueMode ? (isMy ? "ဖွင့်ထားသည်" : "ON") : isMy ? "ပိတ်ထားသည်" : "OFF"}
                    </Button>
                  </div>
                </div>

                {/* Delivery Tone */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground font-myanmar">
                    {isMy ? "အသံဟန် (Voice Style)" : "Voice Delivery Style"}
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["promo", "storytelling", "educational"] as VoiceDeliveryTone[]).map((tone) => {
                      const preset = VOICE_DELIVERY_PRESETS[tone]
                      const active = deliveryTone === tone
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => setDeliveryTone(tone)}
                          className={`rounded-lg border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                            active
                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <div className="text-[11px] font-semibold leading-tight truncate">
                            {preset.label}
                          </div>
                          <div className="text-[10px] opacity-80 truncate font-myanmar mt-0.5">
                            {preset.labelMy}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Voice & Speed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      {isMy ? "အသံအမျိုးအစား" : "Voice"}
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["female", "male"] as BurmeseVoiceType[]).map((type) => {
                        const preset = BURMESE_VOICE_PRESETS[type]
                        const active = voiceType === type
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setVoiceType(type)}
                            className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                              active
                                ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            <div className="text-xs font-semibold leading-tight font-myanmar">
                              {isMy
                                ? type === "female" ? "စာဖတ်သူ - နီလာ" : "စာဖတ်သူ - သီဟ"
                                : type === "female" ? "Narrator - Nilar" : "Narrator - Thiha"}
                            </div>
                            <div className="text-[10px] opacity-80 truncate font-myanmar">
                              {type === "female" ? "Female" : "Male"}
                            </div>
                            <span className="sr-only">{preset.labelMy}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      {isMy ? "မြန်နှုန်း" : "Speed"}
                    </Label>
                    <div className="grid grid-cols-4 gap-1">
                      {VOICEOVER_SPEEDS.map((option) => {
                        const active = speed === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setSpeed(option)}
                            className={`rounded-lg border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                              active
                                ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            {option.toFixed(1)}x
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 1-Tap Intro Sound Effects */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Music className="h-3 w-3" aria-hidden="true" />
                    {isMy ? "အဖွင့်အသံ SFX (Intro Accent)" : "Intro Sound Effect (1-Tap Preview)"}
                  </Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["none", "pop", "whoosh", "cash_ding"] as SoundEffectType[]).map((sfx) => {
                      const preset = SOUND_EFFECT_PRESETS[sfx]
                      const active = introSfx === sfx
                      return (
                        <button
                          key={sfx}
                          type="button"
                          onClick={() => handleSelectSfx(sfx)}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer truncate ${
                            active
                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          {isMy ? preset.labelMy : preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Custom Pronunciation Dictionary Trigger -> Opens iOS Bottom Sheet */}
                <button
                  type="button"
                  onClick={() => setIsDictOpen(true)}
                  className="w-full flex items-center justify-between gap-2 rounded-[14px] border-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-white/80 dark:bg-[#2C2C2E]/80 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-white dark:hover:bg-[#3A3A3C] transition-all active:scale-[0.99] cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-myanmar">
                    <SquircleIcon icon={BookOpen} tone="indigo" size="sm" />
                    <span>{isMy ? "အသံထွက်မှတ်စု (Custom Words)" : "Custom Pronunciations"}</span>
                    {customPronunciations.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 tabular-nums">
                        {customPronunciations.length}
                      </Badge>
                    )}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground -rotate-90" strokeWidth={1.75} aria-hidden="true" />
                </button>

                <Dialog open={isDictOpen} onOpenChange={setIsDictOpen}>
                  <DialogContent className="sm:max-w-md">
                    <div className="flex items-center gap-2.5 pr-8">
                      <SquircleIcon icon={BookOpen} tone="indigo" size="md" />
                      <div className="min-w-0">
                        <DialogTitle className="text-base font-semibold font-myanmar">
                          {isMy ? "အသံထွက်မှတ်စု (Custom Words)" : "Custom Pronunciations"}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-myanmar">
                          {isMy
                            ? "အင်္ဂလိပ်စကားလုံးများကို မြန်မာအသံထွက်အဖြစ် မှတ်သားထားပါ"
                            : "Map brand names or English words to Burmese phonetics"}
                        </DialogDescription>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={newDictWord}
                          onChange={(e) => setNewDictWord(e.target.value)}
                          placeholder={isMy ? "စကားလုံး (GlowSkin)" : "Word (e.g. GlowSkin)"}
                          className="h-9 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleAddPronunciation()
                            }
                          }}
                        />
                        <Input
                          value={newDictPhonetic}
                          onChange={(e) => setNewDictPhonetic(e.target.value)}
                          placeholder={isMy ? "မြန်မာအသံထွက်" : "Burmese Phonetic"}
                          className="h-9 text-xs font-myanmar"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleAddPronunciation()
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddPronunciation}
                          className="h-9 px-3.5 text-xs shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" strokeWidth={2} aria-hidden="true" />
                          {isMy ? "ထည့်" : "Add"}
                        </Button>
                      </div>

                      {customPronunciations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pt-1">
                          {customPronunciations.map((entry) => (
                            <span
                              key={entry.id}
                              className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-[#F2F2F7] dark:bg-[#2C2C2E] px-3 py-1 text-xs"
                            >
                              <span className="font-medium">{entry.word}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-myanmar text-[#007AFF] dark:text-[#0A84FF] font-medium">
                                {entry.phonetic}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeCustomPronunciation(entry.id)}
                                aria-label={`Remove ${entry.word}`}
                                className="ml-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-3 font-myanmar">
                          {isMy ? "မှတ်စု မရှိသေးပါ" : "No custom pronunciations yet"}
                        </p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Accordion 2: Media & Ratio */}
          <div className="rounded-xl border border-border/60 bg-muted/15 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("media")}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Film className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{isMy ? "Media & Ratio (မီဒီယာနှင့် အချိုး)" : "Media & Ratio"}</span>
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {mediaSummary}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                    openSection === "media" ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {openSection === "media" && (
              <div className="px-3.5 pb-3.5 pt-2 border-t border-border/50 space-y-3">
                {/* Video vs Photos Mode Switch */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMediaMode("video")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      mediaMode === "video"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isMy ? "ဗီဒီယိုဖိုင်" : "Video Clip"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaMode("photos")
                      if (aspectRatio === "original") setAspectRatio("9:16")
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      mediaMode === "photos"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isMy ? "ဓာတ်ပုံ Slideshow (၂–၁၀)" : "Photos (2–10)"}</span>
                  </button>
                </div>

                {/* Video Uploader */}
                {mediaMode === "video" ? (
                  !videoFile ? (
                    <div className="relative rounded-xl border-2 border-dashed border-border/70 bg-background/50 hover:bg-muted/40 hover:border-emerald-500/50 p-4 text-center transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv"
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => {
                          handleSelectVideoFile(e.target.files?.[0])
                          e.target.value = ""
                        }}
                      />
                      <div className="flex items-center justify-center gap-2 pointer-events-none">
                        <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-medium text-muted-foreground font-myanmar">
                          {isMy
                            ? "ဗီဒီယိုဖိုင် ရွေးချယ်ပါ (MP4, MOV)"
                            : "Tap to upload video (MP4, MOV, WebM)"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 space-y-2">
                      {videoPreviewUrl && (
                        <video
                          src={videoPreviewUrl}
                          controls
                          playsInline
                          muted
                          onLoadedMetadata={(e) => {
                            const dur = e.currentTarget.duration
                            if (Number.isFinite(dur) && dur > 0) {
                              setVideoDuration(dur)
                              if (voiceoverResult) {
                                setDurationSyncMode(
                                  voiceoverResult.durationSeconds > dur ? "loop_video" : "fit_video"
                                )
                              }
                            }
                          }}
                          className="w-full max-h-[150px] rounded-lg bg-black/90 object-contain"
                        />
                      )}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium truncate">{videoFile.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {videoDuration !== null && (
                            <Badge variant="outline" className="text-[10px]">
                              {videoDuration.toFixed(1)}s
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {formatFileSize(videoFile.size)}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              clearUploadedVideo()
                              revokeMergedUrl()
                              setMergedVideo(null)
                            }}
                            className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  /* Photo Slideshow Uploader */
                  <div className="space-y-2">
                    <div className="relative rounded-xl border-2 border-dashed border-border/70 bg-background/50 hover:bg-muted/40 hover:border-emerald-500/50 p-3.5 text-center transition-colors cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => {
                          handleSelectPhotoFiles(e.target.files)
                          e.target.value = ""
                        }}
                      />
                      <div className="flex items-center justify-center gap-2 pointer-events-none">
                        <ImagePlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-medium text-muted-foreground font-myanmar">
                          {isMy
                            ? `ဓာတ်ပုံ ၂–၁၀ ပုံ ရွေးချယ်ပါ (${uploadedPhotos.length}/10)`
                            : `Tap to add 2–10 photos for Ken Burns slideshow (${uploadedPhotos.length}/10)`}
                        </span>
                      </div>
                    </div>

                    {uploadedPhotos.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            {uploadedPhotos.length < 2
                              ? isMy
                                ? "အနည်းဆုံး ၂ ပုံ ထပ်ထည့်ပါ"
                                : "Add at least 1 more photo (min 2)"
                              : isMy
                                ? `${uploadedPhotos.length} ပုံ (Crossfade + Zoom)`
                                : `${uploadedPhotos.length} photos · Auto-synced to voiceover`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              clearUploadedPhotos()
                              revokeMergedUrl()
                              setMergedVideo(null)
                            }}
                            className="text-destructive hover:underline cursor-pointer"
                          >
                            {isMy ? "အားလုံးဖယ်" : "Clear all"}
                          </button>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {uploadedPhotos.map((photo, index) => (
                            <div
                              key={photo.id}
                              className="relative aspect-square rounded-lg overflow-hidden border border-border/60 bg-black/20"
                            >
                              <img
                                src={photo.previewUrl}
                                alt={`Slide ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] text-white">
                                {index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(photo.id)}
                                aria-label={`Remove photo ${index + 1}`}
                                className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-destructive cursor-pointer"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Aspect Ratio Selector + Blurred Background Fill */}
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <RectangleVertical className="h-3 w-3" aria-hidden="true" />
                      {isMy ? "ဗီဒီယိုအချိုး (Aspect Ratio)" : "Aspect Ratio"}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setEnableBlurredBackground((prev) => !prev)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                        enableBlurredBackground
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "border-border/60 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      <span>{isMy ? "Blur နောက်ခံဖြည့်" : "Blurred Bg Fill"}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ASPECT_RATIO_OPTIONS.filter(
                      (opt) => mediaMode === "video" || opt.id !== "original"
                    ).map((opt) => {
                      const active = aspectRatio === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAspectRatio(opt.id)}
                          className={`rounded-lg border px-1.5 py-1.5 text-center transition-colors cursor-pointer ${
                            active
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <div className="text-[11px] font-bold leading-tight">{opt.label}</div>
                          <div className="text-[9px] opacity-80 truncate">{opt.sub}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Video-specific Sync & Original Volume */}
                {mediaMode === "video" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 font-myanmar">
                        <Repeat className="h-3 w-3" aria-hidden="true" />
                        {isMy ? "အချိန်ကိုက်ညှိမှု" : "Duration Sync"}
                      </Label>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setDurationSyncMode("loop_video")}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium text-left cursor-pointer ${
                            durationSyncMode === "loop_video"
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <div className="truncate font-semibold">
                            {isMy ? "ပြန်ကျော့" : "Loop Video"}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDurationSyncMode("fit_video")}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium text-left cursor-pointer ${
                            durationSyncMode === "fit_video"
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <div className="truncate font-semibold flex items-center gap-1">
                            <Scissors className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                            {isMy ? "ဗီဒီယိုအတိုင်း" : "Fit Video"}
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 font-myanmar">
                        {originalVolume === 0 ? (
                          <VolumeX className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Volume2 className="h-3 w-3" aria-hidden="true" />
                        )}
                        {isMy ? "မူရင်းဗီဒီယိုအသံ" : "Original Audio"}
                      </Label>
                      <div className="grid grid-cols-3 gap-1">
                        {VOLUME_OPTIONS.map((opt) => {
                          const active = originalVolume === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setOriginalVolume(opt.value)}
                              className={`rounded-lg border px-1 py-1.5 text-[10px] font-semibold truncate cursor-pointer ${
                                active
                                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                  : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accordion 3: Music & Subtitles */}
          <div className="rounded-xl border border-border/60 bg-muted/15 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("music")}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Music className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>{isMy ? "Music & Subtitles (တေးဂီတနှင့် စာတန်း)" : "Music & Subtitles"}</span>
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                  {musicSummary}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                    openSection === "music" ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {openSection === "music" && (
              <div className="px-3.5 pb-3.5 pt-2 border-t border-border/50 space-y-3">
                {/* Background Music Mixer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                      <Music className="h-3 w-3" aria-hidden="true" />
                      <span>{isMy ? "နောက်ခံတေးဂီတ" : "Background Music"}</span>
                      {musicPreset !== "none" && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                          Auto-Duck 12%
                        </Badge>
                      )}
                    </Label>
                    {musicPreset !== "none" && (
                      <button
                        type="button"
                        onClick={handleToggleMusicPreview}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium hover:bg-muted cursor-pointer"
                      >
                        {isPreviewingMusic ? (
                          <>
                            <Square className="h-2.5 w-2.5 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-2.5 w-2.5 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {MUSIC_PRESET_OPTIONS.map((opt) => {
                      const active = musicPreset === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            stopBackgroundMusicPreview()
                            setIsPreviewingMusic(false)
                            setMusicPreset(opt.id)
                            if (opt.id === "custom" && !customMusicFile) {
                              customMusicInputRef.current?.click()
                            }
                          }}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer truncate ${
                            active
                              ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold"
                              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          {isMy ? opt.labelMy : opt.label}
                        </button>
                      )
                    })}
                  </div>

                  <input
                    ref={customMusicInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.aac"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setCustomMusicFile(file)
                        setMusicPreset("custom")
                      }
                      e.target.value = ""
                    }}
                  />

                  {musicPreset === "custom" && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-[11px]">
                      <span className="truncate text-muted-foreground">
                        {customMusicFile
                          ? customMusicFile.name
                          : isMy
                            ? ".mp3 / .m4a ဖိုင်မရွေးရသေးပါ"
                            : "No .mp3/.m4a file selected"}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => customMusicInputRef.current?.click()}
                        className="h-6 px-2 text-[10px] shrink-0"
                      >
                        {customMusicFile ? "Change" : "Choose File"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Subtitles & Styles + SRT */}
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEnableSubtitles((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer font-myanmar ${
                          enableSubtitles
                            ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <Captions className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isMy ? "စာတန်းထိုး ထည့်မည်" : "Auto Subtitles"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!brandSignature.trim()) {
                            toast.info(
                              isMy
                                ? "Watermark ထည့်ရန် Settings တွင် Brand Signature အရင်သတ်မှတ်ပါ။"
                                : "Set your Brand Signature in Settings to enable watermark."
                            )
                            return
                          }
                          setEnableWatermark((prev) => !prev)
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          enableWatermark && brandSignature.trim()
                            ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="truncate max-w-[120px]">
                          {brandSignature.trim() ? brandSignature.trim() : "Watermark"}
                        </span>
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadSrt}
                      disabled={!voiceoverDraftScript.trim()}
                      className="h-7 px-2.5 text-[11px] border-border/60"
                    >
                      <FileText className="h-3 w-3 mr-1" aria-hidden="true" />
                      Download .SRT
                    </Button>
                  </div>

                  {enableSubtitles && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {SUBTITLE_STYLE_OPTIONS.map((style) => {
                        const active = subtitleStyle === style.id
                        return (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => setSubtitleStyle(style.id)}
                            className={`rounded-lg border p-1.5 text-center transition-colors cursor-pointer ${
                              active
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-border/60 bg-background/60 hover:bg-muted/40"
                            }`}
                          >
                            <div
                              className={`mx-auto mb-1 w-fit rounded px-1.5 py-0.5 text-[9px] border ${style.previewClass}`}
                            >
                              Aa မြန်မာ
                            </div>
                            <div className="text-[10px] font-medium truncate">
                              {style.label}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Generate Audio CTA (AI TTS Mode only) */}
          {audioSourceMode === "ai" && (
            <div className="pt-1 space-y-2">
              <Button
                type="button"
                onTouchStart={() => unlockIosAudio()}
                onClick={handleGenerateVoice}
                disabled={isGeneratingVoice || isMergingVideo || !voiceoverDraftScript.trim()}
                className="w-full min-h-[44px] sm:h-10 text-sm font-semibold font-myanmar"
              >
                {isGeneratingVoice ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    {voiceProgress && voiceProgress.totalChunks > 1
                      ? isMy
                        ? `အသံဖိုင် ပြင်ဆင်နေပါသည်... (အပိုင်း ${toBurmeseDigits(voiceProgress.currentChunk)}/${toBurmeseDigits(voiceProgress.totalChunks)})`
                        : `Preparing audio... (Part ${voiceProgress.currentChunk}/${voiceProgress.totalChunks})`
                      : isMy
                        ? "အသံဖိုင် ပြင်ဆင်နေပါသည်..."
                        : "Preparing audio..."}
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" aria-hidden="true" />
                    {isMy ? "အသံသွင်းနမူနာ ပြင်ဆင်မည်" : "Generate Voice Preview"}
                  </>
                )}
              </Button>
              {isGeneratingVoice && voiceProgress && voiceProgress.totalChunks > 1 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {isMy
                        ? `အသံဖိုင် ပြင်ဆင်နေပါသည်... (အပိုင်း ${toBurmeseDigits(voiceProgress.currentChunk)}/${toBurmeseDigits(voiceProgress.totalChunks)})`
                        : `Preparing part ${voiceProgress.currentChunk} of ${voiceProgress.totalChunks}...`}
                    </span>
                    <span className="font-semibold text-foreground">
                      {Math.round((voiceProgress.currentChunk / voiceProgress.totalChunks) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-200"
                      style={{
                        width: `${Math.round((voiceProgress.currentChunk / voiceProgress.totalChunks) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audio Preview Player (AI TTS Mode) */}
          {audioSourceMode === "ai" && voiceoverResult && (
            <IosAudioPlayer
              src={voiceoverResult.audioUrl}
              title={voiceoverResult.voiceName}
              subtitle={
                isMy
                  ? `စုစုပေါင်း အသံကြာချိန်: ${formatAudioClockDuration(voiceoverResult.durationSeconds)}`
                  : `Total Duration: ${formatAudioClockDuration(voiceoverResult.durationSeconds)}`
              }
              initialDuration={voiceoverResult.durationSeconds}
              fileExtension={voiceoverResult.fileExtension}
              onDownload={handleDownloadAudio}
              onShare={handleShareAudio}
              downloadLabel={isMy ? "ဒေါင်းလုဒ်" : "Download"}
              shareLabel={canShareFiles ? (isMy ? "မျှဝေမည်" : "Share") : (isMy ? "သိမ်းမည်" : "Save")}
              accentColor="blue"
            />
          )}

          {/* Recorded / Uploaded Voice Preview Player (My Voice Mode) */}
          {audioSourceMode === "original" && (
            recordedVoice ? (
              <div className="space-y-2">
                <IosAudioPlayer
                  src={recordedVoice.audioUrl}
                  title={`🎙️ ${recordedVoice.label}`}
                  subtitle={
                    isMy
                      ? `ကြာချိန်: ${formatAudioClockDuration(recordedVoice.durationSeconds)}`
                      : `Duration: ${formatAudioClockDuration(recordedVoice.durationSeconds)}`
                  }
                  initialDuration={recordedVoice.durationSeconds}
                  fileExtension={recordedVoice.fileExtension}
                  onDownload={handleDownloadRecordedVoice}
                  downloadLabel={isMy ? "ဒေါင်းလုဒ်" : "Download"}
                  accentColor="emerald"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearRecordedVoice}
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    {isMy ? "ဖယ်ရှားမည်" : "Clear"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/[0.03] px-3.5 py-3 text-xs text-muted-foreground font-myanmar">
                {isMy
                  ? "🎙️ အထက်ပါ 'အသံဖြင့် ပြောထည့်မည်' ခလုတ်ကို နှိပ်၍ အသံသွင်းပါ သို့မဟုတ် အသံဖိုင်တင်ပါ — ထိုအသံကို ဗီဒီယို၏ Master Voiceover အဖြစ် တိုက်ရိုက်အသုံးပြုပါမည်။"
                  : "🎙️ Click 'Record Voice' or 'Upload Audio' above to capture your own voiceover track for video export."}
              </div>
            )
          )}

          {/* Create / Merge Video Action */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onTouchStart={() => unlockIosAudio()}
                onClick={handleMergeVideo}
                disabled={!activeVoiceoverAudio || !hasReadyMedia || isMergingVideo || isGeneratingVoice || isRecordingVoice}
                className="flex-1 h-10 text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 disabled:opacity-50"
              >
                {isMergingVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
                    Rendering Video... {mergeProgress}%
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    {mediaMode === "photos"
                      ? isMy
                        ? "ဓာတ်ပုံ Slideshow ဗီဒီယို ထုတ်ယူမည်"
                        : "Create Slideshow Video & Download"
                      : isMy
                        ? "ဗီဒီယိုနှင့် ပေါင်းစပ်ပြီး ဒေါင်းလုဒ်ဆွဲမည်"
                        : "Merge into Video & Download"}
                  </>
                )}
              </Button>

              {mergedVideo && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleShareVideo}
                  className="h-10 px-4 text-xs font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                >
                  <Share2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {canShareFiles ? (isMy ? "မျှဝေမည်" : "Share Video") : (isMy ? "ထပ်မံဒေါင်းလုဒ်ဆွဲမည်" : "Download Again")}
                </Button>
              )}
            </div>

            {isMergingVideo && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Rendering Video &amp; Audio...</span>
                  <span className="font-semibold text-foreground">{mergeProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-150"
                    style={{ width: `${mergeProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Saved Audio Session History */}
      {audioHistory.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2.5">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <History className="h-4 w-4 text-indigo-500" />
              <span>{isMy ? "အသံသွင်းမှတ်တမ်း (Audio History)" : "Recent Audio Sessions"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {audioHistory.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {item.voiceLabel}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatAudioClockDuration(item.durationSeconds)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground line-clamp-2 font-myanmar">
                    {item.script}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setVoiceoverDraftScript(item.script)
                      setDialogueMode(item.mode === "dialogue")
                      toast.success(isMy ? "Script ထဲသို့ ပြန်ထည့်ပြီးပါပြီ" : "Loaded into script!")
                    }}
                    className="h-7 px-2 text-[11px]"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {isMy ? "ပြန်သုံးမည်" : "Load"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(item.script)
                      toast.success(isMy ? "Copy ကူးပြီးပါပြီ" : "Copied!")
                    }}
                    className="h-7 w-7 p-0"
                    aria-label="Copy script"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteAudioSession(item.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete session"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Smart Teleprompter Overlay */}
      <Dialog
        open={teleprompterOpen}
        onOpenChange={(open) => {
          setTeleprompterOpen(open)
          if (!open) setTeleprompterPlaying(false)
        }}
      >
        <DialogContent className="max-w-lg sm:max-w-xl p-4 sm:p-5 bg-neutral-950 text-white border-neutral-800">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-emerald-400" />
              <span>{isMy ? "Smart Teleprompter" : "Smart Teleprompter"}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Auto-scrolling teleprompter for voiceover recording.
          </DialogDescription>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-900 p-2 border border-neutral-800">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={() => setTeleprompterPlaying((prev) => !prev)}
                className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {teleprompterPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 mr-1" />
                    {isMy ? "ခဏရပ်" : "Pause"}
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {isMy ? "စတင်ရွှေ့မည်" : "Scroll"}
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (teleprompterScrollRef.current) {
                    teleprompterScrollRef.current.scrollTop = 0
                  }
                }}
                className="h-8 px-2.5 text-xs border-neutral-700 text-neutral-200 hover:bg-neutral-800"
              >
                {isMy ? "အစသို့" : "Top"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                <span>{isMy ? "အမြန်နှုန်း" : "Speed"}</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={teleprompterSpeed}
                  onChange={(e) => setTeleprompterSpeed(Number(e.target.value))}
                  className="w-20 accent-emerald-500"
                />
                <span className="tabular-nums w-8">{teleprompterSpeed.toFixed(1)}x</span>
              </label>
              <div className="flex items-center rounded-md border border-neutral-700 overflow-hidden">
                {(["md", "lg", "xl"] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setTeleprompterFontSize(sz)}
                    className={`px-2 py-1 text-[11px] uppercase cursor-pointer ${
                      teleprompterFontSize === sz
                        ? "bg-emerald-600 text-white"
                        : "text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={teleprompterScrollRef}
            className="h-72 sm:h-80 overflow-y-auto rounded-xl bg-black/60 border border-neutral-800 p-5 scroll-smooth"
          >
            <p
              className={`font-myanmar leading-relaxed whitespace-pre-wrap text-neutral-100 ${
                teleprompterFontSize === "xl"
                  ? "text-2xl sm:text-3xl"
                  : teleprompterFontSize === "lg"
                    ? "text-xl sm:text-2xl"
                    : "text-base sm:text-lg"
              }`}
            >
              {voiceoverDraftScript}
            </p>
            <div className="h-48" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
