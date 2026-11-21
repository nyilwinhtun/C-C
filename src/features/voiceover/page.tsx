"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Pause, Play, Settings2, Upload } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { transcribeAudioWithGemini } from "@/api/aiService"
import {
  cleanVoiceoverText,
  estimateSpokenDurationSeconds,
  formatAudioClockDuration,
  generateBurmeseDialogueVoiceover,
  generateBurmeseVoiceover,
  mixVoiceoverWithAutoDuckingMusic,
  toBurmeseDigits,
  type BurmeseVoiceType,
  type VoiceoverProgress,
  type VoiceoverSpeed,
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
  playBlobUrlWithPrimedAudio,
  setIosAudioSessionPlayback,
  unlockIosAudio,
  type WavAudioRecorderHandle,
} from "@/lib/iosAudio"
import { cn, triggerHaptic } from "@/lib/utils"
import { getAudioBlobDurationSeconds, type BackgroundMusicPreset } from "@/lib/videoAudioMerger"
import { useContentStore } from "@/store/useContentStore"
import { StudioSettingsSheet } from "./StudioSettingsSheet"

type VoiceChoice = "my_voice" | "nilar" | "thiha"

interface StudioAudioResult {
  source: "my_voice" | "narrator"
  audioUrl: string
  blob: Blob
  rawBlobForTranscribe?: Blob
  mimeType: string
  fileExtension: string
  durationSeconds: number
  title: string
}

const SCRIPT_PLACEHOLDER =
  "အသံဖတ်ခိုင်းမယ့် စာသား ဒါမှမဟုတ် ကိုယ်တိုင်ဖတ်မယ့် စာသားကို ဒီမှာ ရေးပါ (အလွတ်စကားပြောသွင်းလိုပါက ဒီအတိုင်း အသံဖမ်းနိုင်ပါသည်)..."

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
  const { voiceoverDraftScript, setVoiceoverDraftScript, customPronunciations, addAudioSession } =
    useContentStore(
      useShallow((state) => ({
        voiceoverDraftScript: state.voiceoverDraftScript,
        setVoiceoverDraftScript: state.setVoiceoverDraftScript,
        customPronunciations: state.customPronunciations,
        addAudioSession: state.addAudioSession,
      }))
    )

  // Core studio mode
  const [voiceChoice, setVoiceChoice] = useState<VoiceChoice>("my_voice")

  // Studio settings (tucked inside ⚙️ ညှိရန် bottom sheet)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [dialogueMode, setDialogueMode] = useState(false)
  const [musicPreset, setMusicPreset] = useState<BackgroundMusicPreset>("none")
  const [customMusicFile, setCustomMusicFile] = useState<File | null>(null)

  // Recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [acousticLevel, setAcousticLevel] = useState(0)

  // Teleprompter state (auto-activates when recording in My Voice with script)
  const [teleprompterScrolling, setTeleprompterScrolling] = useState(true)
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(1.0)
  const teleprompterRef = useRef<HTMLDivElement | null>(null)

  // Generation & transcription state
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [voiceProgress, setVoiceProgress] = useState<VoiceoverProgress | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)

  // Unified Voice Memos Player state
  const [activeAudio, setActiveAudio] = useState<StudioAudioResult | null>(null)

  const activeUrlRef = useRef<string | null>(null)
  const wavRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<number | null>(null)
  const recordingSecondsRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const revokeActiveUrl = useCallback(() => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current)
      activeUrlRef.current = null
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
    setAcousticLevel(0)
  }, [])

  useEffect(() => {
    return () => {
      stopRecorderResources()
      revokeActiveUrl()
    }
  }, [stopRecorderResources, revokeActiveUrl])

  const showTeleprompter =
    voiceChoice === "my_voice" && isRecordingVoice && voiceoverDraftScript.trim().length > 0

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

  const activeNarratorType: BurmeseVoiceType = voiceChoice === "thiha" ? "male" : "female"
  const hasActiveSettings =
    speed !== 1.0 || dialogueMode || musicPreset !== "none"

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

    if (musicPreset !== "none") {
      try {
        const mixed = await mixVoiceoverWithAutoDuckingMusic({
          voiceoverBlob: rawBlob,
          musicPreset,
          customMusicFile,
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

    revokeActiveUrl()
    const url = URL.createObjectURL(finalBlob)
    activeUrlRef.current = url

    setActiveAudio({
      source: "my_voice",
      audioUrl: url,
      blob: finalBlob,
      rawBlobForTranscribe: rawBlob,
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
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      wavRecorderRef.current = createWavAudioRecorder(stream, {
        audioContext: recorderCtx,
        barCount: 8,
        onBars: (bars) => {
          if (bars.length === 0) return
          const avg = bars.reduce((sum, v) => sum + v, 0) / bars.length
          setAcousticLevel(Math.min(100, Math.max(4, Math.round(avg))))
        },
      })

      recordingSecondsRef.current = 0
      setRecordingSeconds(0)
      setTeleprompterScrolling(true)
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop = 0
      }
      setIsRecordingVoice(true)

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

  const handleTranscribeRecording = async () => {
    if (!activeAudio || activeAudio.source !== "my_voice") return
    const sourceBlob = activeAudio.rawBlobForTranscribe ?? activeAudio.blob

    setIsTranscribing(true)
    try {
      let uploadBlob: Blob = sourceBlob
      let uploadMime = activeAudio.mimeType
      let uploadName = "recording.wav"

      try {
        const processed = await prepareAudioForGemini(sourceBlob)
        if (processed.isSilent) {
          toast.error("အသံမကြားရပါ — မိုက်ခရိုဖုန်း စစ်ဆေးပါ။")
          return
        }
        if (processed.wavBlob) {
          uploadBlob = processed.wavBlob
          uploadMime = processed.mimeType
          uploadName = "recording.wav"
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
        return
      }

      const existing = voiceoverDraftScript.trim()
      setVoiceoverDraftScript(existing ? `${existing}\n\n${trimmed}` : trimmed)
      toast.success("စာသားအဖြစ် သန့်ရှင်းစွာ ပြောင်းလဲပြီးပါပြီ။")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "စာသားပြောင်းလဲ၍ မရပါ။"
      toast.error(msg)
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleReadWithNarrator = async () => {
    setIosAudioSessionPlayback()
    unlockIosAudio()
    triggerHaptic(10)

    const trimmed = cleanVoiceoverText(voiceoverDraftScript)
    if (!trimmed) {
      toast.error("အသံဖတ်ခိုင်းရန် စာသားအရင်ထည့်ပါ။")
      return
    }

    setIsGeneratingVoice(true)
    setVoiceProgress(null)
    try {
      let result = dialogueMode
        ? await generateBurmeseDialogueVoiceover(voiceoverDraftScript, speed, {
            deliveryTone: "storytelling",
            customPronunciations,
            onProgress: setVoiceProgress,
          })
        : await generateBurmeseVoiceover(trimmed, activeNarratorType, speed, {
            deliveryTone: "storytelling",
            customPronunciations,
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

      revokeActiveUrl()
      activeUrlRef.current = result.audioUrl

      const title = dialogueMode
        ? "နီလာ + သီဟ"
        : voiceChoice === "thiha"
          ? "သီဟ"
          : "နီလာ"

      setActiveAudio({
        source: "narrator",
        audioUrl: result.audioUrl,
        blob: result.blob,
        mimeType: result.mimeType,
        fileExtension: result.fileExtension,
        durationSeconds: result.durationSeconds,
        title,
      })

      addAudioSession({
        script: voiceoverDraftScript.trim(),
        voiceLabel: title,
        mode: dialogueMode ? "dialogue" : "single",
        durationSeconds: result.durationSeconds,
      })

      void playBlobUrlWithPrimedAudio(result.audioUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "အသံဖိုင် ပြင်ဆင်၍ မရပါ။"
      toast.error(msg)
    } finally {
      setIsGeneratingVoice(false)
      setVoiceProgress(null)
    }
  }

  const handleDownloadActiveAudio = () => {
    if (!activeAudio) return
    const timestamp = new Date().toISOString().slice(0, 10)
    const prefix = activeAudio.source === "my_voice" ? "my-voice" : voiceChoice
    triggerBlobDownload(activeAudio.audioUrl, `${prefix}-${timestamp}.${activeAudio.fileExtension}`)
  }

  const narratorButtonLabel = dialogueMode
    ? "နီလာ + သီဟ အသံဖြင့် ဖတ်မည်"
    : voiceChoice === "thiha"
      ? "သီဟ အသံဖြင့် ဖတ်မည်"
      : "နီလာ အသံဖြင့် ဖတ်မည်"

  return (
    <div className="mx-auto w-full max-w-2xl pb-8 space-y-5">
      {/* Minimal Editorial Header */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
            အသံသွင်းခန်း
          </h1>
          <p className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            စာသားရေးပြီး ကိုယ်တိုင်ဖတ်ပါ သို့မဟုတ် နီလာ၊ သီဟ အသံဖြင့် နားထောင်ပါ
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className={cn(
            "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all active:scale-95 cursor-pointer font-myanmar",
            "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46]"
          )}
        >
          <Settings2 className="h-3.5 w-3.5 text-[#57534E] dark:text-[#A1A1AA]" />
          <span>⚙️ ညှိရန်</span>
          {hasActiveSettings && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
          )}
        </button>
      </div>

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
                {voiceoverDraftScript}
              </p>
              <div className="h-44" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <Textarea
              value={voiceoverDraftScript}
              onChange={(e) => setVoiceoverDraftScript(e.target.value)}
              rows={7}
              placeholder={SCRIPT_PLACEHOLDER}
              className="min-h-[210px] sm:min-h-[240px] w-full resize-none border-0 bg-transparent px-4 py-4 sm:px-5 sm:py-5 text-sm sm:text-base leading-[1.8] text-[#1C1917] dark:text-[#F5F5F4] placeholder:text-[#A8A29E] dark:placeholder:text-[#71717A] focus-visible:ring-0 focus-visible:ring-offset-0 font-myanmar"
            />
            {voiceoverDraftScript.trim() && (
              <div className="flex items-center justify-between border-t border-[#E7E5E4]/70 dark:border-[#3F3F46]/70 px-4 py-2 text-[11px] text-[#57534E] dark:text-[#A1A1AA]">
                <span className="tabular-nums font-myanmar">
                  ခန့်မှန်းကြာချိန် ~{toBurmeseDigits(estimateSpokenDurationSeconds(voiceoverDraftScript, speed))} စက္ကန့်
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceoverDraftScript("")}
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
            { id: "my_voice", icon: "🎙️", label: "ကိုယ်တိုင်" },
            { id: "nilar", icon: "👩", label: "နီလာ" },
            { id: "thiha", icon: "👨", label: "သီဟ" },
          ] as const
        ).map((pill) => {
          const active = voiceChoice === pill.id
          return (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={isRecordingVoice || isGeneratingVoice}
              onClick={() => {
                triggerHaptic(6)
                setVoiceChoice(pill.id)
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
        {voiceChoice === "my_voice" ? (
          <div className="flex flex-col items-center space-y-4">
            {/* Crisp Tabular Timer */}
            <div className="text-3xl font-light tracking-tight tabular-nums text-[#1C1917] dark:text-[#F5F5F4]">
              {formatRecordTimer(recordingSeconds)}
            </div>

            {/* Minimalist Hairline Acoustic Level Meter */}
            <div
              className="w-full max-w-[220px] h-[2px] rounded-full bg-[#E7E5E4] dark:bg-[#3F3F46] overflow-hidden"
              aria-hidden="true"
            >
              <div
                className={cn(
                  "h-full mx-auto rounded-full transition-[width] duration-75",
                  isRecordingVoice ? "bg-[#E11D48]" : "bg-transparent"
                )}
                style={{ width: isRecordingVoice ? `${acousticLevel}%` : "0%" }}
              />
            </div>

            {/* Tactile iPhone Voice Memos-Style Circular Red Record/Stop Button */}
            <button
              type="button"
              onTouchStart={() => unlockIosAudio()}
              onClick={isRecordingVoice ? stopRecording : startRecording}
              disabled={isTranscribing || isGeneratingVoice}
              aria-label={isRecordingVoice ? "Stop recording" : "Start recording"}
              className={cn(
                "relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50",
                isRecordingVoice
                  ? "border-[#E11D48]/45"
                  : "border-[#D6D3D1] dark:border-[#52525B]"
              )}
            >
              <span
                className={cn(
                  "transition-all duration-200 bg-[#E11D48]",
                  isRecordingVoice
                    ? "h-6 w-6 rounded-[6px]"
                    : "h-14 w-14 rounded-full hover:bg-[#BE123C]"
                )}
              />
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                {isRecordingVoice
                  ? "အသံဖမ်းနေပါသည် — ရပ်ရန် နှိပ်ပါ"
                  : "အသံဖမ်းရန် အနီရောင်ခလုတ်ကို နှိပ်ပါ"}
              </span>

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
                    <span>ဖိုင်တင်မည်</span>
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
              disabled={isGeneratingVoice || !voiceoverDraftScript.trim()}
              className="w-full h-12 rounded-2xl bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B] text-sm font-semibold transition-all active:scale-[0.99] font-myanmar"
            >
              {isGeneratingVoice ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  <span>
                    {voiceProgress && voiceProgress.totalChunks > 1
                      ? `အသံဖိုင် ပြင်ဆင်နေပါသည်... (${toBurmeseDigits(voiceProgress.currentChunk)}/${toBurmeseDigits(voiceProgress.totalChunks)})`
                      : "အသံဖိုင် ပြင်ဆင်နေပါသည်..."}
                  </span>
                </>
              ) : (
                <span>{narratorButtonLabel}</span>
              )}
            </Button>

            {isGeneratingVoice && voiceProgress && voiceProgress.totalChunks > 1 && (
              <div className="h-1 w-full rounded-full bg-[#E7E5E4] dark:bg-[#3F3F46] overflow-hidden">
                <div
                  className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-200"
                  style={{
                    width: `${Math.round((voiceProgress.currentChunk / voiceProgress.totalChunks) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Unified Voice Memos Player & 1-Tap Transcribe */}
      {activeAudio && (
        <div className="space-y-2.5">
          <IosAudioPlayer
            src={activeAudio.audioUrl}
            title={activeAudio.title}
            subtitle={`ကြာချိန် ${formatAudioClockDuration(activeAudio.durationSeconds)}`}
            initialDuration={activeAudio.durationSeconds}
            fileExtension={activeAudio.fileExtension}
            onDownload={handleDownloadActiveAudio}
            downloadLabel="WAV"
          />

          {activeAudio.source === "my_voice" && (
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
                  <span>စာသားအဖြစ် ပြောင်းလဲနေပါသည်...</span>
                </>
              ) : (
                <span>📝 စာသားအဖြစ် ပြန်ပြောင်းမည်</span>
              )}
            </Button>
          )}
        </div>
      )}

      {/* 5. Slide-Up ⚙️ ညှိရန် Bottom Sheet */}
      <StudioSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        speed={speed}
        onSpeedChange={setSpeed}
        dialogueMode={dialogueMode}
        onDialogueModeChange={setDialogueMode}
        onLoadDialogueSample={() =>
          setVoiceoverDraftScript(
            "Nilar: မင်္ဂလာပါရှင်! ဒီနေ့တော့ အရမ်းမိုက်တဲ့ အကြောင်းအရာလေးကို မျှဝေပေးမယ်နော်။\nThiha: ဟုတ်ပါတယ်! နားထောင်ရတာလည်း ရှင်းလင်းပြီး အသုံးဝင်မှာ သေချာပါတယ်။"
          )
        }
        musicPreset={musicPreset}
        onMusicPresetChange={setMusicPreset}
        customMusicFile={customMusicFile}
        onCustomMusicFileChange={setCustomMusicFile}
        activeVoiceType={activeNarratorType}
        onLoadStoryToCanvas={(text) => {
          setVoiceoverDraftScript(text)
          toast.success("စာသားကွက်ထဲသို့ ထည့်သွင်းပြီးပါပြီ။")
        }}
      />
    </div>
  )
}
