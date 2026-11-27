"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  Copy,
  Lightbulb,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import {
  generateEditorialDualAngles,
  generateEditorialHooks,
  polishEditorialDraft,
  transcribeAudioWithGemini,
  type EditorialFormatOption,
  type EditorialLengthOption,
  type EditorialToneOption,
} from "@/api/aiService"
import { cleanVoiceoverText } from "@/api/ttsService"
import { prepareAudioForGemini } from "@/lib/audioProcessor"
import {
  MIN_VALID_RECORDING_BYTES,
  createWavAudioRecorder,
  getAudioContextConstructor,
  unlockIosAudio,
  type WavAudioRecorderHandle,
} from "@/lib/iosAudio"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { RecentHistorySheet } from "@/components/shared/recent-history-sheet"
import { t } from "@/locales/translations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn, triggerHaptic } from "@/lib/utils"

const HOOK_STARTER_GROUPS: Array<{
  category: string
  categoryMy: string
  hooks: Array<{ labelMy: string; labelEn: string }>
}> = [
  {
    category: "Sales",
    categoryMy: "အရောင်း",
    hooks: [
      {
        labelMy: "⚡ ဒီနေ့တစ်ရက်တည်း Stock အကန့်အသတ်နဲ့ အထူးလျှော့ဈေး...",
        labelEn: "⚡ Today only — limited stock special offer...",
      },
      {
        labelMy: "🔥 မေးနေကြတဲ့ ပစ္စည်းလေး Restock ပြန်ဝင်ပါပြီနော်!",
        labelEn: "🔥 Back in stock — the item everyone's been asking for!",
      },
      {
        labelMy: "💬 ဈေးတန်ပြီး အရည်အသွေးကောင်းတာလေး ရှာနေရင် ဒါလေးကြည့်ပါ...",
        labelEn: "💬 Looking for great value without compromising quality? Look here...",
      },
    ],
  },
  {
    category: "Story",
    categoryMy: "ဇာတ်လမ်း",
    hooks: [
      {
        labelMy: "🌿 အစတုန်းက ကျွန်တော်/ကျွန်မလည်း ဒီလိုပဲ အခက်အခဲရှိခဲ့ဖူးတယ်...",
        labelEn: "🌿 Honestly, I used to struggle with this exact same problem...",
      },
      {
        labelMy: "✨ တစ်နေ့ကို ၅ မိနစ်လေးပဲ အချိန်ပေးလိုက်တာနဲ့ ပြောင်းလဲသွားတဲ့ အရာ...",
        labelEn: "✨ The one 5-minute habit that changed everything for me...",
      },
    ],
  },
  {
    category: "Review",
    categoryMy: "သုံးသပ်ချက်",
    hooks: [
      {
        labelMy: "⭐ ၂ ပတ်တိတိ ကိုယ်တိုင်သုံးကြည့်ပြီးမှ ပြန်ပြောပြချင်တဲ့ အမှန်တရား...",
        labelEn: "⭐ My honest review after using this daily for 2 weeks...",
      },
      {
        labelMy: "👍 ဝယ်ပြီးသား Customer တွေအကုန် ထပ်မှာနေကြရတဲ့ အကြောင်းအရင်း ၃ ချက်...",
        labelEn: "👍 3 reasons why customers keep coming back for this...",
      },
    ],
  },
]

function countGraphemes(text: string, locale: string): number {
  if (!text) return 0
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const SegmenterCtor = (
      Intl as unknown as {
        Segmenter: new (
          locale?: string,
          options?: { granularity: "grapheme" | "word" | "sentence" }
        ) => { segment: (input: string) => Iterable<unknown> }
      }
    ).Segmenter
    const segmenter = new SegmenterCtor(locale === "my" ? "my" : "en", {
      granularity: "grapheme",
    })
    let count = 0
    for (const _ of segmenter.segment(text)) {
      count += 1
    }
    return count
  }
  return Array.from(text).length
}

const FORMAT_CHIPS: Array<{
  id: EditorialFormatOption
  labelKey: string
}> = [
  { id: "fb_sales", labelKey: "postWriter.formatFbSales" },
  { id: "tiktok_script", labelKey: "postWriter.formatTiktokScript" },
  { id: "product_review", labelKey: "postWriter.formatProductReview" },
  { id: "personal_story", labelKey: "postWriter.formatPersonalStory" },
]

const TONE_OPTIONS: Array<{
  id: EditorialToneOption
  labelKey: string
}> = [
  { id: "warm_friend", labelKey: "postWriter.toneWarm" },
  { id: "calm_clear", labelKey: "postWriter.toneCalm" },
  { id: "light_humorous", labelKey: "postWriter.toneHumorous" },
]

const LENGTH_OPTIONS: Array<{
  id: EditorialLengthOption
  labelKey: string
}> = [
  { id: "short", labelKey: "postWriter.lengthShort" },
  { id: "medium", labelKey: "postWriter.lengthMedium" },
  { id: "detailed", labelKey: "postWriter.lengthDetailed" },
]

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function replaceOpeningLine(text: string, newHook: string): string {
  const trimmed = text.trim()
  if (!trimmed) return newHook.trim()
  const paragraphs = trimmed.split(/\n\s*\n/)
  if (paragraphs.length > 1) {
    return [newHook.trim(), ...paragraphs.slice(1)].join("\n\n")
  }
  const lines = trimmed.split("\n")
  if (lines.length > 1) {
    return [newHook.trim(), ...lines.slice(1)].join("\n")
  }
  return newHook.trim()
}

function hasConfiguredWriterApiKey(): boolean {
  const { aiProvider, apiKeys } = useUIStore.getState()
  const envGeminiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
  const envOpenRouterKey =
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? ""
  if (aiProvider === "gemini") {
    const geminiPool = useContentStore.getState().getGeminiKeyPool()
    return Boolean(geminiPool.length > 0 || apiKeys.gemini.trim() || envGeminiKey)
  }
  if (aiProvider === "openrouter") {
    return Boolean(apiKeys.openrouter.trim() || envOpenRouterKey)
  }
  return Boolean(apiKeys.groq.trim())
}

function formatWriterApiError(
  err: unknown,
  language: "en" | "my",
  fallbackKey: string
): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  const lower = raw.toLowerCase()

  if (
    lower.includes("api key is required") ||
    lower.includes("missing api key") ||
    lower.includes("no api key") ||
    raw.includes("API Key ထည့်သွင်းထားခြင်းမရှိ")
  ) {
    return t(language, "postWriter.error.missingKey")
  }
  if (
    lower.includes("user location is not supported") ||
    lower.includes("location is not supported") ||
    lower.includes("not available in your country") ||
    lower.includes("region")
  ) {
    return t(language, "postWriter.error.regionBlocked")
  }
  if (
    lower.includes("invalid api key") ||
    lower.includes("api key not valid") ||
    lower.includes("invalid_api_key") ||
    lower.includes("unauthorized") ||
    lower.includes("(401)") ||
    lower.includes("(403)")
  ) {
    return t(language, "postWriter.error.invalidKey")
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed") ||
    lower.includes("err_internet_disconnected")
  ) {
    return t(language, "postWriter.error.networkError")
  }
  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("429")
  ) {
    return t(language, "postWriter.error.quotaExceeded")
  }

  return raw.trim() || t(language, fallbackKey)
}

export function GeneratorPage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setActivePageKey: state.setActivePageKey,
    }))
  )

  const {
    draftInput,
    setDraftInput,
    clearTextPostDraft,
    voiceDnaSamples,
    setVoiceDnaSamples,
    shopProfile,
    setShopProfile,
    editorialTone,
    setEditorialTone,
    editorialLength,
    setEditorialLength,
    editorialFormat,
    setEditorialFormat,
    editorialResult,
    setEditorialResult,
    clearEditorialResult,
    setVoiceoverDraftScript,
    saveToVault,
    addGeneratedItem,
    generatedHistory,
    setPosterDraft,
    liveModeEnabled,
  } = useContentStore(
    useShallow((state) => ({
      draftInput: state.draftInput,
      setDraftInput: state.setDraftInput,
      clearTextPostDraft: state.clearTextPostDraft,
      voiceDnaSamples: state.voiceDnaSamples,
      setVoiceDnaSamples: state.setVoiceDnaSamples,
      shopProfile: state.shopProfile,
      setShopProfile: state.setShopProfile,
      editorialTone: state.editorialTone,
      setEditorialTone: state.setEditorialTone,
      editorialLength: state.editorialLength,
      setEditorialLength: state.setEditorialLength,
      editorialFormat: state.editorialFormat,
      setEditorialFormat: state.setEditorialFormat,
      editorialResult: state.editorialResult,
      setEditorialResult: state.setEditorialResult,
      clearEditorialResult: state.clearEditorialResult,
      setVoiceoverDraftScript: state.setVoiceoverDraftScript,
      saveToVault: state.saveToVault,
      addGeneratedItem: state.addGeneratedItem,
      generatedHistory: state.generatedHistory,
      setPosterDraft: state.setPosterDraft,
      liveModeEnabled: state.liveModeEnabled,
    }))
  )

  const [rawNotes, setRawNotes] = useState<string>(() => draftInput.topic ?? "")
  const rawNotesRef = useRef(rawNotes)
  rawNotesRef.current = rawNotes
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [hookStartersOpen, setHookStartersOpen] = useState(false)
  const [undoDraftSnapshot, setUndoDraftSnapshot] = useState<{
    option: "A" | "B"
    text: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [writerError, setWriterError] = useState<string | null>(null)
  const [polishingAction, setPolishingAction] = useState<
    "hooks" | "shorten" | "humanize" | null
  >(null)
  const [copied, setCopied] = useState(false)

  // Voice Idea Capture (WAV mic recorder + Live chunked transcription)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [livePendingChunks, setLivePendingChunks] = useState(0)
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array(16).fill(14))
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const wavRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const liveTranscribeQueueRef = useRef<Promise<void>>(Promise.resolve())
  const liveSessionIdRef = useRef(0)
  const liveErrorShownRef = useRef(false)
  const recordingWasLiveRef = useRef(false)
  const touchStartXRef = useRef<number | null>(null)

  // Sync external updates to draftInput.topic (e.g., from Transcriber or Vault)
  useEffect(() => {
    const incoming = draftInput.topic ?? ""
    if (incoming !== rawNotes) {
      setRawNotes(incoming)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftInput.topic])

  const stopMediaResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setWaveformBars(Array(16).fill(14))
  }, [])

  useEffect(() => {
    return () => {
      liveSessionIdRef.current += 1
      stopMediaResources()
      wavRecorderRef.current?.cancel()
      wavRecorderRef.current = null
    }
  }, [stopMediaResources])

  const handleClearCanvas = () => {
    setRawNotes("")
    setUndoDraftSnapshot(null)
    clearTextPostDraft()
    clearEditorialResult()
  }

  const handleNotesChange = (value: string) => {
    rawNotesRef.current = value
    setRawNotes(value)
    setDraftInput({ topic: value })
  }

  const handleStartRecording = async () => {
    unlockIosAudio()

    if (!navigator.mediaDevices?.getUserMedia || !getAudioContextConstructor()) {
      toast.error(t(language, "postWriter.toast.micUnsupported"))
      return
    }

    if (liveModeEnabled && useContentStore.getState().getGeminiKeyPool().length === 0) {
      toast.error(
        t(language, "postWriter.toast.liveNeedsKey")
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
          noiseSuppression: false,
          autoGainControl: false,
          echoCancellation: true,
        },
      })
      streamRef.current = stream
      recordingWasLiveRef.current = liveModeEnabled
      liveSessionIdRef.current += 1
      const sessionId = liveSessionIdRef.current
      liveErrorShownRef.current = false
      liveTranscribeQueueRef.current = Promise.resolve()

      wavRecorderRef.current = createWavAudioRecorder(stream, {
        audioContext: recorderCtx,
        micFilterMode: useContentStore.getState().micFilterMode,
        barCount: 16,
        onBars: setWaveformBars,
        ...(liveModeEnabled
          ? {
              chunkIntervalMs: 3500,
              onChunk: (chunk) => {
                setLivePendingChunks((c) => c + 1)
                liveTranscribeQueueRef.current = liveTranscribeQueueRef.current
                  .then(async () => {
                    if (liveSessionIdRef.current !== sessionId) return
                    const transcript = await transcribeAudioWithGemini(
                      chunk.blob,
                      chunk.mimeType,
                      "auto",
                      "live-chunk.wav",
                      false
                    )
                    if (liveSessionIdRef.current !== sessionId) return
                    const clean = transcript.trim()
                    if (clean) {
                      const current = rawNotesRef.current.trim()
                      const next = current ? `${current} ${clean}` : clean
                      handleNotesChange(next)
                    }
                  })
                  .catch((err) => {
                    if (!liveErrorShownRef.current) {
                      liveErrorShownRef.current = true
                      const msg =
                        err instanceof Error
                          ? err.message
                          : t(language, "postWriter.toast.transcribeError")
                      toast.error(msg)
                    }
                  })
                  .finally(() => {
                    setLivePendingChunks((c) => Math.max(0, c - 1))
                  })
              },
            }
          : {}),
      })

      setRecordingSeconds(0)
      setIsRecording(true)
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      recorderCtx?.close().catch(() => {})
      stopMediaResources()
      setIsRecording(false)
      const msg =
        err instanceof Error ? err.message : t(language, "postWriter.toast.micDenied")
      toast.error(msg)
    }
  }

  const handleStopRecording = async () => {
    const handle = wavRecorderRef.current
    const wasLive = recordingWasLiveRef.current
    wavRecorderRef.current = null
    stopMediaResources()
    setIsRecording(false)

    if (!handle) return
    try {
      const { blob, mimeType } = await handle.stop()

      if (wasLive) {
        setIsTranscribing(true)
        await liveTranscribeQueueRef.current.catch(() => {})
        return
      }

      if (blob.size <= MIN_VALID_RECORDING_BYTES) {
        toast.error(t(language, "postWriter.toast.audioTooShort"))
        return
      }

      setIsTranscribing(true)
      const processed = await prepareAudioForGemini(blob)
      if (processed.isSilent || !processed.wavBlob) {
        toast.error(t(language, "postWriter.toast.noAudio"))
        return
      }

      const file = new File([processed.wavBlob], "voice-note.wav", {
        type: processed.mimeType || mimeType || "audio/wav",
      })
      const transcript = await transcribeAudioWithGemini(file)
      const cleanTranscript = transcript.trim()
      if (!cleanTranscript) {
        toast.error(t(language, "postWriter.toast.convertFailed"))
        return
      }

      const nextNotes = rawNotesRef.current.trim()
        ? `${rawNotesRef.current.trim()}\n\n${cleanTranscript}`
        : cleanTranscript
      handleNotesChange(nextNotes)
      toast.success(t(language, "postWriter.toast.voiceAdded"))
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t(language, "postWriter.toast.transcribeError")
      toast.error(msg)
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleGenerate = async () => {
    const trimmed = rawNotes.trim()
    if (trimmed.length < 3) {
      toast.error(t(language, "postWriter.toast.needContent"))
      return
    }

    if (!hasConfiguredWriterApiKey()) {
      const msg = t(language, "postWriter.error.missingKey")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
      return
    }

    setWriterError(null)
    setIsGenerating(true)
    try {
      const dual = await generateEditorialDualAngles({
        rawNotes: trimmed,
        format: editorialFormat,
        tone: editorialTone,
        length: editorialLength,
        voiceDnaSamples,
        shopProfile,
      })

      setEditorialResult({
        id: crypto.randomUUID(),
        topic: trimmed,
        format: editorialFormat,
        optionA: dual.optionA,
        optionB: dual.optionB,
        activeOption: "A",
        hooks: [],
        createdAt: new Date().toISOString(),
      })
      setUndoDraftSnapshot(null)

      addGeneratedItem({
        topic: trimmed,
        platform: editorialFormat === "tiktok_script" ? "tiktok" : "facebook",
        contentType: editorialFormat,
        tone: editorialTone,
        content: dual.optionA,
      })
    } catch (err) {
      const msg = formatWriterApiError(err, language, "postWriter.toast.polishError")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
    } finally {
      setIsGenerating(false)
    }
  }

  const activeText = editorialResult
    ? editorialResult.activeOption === "A"
      ? editorialResult.optionA
      : editorialResult.optionB
    : ""

  const updateActiveText = (nextText: string) => {
    if (!editorialResult) return
    if (editorialResult.activeOption === "A") {
      setEditorialResult({ ...editorialResult, optionA: nextText })
    } else {
      setEditorialResult({ ...editorialResult, optionB: nextText })
    }
  }

  const handleSwitchAngle = (option: "A" | "B") => {
    if (!editorialResult || editorialResult.activeOption === option) return
    setEditorialResult({ ...editorialResult, activeOption: option })
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || !editorialResult) return
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current
    const deltaX = endX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(deltaX) < 48) return
    if (deltaX < 0 && editorialResult.activeOption === "A") {
      handleSwitchAngle("B")
    } else if (deltaX > 0 && editorialResult.activeOption === "B") {
      handleSwitchAngle("A")
    }
  }

  const handleGenerateHooks = async () => {
    if (!editorialResult || !activeText.trim()) return
    if (!hasConfiguredWriterApiKey()) {
      const msg = t(language, "postWriter.error.missingKey")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
      return
    }
    setWriterError(null)
    setPolishingAction("hooks")
    try {
      const hooks = await generateEditorialHooks({
        currentDraft: activeText,
        rawNotes,
        format: editorialResult.format,
        tone: editorialTone,
        voiceDnaSamples,
      })
      const latest = useContentStore.getState().editorialResult
      if (!latest) return
      setEditorialResult({ ...latest, hooks })
    } catch (err) {
      const msg = formatWriterApiError(err, language, "postWriter.toast.hooksError")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
    } finally {
      setPolishingAction(null)
    }
  }

  const handlePolish = async (mode: "shorten" | "humanize") => {
    if (!editorialResult || !activeText.trim()) return
    if (!hasConfiguredWriterApiKey()) {
      const msg = t(language, "postWriter.error.missingKey")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
      return
    }
    const targetOption = editorialResult.activeOption
    const previousText = activeText
    setWriterError(null)
    setPolishingAction(mode)
    try {
      const refined = await polishEditorialDraft({
        currentDraft: previousText,
        mode,
        tone: editorialTone,
        voiceDnaSamples,
      })
      const latest = useContentStore.getState().editorialResult
      if (!latest) return
      setUndoDraftSnapshot({ option: targetOption, text: previousText })
      setEditorialResult(
        targetOption === "A"
          ? { ...latest, optionA: refined, hooks: [] }
          : { ...latest, optionB: refined, hooks: [] }
      )
      toast.success(
        mode === "shorten"
          ? t(language, "postWriter.toast.shortened")
          : t(language, "postWriter.toast.humanized")
      )
    } catch (err) {
      const msg = formatWriterApiError(err, language, "postWriter.toast.refineError")
      setWriterError(msg)
      toast.error(msg, { duration: 6000 })
    } finally {
      setPolishingAction(null)
    }
  }

  const handleSendToVoiceStudio = () => {
    if (!activeText.trim()) return
    setVoiceoverDraftScript(cleanVoiceoverText(activeText))
    setActivePageKey("voiceover")
    toast.success(t(language, "postWriter.toast.sentToVoice"))
  }

  const handleCopy = async () => {
    if (!activeText.trim()) return
    try {
      await navigator.clipboard.writeText(activeText)
      setCopied(true)
      toast.success(t(language, "postWriter.toast.copied"))
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t(language, "postWriter.toast.copyFailed"))
    }
  }

  const handleCreatePoster = () => {
    if (!activeText.trim()) return
    const lines = activeText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    setPosterDraft({
      headline: (lines[0] ?? "").slice(0, 60),
      spec1: (lines[1] ?? "").slice(0, 40),
      spec2: (lines[2] ?? "").slice(0, 40),
      spec3: "",
      caption: activeText.trim(),
    })
    setActivePageKey("photo-studio")
  }

  const handleRestoreHistory = (id: string) => {
    const item = generatedHistory.find((entry) => entry.id === id)
    if (!item) return
    setRawNotes(item.topic)
    setEditorialResult({
      id: item.id,
      topic: item.topic,
      format: item.contentType as EditorialFormatOption,
      optionA: item.content,
      optionB: item.content,
      activeOption: "A",
      hooks: [],
      createdAt: item.createdAt,
    })
  }

  const handleSaveToVault = () => {
    if (!editorialResult || !activeText.trim()) return
    saveToVault({
      title: editorialResult.topic.slice(0, 60) || "Post Writer Draft",
      content: activeText,
      platform: editorialResult.format === "tiktok_script" ? "tiktok" : "facebook",
      tags: [editorialResult.format, editorialTone],
      status: "draft",
    })
    toast.success(t(language, "postWriter.toast.savedVault"))
  }

  const handleUndoPolish = () => {
    if (!editorialResult || !undoDraftSnapshot) return
    triggerHaptic(8)
    setEditorialResult(
      undoDraftSnapshot.option === "A"
        ? { ...editorialResult, optionA: undoDraftSnapshot.text }
        : { ...editorialResult, optionB: undoDraftSnapshot.text }
    )
    setUndoDraftSnapshot(null)
    toast.success(
      language === "my" ? "မူလစာသားသို့ ပြန်ယူပြီးပါပြီ" : "Restored original draft"
    )
  }

  const handleInsertHookStarter = (hookText: string) => {
    triggerHaptic(6)
    const current = rawNotesRef.current.trim()
    const next = current ? `${hookText}\n\n${current}` : `${hookText}\n`
    handleNotesChange(next)
    setHookStartersOpen(false)
    toast.success(
      language === "my"
        ? "အဖွင့်စာကြောင်း ထည့်သွင်းပြီးပါပြီ"
        : "Hook starter inserted"
    )
  }

  const openingLineText = (() => {
    const trimmed = activeText.trim()
    if (!trimmed) return ""
    return trimmed.split("\n").slice(0, 3).join("\n")
  })()
  const openingGraphemes = countGraphemes(openingLineText, language)
  const FB_SEE_MORE_LIMIT = 125

  const handleVoiceSampleChange = (index: number, value: string) => {
    const next = [...voiceDnaSamples]
    while (next.length <= index) next.push("")
    next[index] = value
    setVoiceDnaSamples(next)
  }

  const visibleSampleCount = Math.min(
    3,
    Math.max(1, voiceDnaSamples.filter((s) => s.trim().length > 0).length + 1)
  )

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-24 pt-2 sm:px-6 sm:pt-4">
      {/* Calm Editorial Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[19px] font-semibold tracking-tight text-foreground sm:text-xl">
            {t(language, "postWriter.brainDumpTitle")}
          </h1>
          <span className="rounded-full border border-border/70 bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t(language, "postWriter.draftNotes")}
          </span>
        </div>
      </div>

      {/* Horizontal Quick Format Chips */}
      <div className="no-scrollbar -mx-3 mb-3.5 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {FORMAT_CHIPS.map((chip) => {
          const active = editorialFormat === chip.id
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setEditorialFormat(chip.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all active:scale-[0.98]",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-xs dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-border/80 bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground"
              )}
            >
              {t(language, chip.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Single-Focus Writing Canvas (Apple Notes / Notion Inspired) */}
      <div className="relative rounded-2xl border border-border/80 bg-[#FAF9F6] shadow-xs transition-colors focus-within:border-foreground/30 dark:bg-[#1C1C1E]">
        {rawNotes.length > 0 && (
          <button
            type="button"
            onClick={handleClearCanvas}
            aria-label={t(language, "postWriter.clearBtn")}
            className="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
            <span>{t(language, "postWriter.clearBtn")}</span>
          </button>
        )}
        <Textarea
          value={rawNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder={t(language, "postWriter.canvasPlaceholder")}
          rows={7}
          className={cn(
            "min-h-[190px] w-full resize-y border-0 bg-transparent px-4 pt-4 pb-2 text-[15px] leading-[1.75] text-foreground placeholder:text-muted-foreground/65 focus-visible:ring-0 focus-visible:ring-offset-0 sm:min-h-[210px] sm:px-5 sm:pt-5",
            rawNotes.length > 0 && "pr-28 sm:pr-32"
          )}
        />

        {/* Integrated Input Footer Bar with Mic Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3.5 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
            {isRecording ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-4 w-16 shrink-0 items-center gap-0.5" aria-hidden="true">
                  {waveformBars.map((height, idx) => (
                    <span
                      key={idx}
                      className="flex-1 rounded-full bg-red-500/80 transition-all duration-75"
                      style={{ height: `${Math.max(18, height)}%` }}
                    />
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400 truncate">
                  {liveModeEnabled ? (
                    <>
                      {livePendingChunks > 0 && (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      )}
                      <span className="truncate">
                        {livePendingChunks > 0
                          ? t(language, "booth.liveTranscribing")
                          : t(language, "booth.liveListening")}
                      </span>
                    </>
                  ) : (
                    <>
                      {t(language, "postWriter.recordingHint")} {formatTimer(recordingSeconds)}
                    </>
                  )}
                </span>
              </div>
            ) : isTranscribing ? (
              <span className="inline-flex items-center gap-1.5 text-foreground truncate">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="truncate">{t(language, "postWriter.transcribing")}</span>
              </span>
            ) : (
              <span className="truncate">
                {rawNotes.trim().length > 0
                  ? `${rawNotes.trim().length} ${t(language, "generator.characters")}`
                  : t(language, "postWriter.micStart")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6)
                setHookStartersOpen(true)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-95 cursor-pointer font-myanmar"
            >
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">
                {language === "my" ? "💡 အဖွင့်စာကြောင်း နမူနာများ" : "💡 Hook Starters"}
              </span>
              <span className="sm:hidden">
                {language === "my" ? "💡 နမူနာ" : "💡 Hooks"}
              </span>
            </button>

            <button
              type="button"
              disabled={isTranscribing}
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              aria-label={isRecording ? t(language, "postWriter.micStop") : t(language, "postWriter.micStart")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 disabled:opacity-50",
                isRecording
                  ? "bg-red-500/12 text-red-600 ring-1 ring-red-500/30 dark:bg-red-500/20 dark:text-red-400"
                  : "bg-secondary/80 text-foreground hover:bg-secondary"
              )}
            >
              {isRecording ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>{t(language, "postWriter.micStop")}</span>
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  <span>{t(language, "postWriter.micStart")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline API Key / Network / Regional Block Guidance */}
      {writerError && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 font-myanmar"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="leading-relaxed break-words">{writerError}</p>
          </div>
          <button
            type="button"
            onClick={() => setWriterError(null)}
            className="shrink-0 rounded p-0.5 text-red-600/80 hover:text-red-700 dark:text-red-400/80 dark:hover:text-red-300 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Primary Action Row + Settings Trigger */}
      <div className="mt-3.5 flex items-center gap-2">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || isRecording || isTranscribing}
          className="h-11 min-w-0 flex-1 rounded-xl bg-neutral-900 px-3 text-[14px] sm:text-[15px] font-medium text-white shadow-xs transition-all hover:bg-neutral-800 active:scale-[0.99] dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 whitespace-nowrap"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />
              <span className="truncate">{t(language, "postWriter.writing")}</span>
            </>
          ) : (
            <span className="truncate">{t(language, "postWriter.writeBtn")}</span>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => setHistoryOpen(true)}
          className="h-11 shrink-0 rounded-xl border-border/80 bg-card px-2.5 sm:px-3.5 text-[13px] sm:text-[14px] font-medium text-foreground shadow-xs hover:bg-muted/70 whitespace-nowrap"
        >
          <span>{t(language, "postWriter.historyBtn")}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="h-11 shrink-0 rounded-xl border-border/80 bg-card px-2.5 sm:px-3.5 text-[13px] sm:text-[14px] font-medium text-foreground shadow-xs hover:bg-muted/70 whitespace-nowrap"
        >
          <span>{t(language, "postWriter.settingsBtn")}</span>
        </Button>
      </div>

      {/* Dual-Angle Output Card & 1-Tap Magic Polish */}
      {editorialResult && (
        <div
          className="mt-6 space-y-3.5"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Option A / B Toggle */}
          <div className="flex items-center justify-between gap-2">
            <div className="grid w-full grid-cols-2 rounded-xl bg-muted/80 p-1">
              <button
                type="button"
                onClick={() => handleSwitchAngle("A")}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-xs font-medium transition-all sm:text-[13px]",
                  editorialResult.activeOption === "A"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(language, "postWriter.optionA")}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchAngle("B")}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-xs font-medium transition-all sm:text-[13px]",
                  editorialResult.activeOption === "B"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(language, "postWriter.optionB")}
              </button>
            </div>
          </div>

          {/* Result Card */}
          <div className="rounded-2xl border border-border/80 bg-card shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {editorialResult.activeOption === "A"
                  ? t(language, "postWriter.styleDirect")
                  : t(language, "postWriter.styleStory")}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground/75 sm:inline">
                  {t(language, "postWriter.swipeHint")}
                </span>
                <button
                  type="button"
                  onClick={clearEditorialResult}
                  aria-label={t(language, "postWriter.deleteBtn")}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t(language, "postWriter.deleteBtn")}</span>
                </button>
              </div>
            </div>

            {activeText.trim() && (
              <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-[#FAF8F5]/75 dark:bg-[#18181B]/45 px-4 py-1.5 sm:px-5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium truncate font-myanmar",
                    openingGraphemes <= FB_SEE_MORE_LIMIT
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      openingGraphemes <= FB_SEE_MORE_LIMIT ? "bg-emerald-500" : "bg-amber-500"
                    )}
                  />
                  <span className="truncate">
                    {language === "my"
                      ? `FB "See More..." အဖွင့်: ${openingGraphemes}/${FB_SEE_MORE_LIMIT}`
                      : `FB "See More..." Hook: ${openingGraphemes}/${FB_SEE_MORE_LIMIT}`}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {openingGraphemes <= FB_SEE_MORE_LIMIT
                    ? language === "my"
                      ? "✓ ကွက်တိ"
                      : "Fits"
                    : language === "my"
                      ? "✂️ ရှည်နေသည်"
                      : "Over"}
                </span>
              </div>
            )}

            <Textarea
              value={activeText}
              onChange={(e) => updateActiveText(e.target.value)}
              rows={9}
              className="min-h-[210px] w-full resize-y border-0 bg-transparent px-4 py-3.5 text-[15px] leading-[1.8] text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-5"
            />

            {/* Optional Generated Hooks Selector */}
            {editorialResult.hooks && editorialResult.hooks.length > 0 && (
              <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t(language, "postWriter.hookPickHint")}
                </p>
                <div className="space-y-1.5">
                  {editorialResult.hooks.map((hook, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        updateActiveText(replaceOpeningLine(activeText, hook))
                        toast.success(t(language, "postWriter.toast.hookReplaced"))
                      }}
                      className="block w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-left text-[13px] leading-relaxed text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50"
                    >
                      {hook}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Prominent Copy & Save to Vault Footer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 py-3">
              <button
                type="button"
                onClick={handleSaveToVault}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-4 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] transition-all hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] active:scale-95 cursor-pointer font-myanmar"
              >
                <span>{t(language, "postWriter.saveVaultBtn")}</span>
              </button>
              <button
                type="button"
                onClick={handleCreatePoster}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-4 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] transition-all hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] active:scale-95 cursor-pointer font-myanmar"
              >
                <span>{t(language, "postWriter.createPosterBtn")}</span>
              </button>
              <Button
                type="button"
                onClick={handleCopy}
                className="h-10 min-w-[120px] flex-1 rounded-xl bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {t(language, "generator.copySuccess")}
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {t(language, "generator.copy")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 4 Magic Polish Action Chips (appear only after text is generated) */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={polishingAction !== null}
              onClick={handleGenerateHooks}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {polishingAction === "hooks" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span>🪝</span>
              )}
              <span>{t(language, "postWriter.polishHooks")}</span>
            </button>

            <button
              type="button"
              disabled={polishingAction !== null}
              onClick={() => handlePolish("shorten")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {polishingAction === "shorten" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span>✂️</span>
              )}
              <span>{t(language, "postWriter.polishShorten")}</span>
            </button>

            <button
              type="button"
              disabled={polishingAction !== null}
              onClick={() => handlePolish("humanize")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {polishingAction === "humanize" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span>🌿</span>
              )}
              <span>{t(language, "postWriter.polishHumanize")}</span>
            </button>

            <button
              type="button"
              disabled={polishingAction !== null}
              onClick={handleSendToVoiceStudio}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <span>🎙️</span>
              <span>{t(language, "postWriter.sendToBooth")}</span>
            </button>

            {undoDraftSnapshot &&
              undoDraftSnapshot.option === editorialResult.activeOption && (
                <button
                  type="button"
                  onClick={handleUndoPolish}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/20 active:scale-95 cursor-pointer font-myanmar"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>
                    {language === "my"
                      ? "↩️ မူလစာသားပြန်ယူမည်"
                      : "↩️ Undo Polish"}
                  </span>
                </button>
              )}
          </div>
        </div>
      )}

      {/* 1-Tap Hook Starters Bottom Sheet */}
      <Sheet open={hookStartersOpen} onOpenChange={setHookStartersOpen} side="bottom">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="border-b border-border/50 px-5 py-3.5">
          <div>
            <SheetTitle className="flex items-center gap-2 text-base font-semibold font-myanmar">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span>
                {language === "my"
                  ? "💡 အဖွင့်စာကြောင်း နမူနာများ"
                  : "💡 1-Tap Hook Starters"}
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs font-myanmar">
              {language === "my"
                ? "နှိပ်လိုက်ရုံဖြင့် စာရေးစက်ထဲသို့ တိုက်ရိုက်ထည့်သွင်းပေးပါမည်"
                : "Tap any proven hook to insert it at the top of your draft notes"}
            </SheetDescription>
          </div>
          <SheetClose onClick={() => setHookStartersOpen(false)} />
        </SheetHeader>
        <SheetContent className="max-h-[70vh] space-y-4 overflow-y-auto border-b-0 px-5 py-4 pb-8">
          {HOOK_STARTER_GROUPS.map((group) => (
            <div key={group.category} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-myanmar">
                {language === "my" ? group.categoryMy : group.category}
              </p>
              <div className="space-y-1.5">
                {group.hooks.map((hook, idx) => {
                  const label = language === "my" ? hook.labelMy : hook.labelEn
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInsertHookStarter(label)}
                      className="block w-full rounded-xl border border-border/70 bg-background/80 px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-foreground transition-all hover:border-foreground/30 hover:bg-muted/60 active:scale-[0.99] cursor-pointer font-myanmar"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </SheetContent>
      </Sheet>

      <RecentHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={t(language, "postWriter.historyTitle")}
        description={t(language, "postWriter.historyDesc")}
        emptyText={t(language, "postWriter.historyEmpty")}
        items={generatedHistory.map((item) => ({
          id: item.id,
          title: item.topic || t(language, "postWriter.untitledDraft"),
          preview: item.content,
          meta: new Date(item.createdAt).toLocaleString(),
        }))}
        onSelect={handleRestoreHistory}
      />

      {/* Slide-Up Settings Bottom Sheet (⚙️ ညှိရန်) */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} side="bottom">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="border-b border-border/50 px-5 py-3.5">
          <div>
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span>{t(language, "postWriter.sheetTitle")}</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              {t(language, "postWriter.sheetDesc")}
            </SheetDescription>
          </div>
          <SheetClose onClick={() => setSettingsOpen(false)} />
        </SheetHeader>

        <SheetContent className="max-h-[75vh] space-y-6 overflow-y-auto border-b-0 px-5 py-4 pb-8">
          {/* 1. Tone & Length */}
          <section className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(language, "postWriter.toneLabel")}
              </Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => setEditorialTone(tone.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      editorialTone === tone.id
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(language, tone.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(language, "postWriter.lengthLabel")}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_OPTIONS.map((len) => (
                  <button
                    key={len.id}
                    type="button"
                    onClick={() => setEditorialLength(len.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                      editorialLength === len.id
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(language, len.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 2. Personal Voice DNA */}
          <section className="space-y-2.5 border-t border-border/50 pt-5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground">
                {t(language, "postWriter.voiceDnaLabel")}
              </Label>
              <span className="text-[11px] text-muted-foreground">{t(language, "settings.dnaCount")}</span>
            </div>

            <div className="space-y-2.5">
              {Array.from({ length: visibleSampleCount }).map((_, idx) => {
                const val = voiceDnaSamples[idx] ?? ""
                return (
                  <div key={idx} className="relative">
                    <Textarea
                      value={val}
                      onChange={(e) => handleVoiceSampleChange(idx, e.target.value)}
                      rows={3}
                      placeholder={t(language, "postWriter.voiceDnaPlaceholder", { num: String(idx + 1) })}
                      className="min-h-[82px] resize-y rounded-xl bg-background pr-9 text-xs leading-relaxed"
                    />
                    {val.trim().length > 0 && (
                      <button
                        type="button"
                        aria-label="Clear sample"
                        onClick={() => handleVoiceSampleChange(idx, "")}
                        className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}

              {visibleSampleCount < 3 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = [...voiceDnaSamples]
                    while (next.length < visibleSampleCount + 1) next.push("")
                    setVoiceDnaSamples(next)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t(language, "postWriter.addSample")}</span>
                </button>
              )}
            </div>
          </section>

          {/* 3. Saved Brand / Shop Profile */}
          <section className="space-y-3 border-t border-border/50 pt-5">
            <Label className="text-sm font-semibold text-foreground">
              {t(language, "postWriter.shopLabel")}
            </Label>

            <div className="space-y-2.5">
              <Input
                value={shopProfile.name}
                onChange={(e) => setShopProfile({ name: e.target.value })}
                placeholder={t(language, "postWriter.shopName")}
                className="h-10 rounded-xl bg-background text-sm"
              />
              <Input
                value={shopProfile.phone}
                onChange={(e) => setShopProfile({ phone: e.target.value })}
                placeholder={t(language, "postWriter.shopPhone")}
                className="h-10 rounded-xl bg-background text-sm"
              />
              <Textarea
                value={shopProfile.address}
                onChange={(e) => setShopProfile({ address: e.target.value })}
                rows={2}
                placeholder={t(language, "postWriter.shopAddress")}
                className="min-h-[64px] rounded-xl bg-background text-sm"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-3">
              <span className="text-xs font-medium text-foreground sm:text-sm">
                {t(language, "postWriter.autoAppend")}
              </span>
              <input
                type="checkbox"
                checked={shopProfile.autoAppend}
                onChange={(e) => setShopProfile({ autoAppend: e.target.checked })}
                className="h-4 w-4 accent-neutral-900 dark:accent-neutral-100"
              />
            </label>
          </section>

          <Button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="h-10 w-full rounded-xl bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {t(language, "postWriter.doneBtn")}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
