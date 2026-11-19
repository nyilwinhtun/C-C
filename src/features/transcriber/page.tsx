"use client"

import { useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  FileAudio,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Square,
  Upload,
  Video,
  Wand2,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import {
  generateContent,
  transcribeAudioWithGemini,
  type AudioTranscriptionLanguage,
} from "@/api/aiService"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"
import { Textarea } from "@/components/ui/textarea"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

const WAVEFORM_BAR_COUNT = 16

export function TranscriberPage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setActivePageKey: state.setActivePageKey,
    }))
  )
  const { setVoiceoverDraftScript, setDraftInput, saveToVault } = useContentStore(
    useShallow((state) => ({
      setVoiceoverDraftScript: state.setVoiceoverDraftScript,
      setDraftInput: state.setDraftInput,
      saveToVault: state.saveToVault,
    }))
  )
  const isMy = language === "my"

  const [langHint, setLangHint] = useState<AudioTranscriptionLanguage>("auto")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [waveformBars, setWaveformBars] = useState<number[]>(
    () => Array(WAVEFORM_BAR_COUNT).fill(18)
  )

  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [audioLabel, setAudioLabel] = useState<string | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [copied, setCopied] = useState(false)

  const [isPolishing, setIsPolishing] = useState<"post" | "script" | null>(null)
  const [polishedResult, setPolishedResult] = useState<{
    kind: "post" | "script"
    text: string
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const chunksRef = useRef<BlobPart[]>([])
  const previewUrlRef = useRef<string | null>(null)

  const stopMediaResources = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setWaveformBars(Array(WAVEFORM_BAR_COUNT).fill(18))
  }

  useEffect(() => {
    return () => {
      stopMediaResources()
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const setPreviewFromBlob = (blob: Blob, label: string) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setAudioPreviewUrl(url)
    setAudioLabel(label)
  }

  const runTranscription = async (blob: Blob, mimeType?: string, fileName?: string) => {
    setIsTranscribing(true)
    try {
      const text = await transcribeAudioWithGemini(blob, mimeType, langHint, fileName)
      setTranscript(text)
      setPolishedResult(null)
      toast.success(isMy ? "အသံမှ စာသားပြောင်းပြီးပါပြီ" : "Audio transcribed!")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed."
      toast.error(msg)
    } finally {
      setIsTranscribing(false)
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(
        isMy
          ? "ဤ Browser တွင် အသံဖမ်းစနစ်ကို မပံ့ပိုးပါ"
          : "Audio recording is not supported in this browser."
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickSupportedRecorderMime()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type: finalMime })
        stopMediaResources()
        setIsRecording(false)
        if (blob.size > 0) {
          setPreviewFromBlob(
            blob,
            isMy ? `အသံသွင်းချက် (${formatTimer(recordingSeconds)})` : "Voice Recording"
          )
          void runTranscription(blob, finalMime)
        }
      }

      // Live waveform analyser
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)

        const updateBars = () => {
          analyser.getByteFrequencyData(data)
          const bars: number[] = []
          for (let i = 0; i < WAVEFORM_BAR_COUNT; i += 1) {
            const val = data[i % data.length] ?? 0
            bars.push(Math.max(14, Math.min(100, Math.round((val / 255) * 100))))
          }
          setWaveformBars(bars)
          rafRef.current = requestAnimationFrame(updateBars)
        }
        rafRef.current = requestAnimationFrame(updateBars)
      }

      setRecordingSeconds(0)
      setIsRecording(true)
      recorder.start(250)
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      stopMediaResources()
      setIsRecording(false)
      const msg =
        err instanceof Error ? err.message : "Microphone permission denied or unavailable."
      toast.error(msg)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop()
    } else {
      stopMediaResources()
      setIsRecording(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setPreviewFromBlob(file, file.name)
    await runTranscription(file, file.type, file.name)
  }

  const handleCopy = async (textToCopy: string) => {
    if (!textToCopy.trim()) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      toast.success(isMy ? "စာသားကို Copy ကူးပြီးပါပြီ" : "Copied to clipboard!")
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Could not copy text.")
    }
  }

  const handlePolish = async (kind: "post" | "script") => {
    if (!transcript.trim()) return
    setIsPolishing(kind)
    try {
      const outputLang =
        langHint === "en" ? "english" : langHint === "my" ? "myanmar" : "myanmar"
      const res = await generateContent({
        topic:
          kind === "post"
            ? `Turn this spoken voice note into a clean, engaging Facebook & TikTok post with a strong hook and clear structure:\n\n${transcript}`
            : `Turn this spoken voice note into a punchy short-form Video Script with [0-3s Hook], [Body], and [CTA]:\n\n${transcript}`,
        platform: kind === "post" ? "facebook" : "tiktok",
        contentType: kind === "post" ? "post_caption" : "video_script",
        tone: "engaging",
        language: outputLang,
        includeHashtags: kind === "post",
      })
      setPolishedResult({ kind, text: res.content })
      toast.success(
        kind === "post"
          ? isMy
            ? "Facebook/TikTok ပို့စ်အဖြစ် ပြင်ဆင်ပြီးပါပြီ"
            : "Polished into a social post!"
          : isMy
            ? "ဗီဒီယို Script အဖြစ် ပြောင်းလဲပြီးပါပြီ"
            : "Turned into a video script!"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to polish transcript."
      toast.error(msg)
    } finally {
      setIsPolishing(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Mic className="h-5 w-5 text-rose-500 shrink-0" />
            <span>{isMy ? "အသံမှ စာသားပြောင်းစက် (Voice-to-Text)" : "Voice Recorder & Speech-to-Text"}</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {isMy
              ? "အသံသွင်းပါ သို့မဟုတ် .mp3 / .m4a / .wav / .ogg ဖိုင်တင်ပြီး မြန်မာ/အင်္ဂလိပ် စာသားအဖြစ် ပြောင်းလဲပါ။"
              : "Record your voice or upload an audio file (.mp3, .m4a, .wav, .ogg) to transcribe Burmese & English speech."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Language Hint */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {isMy ? "ဘာသာစကား" : "Spoken Language"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "auto", label: "Auto (MY + EN)", labelMy: "အလိုအလျောက် (MY+EN)" },
                  { id: "my", label: "Myanmar", labelMy: "မြန်မာ" },
                  { id: "en", label: "English", labelMy: "အင်္ဂလိပ်" },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={langHint === opt.id ? "default" : "outline"}
                  onClick={() => setLangHint(opt.id)}
                  disabled={isRecording || isTranscribing}
                  className="text-xs"
                >
                  {isMy ? opt.labelMy : opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Mobile Recorder Box */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col items-center gap-3">
            {/* Waveform Pulse */}
            <div className="flex items-center justify-center gap-1 h-12 w-full max-w-xs">
              {waveformBars.map((heightPct, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isRecording
                      ? "bg-gradient-to-t from-rose-500 to-orange-400"
                      : "bg-muted-foreground/25"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              ))}
            </div>

            <div className="text-lg font-mono font-semibold tracking-wider">
              {formatTimer(recordingSeconds)}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {!isRecording ? (
                <Button
                  type="button"
                  onClick={startRecording}
                  disabled={isTranscribing}
                  className="gap-2 rounded-full px-5 bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700"
                >
                  <Mic className="h-4 w-4" />
                  <span>{isMy ? "အသံစတင်သွင်းမည်" : "Start Recording"}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={stopRecording}
                  variant="destructive"
                  className="gap-2 rounded-full px-5 animate-pulse"
                >
                  <Square className="h-4 w-4 fill-current" />
                  <span>{isMy ? "ရပ်တန့်ပြီး စာသားပြောင်းမည်" : "Stop & Transcribe"}</span>
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.ogg,.webm,audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isRecording || isTranscribing}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 rounded-full"
              >
                <Upload className="h-4 w-4" />
                <span>{isMy ? "အသံဖိုင်တင်မည်" : "Upload Audio"}</span>
              </Button>
            </div>

            {isTranscribing && (
              <div className="flex items-center gap-2 text-xs text-blue-500 font-medium pt-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {isMy
                    ? "Gemini 2.5 Flash ဖြင့် စာသားပြောင်းနေသည်..."
                    : "Transcribing with Gemini 2.5 Flash..."}
                </span>
              </div>
            )}
          </div>

          {/* Audio Preview */}
          {audioPreviewUrl && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileAudio className="h-3.5 w-3.5" />
                <span className="truncate">{audioLabel}</span>
              </div>
              <audio controls src={audioPreviewUrl} className="w-full h-9" />
            </div>
          )}

          {/* Transcribed Text + 1-Tap Action Pills */}
          <div className="space-y-2">
            <Label htmlFor="transcribed-output" className="text-xs font-medium text-muted-foreground">
              {isMy ? "ပြောင်းလဲရရှိသော စာသား" : "Transcribed Text"}
            </Label>
            <Textarea
              id="transcribed-output"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                isMy
                  ? "အသံသွင်းပြီးပါက စာသားများ ဤနေရာတွင် ပေါ်လာပါမည်..."
                  : "Your transcribed Burmese/English text will appear here..."
              }
              className="min-h-[140px] resize-y text-sm leading-relaxed"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!transcript.trim()}
                onClick={() => handleCopy(transcript)}
                className="gap-1.5 text-xs rounded-full"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isMy ? "စာသား Copy ကူးမည်" : "Copy Text"}</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!transcript.trim() || isPolishing !== null}
                onClick={() => handlePolish("post")}
                className="gap-1.5 text-xs rounded-full"
              >
                {isPolishing === "post" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-blue-500" />
                )}
                <span>
                  {isMy ? "Facebook/TikTok ပို့စ်အဖြစ် ပြင်မည်" : "Polish into Facebook/TikTok Post"}
                </span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!transcript.trim() || isPolishing !== null}
                onClick={() => handlePolish("script")}
                className="gap-1.5 text-xs rounded-full"
              >
                {isPolishing === "script" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Video className="h-3.5 w-3.5 text-indigo-500" />
                )}
                <span>{isMy ? "ဗီဒီယို Script ပြောင်းမည်" : "Turn into Video Script"}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Polished Output Card */}
      {polishedResult && (
        <Card className="border-blue-500/30 bg-blue-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span>
                  {polishedResult.kind === "post"
                    ? isMy
                      ? "Facebook / TikTok ပို့စ်"
                      : "Polished Social Post"
                    : isMy
                      ? "ဗီဒီယို Script"
                      : "Generated Video Script"}
                </span>
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                AI Ready
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={polishedResult.text}
              onChange={(e) =>
                setPolishedResult((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              className="min-h-[140px] text-sm leading-relaxed bg-background"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleCopy(polishedResult.text)}
                className="gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{isMy ? "Copy ကူးမည်" : "Copy"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  saveToVault({
                    title:
                      polishedResult.kind === "post" ? "Voice Note Post" : "Voice Note Script",
                    content: polishedResult.text,
                    platform: polishedResult.kind === "post" ? "facebook" : "tiktok",
                    tags: ["voice-note"],
                    status: "draft",
                  })
                  toast.success(isMy ? "Vault ထဲသို့ သိမ်းပြီးပါပြီ" : "Saved to Vault!")
                }}
                className="gap-1.5 text-xs"
              >
                <span>{isMy ? "Vault တွင် သိမ်းမည်" : "Save to Vault"}</span>
              </Button>
              {polishedResult.kind === "script" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setVoiceoverDraftScript(polishedResult.text)
                    setActivePageKey("voiceover")
                  }}
                  className="gap-1.5 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isMy ? "AI Voiceover သို့ ပို့မည်" : "Send to AI Voiceover"}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setDraftInput({ topic: transcript, platform: "facebook", contentType: "post_caption" })
                    setActivePageKey("text")
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isMy ? "Text Post တွင် ဖွင့်မည်" : "Open in Text Post"}</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
