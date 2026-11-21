"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic, Pause, Play, Radio, Settings2, Square, Upload } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { transcribeAudioWithGemini } from "@/api/aiService"
import {
  cleanVoiceoverText,
  estimateSpokenDurationSeconds,
  formatAudioClockDuration,
  mixVoiceoverWithAutoDuckingMusic,
  toBurmeseDigits,
} from "@/api/ttsService"
import { IosAudioPlayer } from "@/components/shared/IosAudioPlayer"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { Textarea } from "@/components/ui/textarea"
import { prepareAudioForGemini } from "@/lib/audioProcessor"
import {
  MIN_VALID_RECORDING_BYTES,
  createWavAudioRecorder,
  getAudioContextConstructor,
  setIosAudioSessionPlayback,
  shareAudioFile,
  unlockIosAudio,
  type WavAudioRecorderHandle,
} from "@/lib/iosAudio"
import { cn, triggerHaptic } from "@/lib/utils"
import { t } from "@/locales/translations"
import { getAudioBlobDurationSeconds } from "@/lib/videoAudioMerger"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { StudioSettingsSheet } from "./StudioSettingsSheet"

const WAVEFORM_BAR_COUNT = 28
const LIVE_WAVEFORM_BAR_COUNT = 20

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

function triggerBlobDownload(url: string, filename: string) {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function VoiceoverPage() {
  const language = useUIStore((state) => state.language)

  const {
    voiceScriptText,
    setVoiceScriptText,
    selectedVoice,
    setSelectedVoice,
    voiceSpeed,
    setVoiceSpeed,
    voiceDialogueMode,
    setVoiceDialogueMode,
    voiceMusicPreset,
    setVoiceMusicPreset,
    voiceCustomMusicFile,
    setVoiceCustomMusicFile,
    ttsStatus,
    ttsProgress,
    pdfExtractionStatus,
    generatedAudioUrl,
    generatedAudioBlob,
    generatedAudioExtension,
    generatedAudioDuration,
    generatedAudioTitle,
    generatedAudioSource,
    selfRecordedBlob,
    selfRecordedMimeType,
    selfRecordedNeedsTranscribe,
    setSelfRecordedNeedsTranscribe,
    setStudioSelfAudio,
    generateStudioVoiceover,
    micFilterMode,
    setMicFilterMode,
    liveModeEnabled,
    setLiveModeEnabled,
  } = useContentStore(
    useShallow((state) => ({
      voiceScriptText: state.voiceScriptText,
      setVoiceScriptText: state.setVoiceScriptText,
      selectedVoice: state.selectedVoice,
      setSelectedVoice: state.setSelectedVoice,
      voiceSpeed: state.voiceSpeed,
      setVoiceSpeed: state.setVoiceSpeed,
      voiceDialogueMode: state.voiceDialogueMode,
      setVoiceDialogueMode: state.setVoiceDialogueMode,
      voiceMusicPreset: state.voiceMusicPreset,
      setVoiceMusicPreset: state.setVoiceMusicPreset,
      voiceCustomMusicFile: state.voiceCustomMusicFile,
      setVoiceCustomMusicFile: state.setVoiceCustomMusicFile,
      ttsStatus: state.ttsStatus,
      ttsProgress: state.ttsProgress,
      pdfExtractionStatus: state.pdfExtractionStatus,
      generatedAudioUrl: state.generatedAudioUrl,
      generatedAudioBlob: state.generatedAudioBlob,
      generatedAudioExtension: state.generatedAudioExtension,
      generatedAudioDuration: state.generatedAudioDuration,
      generatedAudioTitle: state.generatedAudioTitle,
      generatedAudioSource: state.generatedAudioSource,
      selfRecordedBlob: state.selfRecordedBlob,
      selfRecordedMimeType: state.selfRecordedMimeType,
      selfRecordedNeedsTranscribe: state.selfRecordedNeedsTranscribe,
      setSelfRecordedNeedsTranscribe: state.setSelfRecordedNeedsTranscribe,
      setStudioSelfAudio: state.setStudioSelfAudio,
      generateStudioVoiceover: state.generateStudioVoiceover,
      micFilterMode: state.micFilterMode,
      setMicFilterMode: state.setMicFilterMode,
      liveModeEnabled: state.liveModeEnabled,
      setLiveModeEnabled: state.setLiveModeEnabled,
    }))
  )

  // Live Mode Chunked Gemini Speech-to-Text state (iOS PWA compatible)
  const liveSpeechSupported = Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      getAudioContextConstructor()
  )
  const [isLiveListening, setIsLiveListening] = useState(false)
  const [livePendingChunks, setLivePendingChunks] = useState(0)
  const [liveWaveformBars, setLiveWaveformBars] = useState<number[]>(() =>
    Array(LIVE_WAVEFORM_BAR_COUNT).fill(14)
  )
  const [liveSpeechLang, setLiveSpeechLang] = useState<"my-MM" | "en-US">(
    language === "my" ? "my-MM" : "en-US"
  )
  const liveRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const liveTranscribeQueueRef = useRef<Promise<void>>(Promise.resolve())
  const liveSessionIdRef = useRef(0)
  const liveErrorShownRef = useRef(false)
  const voiceScriptRef = useRef(voiceScriptText)
  useEffect(() => {
    voiceScriptRef.current = voiceScriptText
  }, [voiceScriptText])

  const cleanupLiveMedia = useCallback(() => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => track.stop())
      liveStreamRef.current = null
    }
    setLiveWaveformBars(Array(LIVE_WAVEFORM_BAR_COUNT).fill(14))
  }, [])

  const stopLiveSpeech = useCallback(async () => {
    const recorder = liveRecorderRef.current
    liveRecorderRef.current = null
    setIsLiveListening(false)
    cleanupLiveMedia()

    if (recorder) {
      try {
        await recorder.stop()
      } catch {
        // Ignore stop errors
      }
    }
    await liveTranscribeQueueRef.current.catch(() => {})
  }, [cleanupLiveMedia])

  useEffect(() => {
    if (!liveModeEnabled && isLiveListening) {
      void stopLiveSpeech()
    }
  }, [liveModeEnabled, isLiveListening, stopLiveSpeech])

  useEffect(() => {
    return () => {
      liveSessionIdRef.current += 1
      liveRecorderRef.current?.cancel()
      liveRecorderRef.current = null
      cleanupLiveMedia()
    }
  }, [cleanupLiveMedia])

  const toggleLiveSpeech = useCallback(async () => {
    if (isLiveListening) {
      triggerHaptic(8)
      await stopLiveSpeech()
      return
    }

    if (!liveSpeechSupported) {
      toast.error(t(language, "booth.liveUnsupported"))
      return
    }

    const geminiKey = useUIStore.getState().apiKeys.gemini?.trim()
    if (!geminiKey) {
      toast.error(
        language === "my"
          ? "Live စာသားပြောင်းရန် Settings ထဲတွင် Gemini API Key ထည့်သွင်းပေးပါ။"
          : "Please add your Gemini API key in Settings to use Live Transcription."
      )
      return
    }

    triggerHaptic(8)
    unlockIosAudio()

    let liveCtx: AudioContext | null = null
    const AudioCtx = getAudioContextConstructor()
    if (AudioCtx) {
      try {
        liveCtx = new AudioCtx()
        if (liveCtx.state === "suspended") {
          liveCtx.resume().catch(() => {})
        }
      } catch {
        liveCtx = null
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

      liveStreamRef.current = stream
      liveSessionIdRef.current += 1
      const sessionId = liveSessionIdRef.current
      liveErrorShownRef.current = false
      liveTranscribeQueueRef.current = Promise.resolve()

      const langHint = liveSpeechLang === "my-MM" ? "my" : "auto"

      liveRecorderRef.current = createWavAudioRecorder(stream, {
        audioContext: liveCtx,
        micFilterMode,
        barCount: LIVE_WAVEFORM_BAR_COUNT,
        onBars: setLiveWaveformBars,
        chunkIntervalMs: 3500,
        onChunk: (chunk) => {
          setLivePendingChunks((c) => c + 1)
          liveTranscribeQueueRef.current = liveTranscribeQueueRef.current
            .then(async () => {
              if (liveSessionIdRef.current !== sessionId) return
              const transcript = await transcribeAudioWithGemini(
                chunk.blob,
                chunk.mimeType,
                langHint,
                "live-chunk.wav",
                false
              )
              if (liveSessionIdRef.current !== sessionId) return
              const clean = transcript.trim()
              if (clean) {
                const current = voiceScriptRef.current.trim()
                const next = current ? `${current} ${clean}` : clean
                voiceScriptRef.current = next
                setVoiceScriptText(next)
              }
            })
            .catch((err) => {
              if (!liveErrorShownRef.current) {
                liveErrorShownRef.current = true
                const msg =
                  err instanceof Error ? err.message : t(language, "booth.transcribeError")
                toast.error(msg)
              }
            })
            .finally(() => {
              setLivePendingChunks((c) => Math.max(0, c - 1))
            })
        },
      })

      setIsLiveListening(true)
    } catch (err) {
      liveCtx?.close().catch(() => {})
      cleanupLiveMedia()
      setIsLiveListening(false)
      const msg =
        err instanceof Error && err.message
          ? err.message
          : language === "my"
            ? "မိုက်ခရိုဖုန်း ခွင့်ပြုချက် မရရှိပါ။"
            : "Microphone permission was denied."
      toast.error(msg)
    }
  }, [
    cleanupLiveMedia,
    isLiveListening,
    language,
    liveSpeechLang,
    liveSpeechSupported,
    micFilterMode,
    setVoiceScriptText,
    stopLiveSpeech,
  ])

  // Studio settings sheet visibility
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    Array(WAVEFORM_BAR_COUNT).fill(14)
  )

  // Teleprompter state (auto-activates when recording in Self Voice with script)
  const [teleprompterScrolling, setTeleprompterScrolling] = useState(true)
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(1.0)
  const teleprompterRef = useRef<HTMLDivElement | null>(null)

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false)

  const isExtractingPdf =
    pdfExtractionStatus === "extracting" || pdfExtractionStatus === "rewriting"
  const isGeneratingVoice =
    isExtractingPdf || ttsStatus === "preparing" || ttsStatus === "generating"

  const wavRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const recordTimerRef = useRef<number | null>(null)
  const recordingSecondsRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen")
    } catch {
      // Ignore if unsupported or blocked by battery saver
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return
    try {
      await wakeLockRef.current.release()
    } catch {
      // Ignore release errors
    } finally {
      wakeLockRef.current = null
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
    void releaseWakeLock()
    setWaveformBars(Array(WAVEFORM_BAR_COUNT).fill(14))
  }, [releaseWakeLock])

  // Only stop active mic stream on unmount; never revoke generatedAudioUrl here
  useEffect(() => {
    return () => {
      stopRecorderResources()
    }
  }, [stopRecorderResources])

  const showTeleprompter =
    selectedVoice === "self" && isRecordingVoice && voiceScriptText.trim().length > 0

  // Smooth auto-scrolling Teleprompter loop
  useEffect(() => {
    if (!showTeleprompter || !teleprompterScrolling) return
    let rafId = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const el = teleprompterRef.current
      if (el) {
        el.scrollTop += dt * 28 * teleprompterSpeed
      }
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [showTeleprompter, teleprompterScrolling, teleprompterSpeed])

  const hasActiveSettings =
    voiceSpeed !== 1.0 || voiceDialogueMode || voiceMusicPreset !== "none"

  const finalizeMyVoiceBlob = async (
    rawBlob: Blob,
    mimeType: string,
    title: string,
    fileName?: string,
    fallbackDuration = 0
  ) => {
    const baseDuration = (await getAudioBlobDurationSeconds(rawBlob)) || fallbackDuration || 1
    let finalBlob = rawBlob
    let finalExt = inferAudioExtension(mimeType, fileName)
    let finalMime = mimeType
    let finalDuration = baseDuration

    if (voiceMusicPreset !== "none") {
      try {
        const mixed = await mixVoiceoverWithAutoDuckingMusic({
          voiceoverBlob: rawBlob,
          musicPreset: voiceMusicPreset,
          customMusicFile: voiceCustomMusicFile,
          musicVolume: 0.34,
        })
        finalBlob = mixed.blob
        finalExt = "wav"
        finalMime = "audio/wav"
        finalDuration = mixed.durationSeconds
      } catch {
        // Fallback to raw recording if mixing fails
      }
    }

    const url = URL.createObjectURL(finalBlob)
    setStudioSelfAudio({
      audioUrl: url,
      blob: finalBlob,
      rawBlob,
      mimeType: finalMime,
      fileExtension: finalExt,
      durationSeconds: finalDuration,
      title,
    })
  }

  const startRecording = async () => {
    setIosAudioSessionPlayback()
    unlockIosAudio()
    triggerHaptic(12)

    if (!navigator.mediaDevices?.getUserMedia || !getAudioContextConstructor()) {
      toast.error("ဤ Browser တွင် အသံဖမ်းစနစ်ကို မပံ့ပိုးပါ။")
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

      wavRecorderRef.current = createWavAudioRecorder(stream, {
        audioContext: recorderCtx,
        micFilterMode,
        barCount: WAVEFORM_BAR_COUNT,
        onBars: setWaveformBars,
      })

      recordingSecondsRef.current = 0
      setRecordingSeconds(0)
      setTeleprompterScrolling(true)
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop = 0
      }
      setIsRecordingVoice(true)
      void acquireWakeLock()

      recordTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1
        setRecordingSeconds(recordingSecondsRef.current)
      }, 1000)
    } catch (err) {
      recorderCtx?.close().catch(() => {})
      stopRecorderResources()
      setIsRecordingVoice(false)
      const msg = err instanceof Error ? err.message : "မိုက်ခရိုဖုန်း ခွင့်ပြုချက် မရရှိပါ။"
      toast.error(msg)
    }
  }

  const stopRecording = async () => {
    triggerHaptic(10)
    const handle = wavRecorderRef.current
    wavRecorderRef.current = null
    const elapsed = recordingSecondsRef.current
    stopRecorderResources()
    setIsRecordingVoice(false)

    if (!handle) return
    try {
      const { blob, mimeType } = await handle.stop()
      if (blob.size <= MIN_VALID_RECORDING_BYTES) {
        toast.error("အသံဖမ်းယူမှု မအောင်မြင်ပါ သို့မဟုတ် အသံတိုလွန်းပါသည်။")
        return
      }
      const title = `ကိုယ်တိုင်အသံသွင်းချက် (${formatRecordTimer(elapsed)})`
      await finalizeMyVoiceBlob(blob, mimeType, title, "recording.wav", elapsed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "အသံဖိုင် သိမ်းဆည်း၍ မရပါ။"
      toast.error(msg)
    }
  }

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const mimeType = file.type || "audio/mpeg"
    await finalizeMyVoiceBlob(file, mimeType, file.name, file.name)
    toast.success("အသံဖိုင် ထည့်သွင်းပြီးပါပြီ။")
  }

  const transcribeMyVoiceBlob = async (
    sourceBlob: Blob,
    mimeType: string
  ): Promise<string | null> => {
    setIsTranscribing(true)
    try {
      let uploadBlob: Blob = sourceBlob
      let uploadMime = mimeType
      const uploadName = "recording.wav"

      try {
        const processed = await prepareAudioForGemini(sourceBlob)
        if (processed.isSilent) {
          toast.error("အသံမကြားရပါ — မိုက်ခရိုဖုန်း စစ်ဆေးပါ။")
          return null
        }
        if (processed.wavBlob) {
          uploadBlob = processed.wavBlob
          uploadMime = processed.mimeType
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
      const trimmed = cleanedText.trim()
      if (!trimmed) {
        toast.info("စကားသံ မတွေ့ရှိပါ။")
        return null
      }
      return trimmed
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleTranscribeRecording = async () => {
    const sourceBlob = selfRecordedBlob ?? generatedAudioBlob
    if (!sourceBlob || generatedAudioSource !== "my_voice") return
    try {
      const trimmed = await transcribeMyVoiceBlob(sourceBlob, selfRecordedMimeType)
      if (!trimmed) return
      setSelfRecordedNeedsTranscribe(false)
      const existing = voiceScriptText.trim()
      setVoiceScriptText(existing ? `${existing}\n\n${trimmed}` : trimmed)
      toast.success("စာသားအဖြစ် သန့်ရှင်းစွာ ပြောင်းလဲပြီးပါပြီ။")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "စာသားပြောင်းလဲ၍ မရပါ။"
      toast.error(msg)
    }
  }

  const handleReadWithNarrator = async () => {
    setIosAudioSessionPlayback()
    unlockIosAudio()
    triggerHaptic(10)

    let scriptOverride: string | undefined
    const sourceBlob = selfRecordedBlob ?? generatedAudioBlob
    const needsAutoTranscribe =
      generatedAudioSource === "my_voice" &&
      Boolean(sourceBlob) &&
      (selfRecordedNeedsTranscribe || !cleanVoiceoverText(voiceScriptText))

    if (needsAutoTranscribe && sourceBlob) {
      try {
        const transcribed = await transcribeMyVoiceBlob(sourceBlob, selfRecordedMimeType)
        if (!transcribed) return
        setSelfRecordedNeedsTranscribe(false)
        setVoiceScriptText(transcribed)
        scriptOverride = transcribed
      } catch (err) {
        const msg = err instanceof Error ? err.message : "စာသားပြောင်းလဲ၍ မရပါ။"
        toast.error(msg)
        return
      }
    }

    await generateStudioVoiceover(scriptOverride)
  }

  const handleDownloadActiveAudio = () => {
    if (!generatedAudioUrl) return
    const timestamp = new Date().toISOString().slice(0, 10)
    const prefix = generatedAudioSource === "my_voice" ? "my-voice" : selectedVoice
    triggerBlobDownload(generatedAudioUrl, `${prefix}-${timestamp}.${generatedAudioExtension}`)
  }

  const handleShareActiveAudio = () => {
    if (!generatedAudioUrl) return
    const timestamp = new Date().toISOString().slice(0, 10)
    const prefix = generatedAudioSource === "my_voice" ? "my-voice" : selectedVoice
    void shareAudioFile({
      blob: generatedAudioBlob,
      url: generatedAudioUrl,
      title: generatedAudioTitle || `${prefix}-${timestamp}`,
      fileExtension: generatedAudioExtension,
    })
  }

  const narratorButtonLabel = voiceDialogueMode
    ? t(language, "booth.generateDialogueBtn")
    : t(language, "booth.generateBtn")

  return (
    <div className="mx-auto w-full max-w-2xl pb-8 space-y-5">
      {/* Minimal Editorial Header */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
            {t(language, "nav.voiceover")}
          </h1>
          <p className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            {t(language, "booth.scriptPlaceholder")}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8)
              setLiveModeEnabled(!liveModeEnabled)
            }}
            aria-pressed={liveModeEnabled}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all active:scale-95 cursor-pointer font-myanmar",
              liveModeEnabled
                ? "border-[#E11D48] bg-[#E11D48]/10 text-[#E11D48]"
                : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46]"
            )}
          >
            <Radio className={cn("h-3.5 w-3.5", liveModeEnabled && "animate-pulse")} />
            <span>{t(language, "booth.liveMode")}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all active:scale-95 cursor-pointer font-myanmar",
              "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46]"
            )}
          >
            <Settings2 className="h-3.5 w-3.5 text-[#57534E] dark:text-[#A1A1AA]" />
            <span>{t(language, "booth.settingsBtn")}</span>
            {hasActiveSettings && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
            )}
          </button>
        </div>
      </div>

      {/* Live Mode Panel */}
      {liveModeEnabled && (
        <div className="rounded-[20px] border border-[#E11D48]/30 bg-[#E11D48]/[0.04] dark:bg-[#E11D48]/[0.08] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E11D48] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
              <span className="text-sm font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                {t(language, "booth.liveTitle")}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] p-0.5 text-[11px]">
                <button
                  type="button"
                  disabled={isLiveListening}
                  onClick={() => setLiveSpeechLang("my-MM")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium cursor-pointer transition-colors",
                    liveSpeechLang === "my-MM"
                      ? "bg-[#1C1917] text-white dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "text-muted-foreground"
                  )}
                >
                  {t(language, "booth.liveLangMy")}
                </button>
                <button
                  type="button"
                  disabled={isLiveListening}
                  onClick={() => setLiveSpeechLang("en-US")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium cursor-pointer transition-colors",
                    liveSpeechLang === "en-US"
                      ? "bg-[#1C1917] text-white dark:bg-[#F5F5F4] dark:text-[#18181B]"
                      : "text-muted-foreground"
                  )}
                >
                  {t(language, "booth.liveLangEn")}
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            {liveSpeechSupported ? t(language, "booth.liveDesc") : t(language, "booth.liveUnsupported")}
          </p>

          {liveSpeechSupported && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void toggleLiveSpeech()}
                  className={cn(
                    "h-9 rounded-xl gap-1.5 text-xs font-semibold font-myanmar",
                    isLiveListening
                      ? "bg-[#E11D48] hover:bg-[#BE123C] text-white"
                      : "bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-white dark:text-[#18181B]"
                  )}
                >
                  {isLiveListening ? (
                    <>
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>{t(language, "booth.liveStop")}</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      <span>{t(language, "booth.liveStart")}</span>
                    </>
                  )}
                </Button>

                {(isLiveListening || livePendingChunks > 0) && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E11D48] font-myanmar">
                    {livePendingChunks > 0 && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    )}
                    <span>
                      {livePendingChunks > 0
                        ? t(language, "booth.liveTranscribing")
                        : t(language, "booth.liveListening")}
                    </span>
                  </span>
                )}
              </div>

              {isLiveListening && (
                <div
                  className="flex h-7 items-center gap-1 rounded-xl bg-white/70 dark:bg-[#18181B]/70 px-3"
                  aria-hidden="true"
                >
                  {liveWaveformBars.map((height, idx) => (
                    <span
                      key={idx}
                      className="flex-1 rounded-full bg-[#E11D48]/80 transition-all duration-75"
                      style={{ height: `${Math.max(14, height)}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 1. Unified Single-Sheet Script Canvas + Auto-Teleprompter */}
      <div className="rounded-[20px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] overflow-hidden transition-colors">
        {showTeleprompter ? (
          <div className="flex flex-col">
            {/* Teleprompter Controls Bar */}
            <div className="flex items-center justify-between gap-2 border-b border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B]/60 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#E11D48] font-myanmar">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E11D48] animate-pulse" />
                  Teleprompter
                </span>
                <button
                  type="button"
                  onClick={() => setTeleprompterScrolling((prev) => !prev)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-2.5 text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer font-myanmar"
                >
                  {teleprompterScrolling ? (
                    <>
                      <Pause className="h-3 w-3" />
                      <span>ခဏရပ်</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      <span>ဆက်ရွှေ့</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                  အမြန်နှုန်း
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  value={teleprompterSpeed}
                  onChange={(e) => setTeleprompterSpeed(Number(e.target.value))}
                  aria-label="Teleprompter scroll speed"
                  className="w-20 accent-[#1C1917] dark:accent-[#F5F5F4] cursor-pointer"
                />
                <span className="text-[11px] font-semibold tabular-nums text-[#1C1917] dark:text-[#F5F5F4] w-7 text-right">
                  {teleprompterSpeed.toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Auto-Scrolling Script Surface */}
            <div
              ref={teleprompterRef}
              className="h-64 sm:h-72 overflow-y-auto px-5 py-6 sm:px-6"
            >
              <p className="font-myanmar text-lg sm:text-xl leading-[1.9] whitespace-pre-wrap text-[#1C1917] dark:text-[#F5F5F4]">
                {voiceScriptText}
              </p>
              <div className="h-44" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <Textarea
              value={voiceScriptText}
              onChange={(e) => {
                setSelfRecordedNeedsTranscribe(false)
                setVoiceScriptText(e.target.value)
              }}
              rows={7}
              placeholder={t(language, "booth.scriptPlaceholder")}
              className="min-h-[210px] sm:min-h-[240px] w-full resize-none border-0 bg-transparent px-4 py-4 sm:px-5 sm:py-5 text-sm sm:text-base leading-[1.8] text-[#1C1917] dark:text-[#F5F5F4] placeholder:text-[#A8A29E] dark:placeholder:text-[#71717A] focus-visible:ring-0 focus-visible:ring-offset-0 font-myanmar"
            />
            {voiceScriptText.trim() && (
              <div className="flex items-center justify-between border-t border-[#E7E5E4]/70 dark:border-[#3F3F46]/70 px-4 py-2 text-[11px] text-[#57534E] dark:text-[#A1A1AA]">
                <span className="tabular-nums font-myanmar">
                  ခန့်မှန်းကြာချိန် ~{toBurmeseDigits(estimateSpokenDurationSeconds(voiceScriptText, voiceSpeed))} စက္ကန့်
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceScriptText("")}
                  className="hover:text-[#1C1917] dark:hover:text-[#F5F5F4] transition-colors cursor-pointer font-myanmar"
                >
                  ရှင်းမည်
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. De-AI 3-Pill Voice Switcher */}
      <div
        role="tablist"
        aria-label="Voice source"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#F0EDE8]/70 dark:bg-[#27272A]/70 p-1"
      >
        {(
          [
            { id: "self", icon: "🎙️", label: t(language, "booth.voiceSelf") },
            { id: "nilar", icon: "👩", label: t(language, "booth.voiceNilar") },
            { id: "thiha", icon: "👨", label: t(language, "booth.voiceThiha") },
          ] as const
        ).map((pill) => {
          const active = selectedVoice === pill.id
          return (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={isRecordingVoice || isGeneratingVoice}
              onClick={() => {
                triggerHaptic(6)
                setSelectedVoice(pill.id)
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-medium transition-all cursor-pointer font-myanmar disabled:opacity-60",
                active
                  ? "bg-white dark:bg-[#18181B] text-[#1C1917] dark:text-[#F5F5F4] shadow-xs font-semibold"
                  : "text-[#57534E] dark:text-[#A1A1AA] hover:text-[#1C1917] dark:hover:text-[#F5F5F4]"
              )}
            >
              <span aria-hidden="true">{pill.icon}</span>
              <span>{pill.label}</span>
            </button>
          )
        })}
      </div>

      {/* 3. Dynamic Single Primary Action Control */}
      <div className="rounded-[20px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] px-5 py-6">
        {selectedVoice === "self" ? (
          <div className="space-y-4">
            {/* Compact Side-by-Side Record Control + Live Reactive Waveform + Tabular Timer */}
            <div className="flex items-center gap-3.5 sm:gap-4">
              {/* Tactile iPhone Voice Memos-Style Compact Record/Stop Button */}
              <button
                type="button"
                onTouchStart={() => unlockIosAudio()}
                onClick={isRecordingVoice ? stopRecording : startRecording}
                disabled={isTranscribing || isGeneratingVoice}
                aria-label={isRecordingVoice ? "Stop recording" : "Start recording"}
                className={cn(
                  "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50",
                  isRecordingVoice
                    ? "border-[#E11D48]/45 bg-[#E11D48]/5"
                    : "border-[#D6D3D1] dark:border-[#52525B]"
                )}
              >
                <span
                  className={cn(
                    "transition-all duration-200 bg-[#E11D48]",
                    isRecordingVoice
                      ? "h-5 w-5 rounded-[5px]"
                      : "h-10 w-10 rounded-full hover:bg-[#BE123C]"
                  )}
                />
              </button>

              {/* Real-Time 28-Bar Hairline Audio Waveform */}
              <div
                className="flex flex-1 items-center justify-between gap-[2px] h-11 min-w-0 px-1"
                aria-hidden="true"
              >
                {waveformBars.map((heightPct, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-[2px] rounded-full transition-[height,background-color] duration-75 ease-out",
                      isRecordingVoice
                        ? "bg-[#E11D48]"
                        : "bg-[#D6D3D1] dark:bg-[#3F3F46]"
                    )}
                    style={{ height: isRecordingVoice ? `${heightPct}%` : "14%" }}
                  />
                ))}
              </div>

              {/* Crisp Tabular Timer */}
              <div className="shrink-0 text-xl sm:text-2xl font-light tracking-tight tabular-nums text-[#1C1917] dark:text-[#F5F5F4] min-w-[60px] text-right">
                {formatRecordTimer(recordingSeconds)}
              </div>
            </div>

            {/* Subtle Mic Filter Mode Pill + Upload Action */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#E7E5E4]/70 dark:border-[#3F3F46]/70">
              {!isRecordingVoice ? (
                <div
                  role="group"
                  aria-label="Mic filter mode"
                  className="inline-flex items-center rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#F0EDE8]/70 dark:bg-[#27272A] p-0.5"
                >
                  {(
                    [
                      { id: "raw", label: t(language, "booth.micRaw") },
                      { id: "light", label: t(language, "booth.micLight") },
                    ] as const
                  ).map((mode) => {
                    const active = micFilterMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic(6)
                          setMicFilterMode(mode.id)
                        }}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer font-myanmar",
                          active
                            ? "bg-white dark:bg-[#18181B] text-[#1C1917] dark:text-[#F5F5F4] shadow-2xs"
                            : "text-[#57534E] dark:text-[#A1A1AA] hover:text-[#1C1917] dark:hover:text-[#F5F5F4]"
                        )}
                      >
                        {mode.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#E11D48] font-medium font-myanmar">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E11D48] animate-pulse" />
                  {t(language, "booth.recording")}
                </span>
              )}

              {!isRecordingVoice && (
                <>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm"
                    onChange={handleUploadAudioFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isTranscribing}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] underline underline-offset-4 hover:opacity-80 cursor-pointer font-myanmar"
                  >
                    <Upload className="h-3 w-3" />
                    <span>{t(language, "booth.uploadAudio")}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              type="button"
              onTouchStart={() => unlockIosAudio()}
              onClick={handleReadWithNarrator}
              disabled={
                isGeneratingVoice ||
                isTranscribing ||
                isRecordingVoice ||
                (!voiceScriptText.trim() && generatedAudioSource !== "my_voice")
              }
              className="w-full h-12 rounded-2xl bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B] text-sm font-semibold transition-all active:scale-[0.99] font-myanmar"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  <span>{t(language, "booth.transcribing")}</span>
                </>
              ) : isGeneratingVoice ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  <span>
                    {isExtractingPdf
                      ? "စာမျက်နှာများကို ဖတ်ရှုသန့်စင်နေပါသည်..."
                      : ttsStatus === "preparing"
                        ? t(language, "booth.preparingText")
                        : ttsProgress && ttsProgress.total > 1
                          ? `အသံဖိုင် တစ်ဆက်တည်း ပေါင်းစပ်နေပါသည်... (${language === "my" ? toBurmeseDigits(ttsProgress.current) : ttsProgress.current}/${language === "my" ? toBurmeseDigits(ttsProgress.total) : ttsProgress.total})`
                          : t(language, "booth.generatingAudio")}
                  </span>
                </>
              ) : (
                <span>{narratorButtonLabel}</span>
              )}
            </Button>

            {isGeneratingVoice && ttsProgress && ttsProgress.total > 1 && (
              <div className="h-1 w-full rounded-full bg-[#E7E5E4] dark:bg-[#3F3F46] overflow-hidden">
                <div
                  className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-200"
                  style={{
                    width: `${Math.round((ttsProgress.current / ttsProgress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Unified Voice Memos Player & 1-Tap Transcribe */}
      {generatedAudioUrl && (
        <div className="space-y-2.5">
          <IosAudioPlayer
            src={generatedAudioUrl}
            title={generatedAudioTitle || "အသံဖိုင်"}
            subtitle={`ကြာချိန် ${formatAudioClockDuration(generatedAudioDuration)}`}
            initialDuration={generatedAudioDuration}
            fileExtension={generatedAudioExtension}
            onDownload={handleDownloadActiveAudio}
            onShare={handleShareActiveAudio}
            downloadLabel={generatedAudioExtension.toUpperCase()}
            shareLabel="Share"
          />

          {generatedAudioSource === "my_voice" && (
            <Button
              type="button"
              variant="outline"
              onClick={handleTranscribeRecording}
              disabled={isTranscribing || isRecordingVoice}
              className="w-full h-10 rounded-2xl border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-xs sm:text-sm font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] font-myanmar"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" />
                  <span>{t(language, "booth.transcribing")}</span>
                </>
              ) : (
                <span>{t(language, "booth.transcribeBtn")}</span>
              )}
            </Button>
          )}
        </div>
      )}

      {/* 5. Slide-Up ⚙️ ညှိရန် Bottom Sheet */}
      <StudioSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        speed={voiceSpeed}
        onSpeedChange={setVoiceSpeed}
        dialogueMode={voiceDialogueMode}
        onDialogueModeChange={setVoiceDialogueMode}
        onLoadDialogueSample={() =>
          setVoiceScriptText(
            "Nilar: မင်္ဂလာပါရှင်! ဒီနေ့တော့ အရမ်းမိုက်တဲ့ အကြောင်းအရာလေးကို မျှဝေပေးမယ်နော်။\nThiha: ဟုတ်ပါတယ်! နားထောင်ရတာလည်း ရှင်းလင်းပြီး အသုံးဝင်မှာ သေချာပါတယ်။"
          )
        }
        musicPreset={voiceMusicPreset}
        onMusicPresetChange={setVoiceMusicPreset}
        customMusicFile={voiceCustomMusicFile}
        onCustomMusicFileChange={setVoiceCustomMusicFile}
      />
    </div>
  )
}
