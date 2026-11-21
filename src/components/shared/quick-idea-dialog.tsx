"use client"

import { useEffect, useRef, useState } from "react"
import { Lightbulb, Loader2, Mic, MicOff, Plus } from "lucide-react"
import { SquircleIcon } from "@/components/shared/squircle-icon"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import { transcribeAudioWithGemini } from "@/api/aiService"
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
import { t } from "@/locales/translations"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface QuickIdeaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

export function QuickIdeaDialog({ open, onOpenChange }: QuickIdeaDialogProps) {
  const language = useUIStore(useShallow((state) => state.language))
  const saveToVault = useContentStore((state) => state.saveToVault)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [platform, setPlatform] = useState("facebook")
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const wavRecorderRef = useRef<WavAudioRecorderHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const canRecordWav =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(getAudioContextConstructor())
  const speechSupported = canRecordWav || Boolean(getSpeechRecognitionCtor())

  const stopMediaResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (!open) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // Ignore stop errors
        }
        recognitionRef.current = null
      }
      if (wavRecorderRef.current) {
        wavRecorderRef.current.cancel()
        wavRecorderRef.current = null
      }
      stopMediaResources()
      setIsListening(false)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // Ignore stop errors
        }
        recognitionRef.current = null
      }
      if (wavRecorderRef.current) {
        wavRecorderRef.current.cancel()
        wavRecorderRef.current = null
      }
      stopMediaResources()
    }
  }, [])

  const startSpeechFallback = () => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      toast.error("Voice dictation is not supported in this browser.")
      return
    }

    try {
      const recognition = new Ctor()
      recognition.lang = language === "my" ? "my-MM" : "en-US"
      recognition.continuous = true
      recognition.interimResults = false

      recognition.onresult = (event) => {
        let transcript = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i]?.isFinal) {
            transcript += event.results[i][0]?.transcript ?? ""
          }
        }
        const cleaned = transcript.trim()
        if (cleaned) {
          setContent((prev) => (prev.trim() ? `${prev.trim()} ${cleaned}` : cleaned))
        }
      }

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
      toast.error("Could not start voice dictation.")
    }
  }

  const toggleDictation = async () => {
    if (isTranscribing) return

    if (isListening) {
      if (wavRecorderRef.current) {
        const handle = wavRecorderRef.current
        wavRecorderRef.current = null
        stopMediaResources()
        setIsListening(false)

        try {
          const { blob } = await handle.stop()
          if (blob.size <= MIN_VALID_RECORDING_BYTES) {
            toast.error(t(language, "postWriter.micEmpty"))
            return
          }
          setIsTranscribing(true)
          const processed = await prepareAudioForGemini(blob)
          if (processed.isSilent || !processed.wavBlob) {
            toast.error(t(language, "postWriter.micNoSpeech"))
            return
          }
          const transcript = await transcribeAudioWithGemini(
            processed.wavBlob,
            processed.mimeType,
            "auto",
            "quick-idea.wav"
          )
          const cleaned = transcript.trim()
          if (!cleaned) {
            toast.error(t(language, "postWriter.micNoSpeech"))
            return
          }
          setContent((prev) => (prev.trim() ? `${prev.trim()} ${cleaned}` : cleaned))
          toast.success(t(language, "postWriter.transcribeSuccess"))
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : t(language, "postWriter.transcribeError")
          toast.error(msg)
        } finally {
          setIsTranscribing(false)
        }
        return
      }

      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      setIsListening(false)
      return
    }

    const hasGeminiKey = Boolean(
      useUIStore.getState().apiKeys.gemini?.trim() ||
        (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim()
    )

    if (canRecordWav && hasGeminiKey) {
      unlockIosAudio()
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
          micFilterMode: useContentStore.getState().micFilterMode,
        })
        setIsListening(true)
        return
      } catch {
        stopMediaResources()
        if (getSpeechRecognitionCtor()) {
          startSpeechFallback()
          return
        }
        toast.error(t(language, "postWriter.micPermError"))
        return
      }
    }

    if (getSpeechRecognitionCtor()) {
      startSpeechFallback()
      return
    }

    toast.error(
      language === "my"
        ? "အသံဖြင့် မှတ်သားရန် Settings တွင် Gemini API Key ထည့်သွင်းပေးပါ။"
        : "Please save a Gemini API key in Settings to use voice dictation."
    )
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedContent = content.trim()
    if (!trimmedContent) {
      toast.error(
        language === "my"
          ? "စိတ်ကူးစာသား အနည်းငယ် ထည့်ပေးပါ။"
          : "Please enter or dictate an idea first."
      )
      return
    }

    const fallbackTitle = trimmedContent.split("\n")[0]?.slice(0, 60).trim() || "Quick Idea"
    saveToVault({
      title: title.trim() || fallbackTitle,
      content: trimmedContent,
      platform,
      tags: ["quick-idea"],
      status: "idea",
    })

    toast.success(t(language, "quickIdea.saved"))
    setTitle("")
    setContent("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5">
        <div className="flex items-center gap-2.5 pr-8">
          <SquircleIcon icon={Lightbulb} tone="amber" size="md" />
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold font-myanmar">
              {t(language, "quickIdea.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-myanmar">
              {t(language, "quickIdea.desc")}
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Label htmlFor="quick-idea-title" className="sr-only">
                Title
              </Label>
              <Input
                id="quick-idea-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(language, "quickIdea.titlePlaceholder")}
                className="h-9 text-sm border-border/60 font-myanmar"
              />
            </div>
            <div>
              <Label htmlFor="quick-idea-platform" className="sr-only">
                Platform
              </Label>
              <Select
                id="quick-idea-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-9 text-xs border-border/60"
              >
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Textarea
              id="quick-idea-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder={t(language, "quickIdea.contentPlaceholder")}
              className="text-sm font-myanmar leading-relaxed border-border/60"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {speechSupported ? (
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="sm"
                disabled={isTranscribing}
                onClick={() => void toggleDictation()}
                className="h-9 px-3 text-xs border-border/60 font-myanmar"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                    {t(language, "postWriter.transcribing")}
                  </>
                ) : isListening ? (
                  <>
                    <MicOff className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    {t(language, "quickIdea.listening")}
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 mr-1.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {t(language, "quickIdea.dictate")}
                  </>
                )}
              </Button>
            ) : (
              <span />
            )}

            <Button
              type="submit"
              size="sm"
              className="h-9 px-4 text-xs font-semibold font-myanmar"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" strokeWidth={2} aria-hidden="true" />
              {t(language, "quickIdea.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

