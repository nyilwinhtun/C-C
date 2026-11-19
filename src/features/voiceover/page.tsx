"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Captions,
  ChevronDown,
  Download,
  Film,
  Loader2,
  Mic,
  Plus,
  Repeat,
  Scissors,
  Share2,
  Sparkles,
  Tag,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import { isSupportedVideoFile } from "@/api/aiService"
import {
  BURMESE_VOICE_PRESETS,
  VOICE_DELIVERY_PRESETS,
  VOICEOVER_SPEEDS,
  cleanVoiceoverText,
  generateBurmeseVoiceover,
  normalizeBurmeseForTTS,
  type BurmeseVoiceType,
  type VoiceDeliveryTone,
  type VoiceoverResult,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import {
  mergeVideoWithVoiceover,
  type MergeVideoAudioResult,
  type OriginalAudioVolume,
  type VideoDurationSyncMode,
} from "@/lib/videoAudioMerger"
import { useContentStore } from "@/store/useContentStore"
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

const VOLUME_OPTIONS: Array<{
  value: OriginalAudioVolume
  label: string
  labelMy: string
}> = [
  { value: 0, label: "Mute 0%", labelMy: "အသံပိတ် 0%" },
  { value: 0.15, label: "Low 15%", labelMy: "နောက်ခံတိုး 15%" },
  { value: 0.5, label: "Normal 50%", labelMy: "ပုံမှန် 50%" },
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
    brandSignature,
    customPronunciations,
    addCustomPronunciation,
    removeCustomPronunciation,
  } = useContentStore(
    useShallow((state) => ({
      voiceoverDraftScript: state.voiceoverDraftScript,
      setVoiceoverDraftScript: state.setVoiceoverDraftScript,
      videoFile: state.uploadedVideoFile,
      videoPreviewUrl: state.videoPreviewUrl,
      setUploadedVideo: state.setUploadedVideo,
      clearUploadedVideo: state.clearUploadedVideo,
      brandSignature: state.brandSignature,
      customPronunciations: state.customPronunciations,
      addCustomPronunciation: state.addCustomPronunciation,
      removeCustomPronunciation: state.removeCustomPronunciation,
    }))
  )

  const [voiceType, setVoiceType] = useState<BurmeseVoiceType>("female")
  const [deliveryTone, setDeliveryTone] = useState<VoiceDeliveryTone>("promo")
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [originalVolume, setOriginalVolume] = useState<OriginalAudioVolume>(0.15)

  const [isDictOpen, setIsDictOpen] = useState(false)
  const [newDictWord, setNewDictWord] = useState("")
  const [newDictPhonetic, setNewDictPhonetic] = useState("")

  const [enableSubtitles, setEnableSubtitles] = useState(true)
  const [enableWatermark, setEnableWatermark] = useState(false)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [durationSyncMode, setDurationSyncMode] = useState<VideoDurationSyncMode>("loop_video")

  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [voiceoverResult, setVoiceoverResult] = useState<VoiceoverResult | null>(null)

  const [isMergingVideo, setIsMergingVideo] = useState(false)
  const [mergeProgress, setMergeProgress] = useState(0)
  const [mergedVideo, setMergedVideo] = useState<MergeVideoAudioResult | null>(null)

  const mergeAbortRef = useRef<AbortController | null>(null)
  const voiceUrlRef = useRef<string | null>(null)
  const mergedUrlRef = useRef<string | null>(null)

  const revokeVoiceUrl = useCallback(() => {
    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current)
      voiceUrlRef.current = null
    }
  }, [])

  const revokeMergedUrl = useCallback(() => {
    if (mergedUrlRef.current) {
      URL.revokeObjectURL(mergedUrlRef.current)
      mergedUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      mergeAbortRef.current?.abort()
      revokeVoiceUrl()
      revokeMergedUrl()
    }
  }, [revokeVoiceUrl, revokeMergedUrl])

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
    setVideoDuration(null)
    revokeMergedUrl()
    setMergedVideo(null)
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
    const optimized = normalizeBurmeseForTTS(voiceoverDraftScript, customPronunciations)
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

  const handleGenerateVoice = async () => {
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
    try {
      const result = await generateBurmeseVoiceover(trimmed, voiceType, speed, {
        deliveryTone,
        customPronunciations,
      })
      revokeVoiceUrl()
      revokeMergedUrl()
      voiceUrlRef.current = result.audioUrl
      setVoiceoverResult(result)
      setMergedVideo(null)
      if (videoDuration !== null) {
        setDurationSyncMode(result.durationSeconds > videoDuration ? "loop_video" : "fit_video")
      }
      toast.success(
        isMy ? "AI အသံနမူနာ ဖန်တီးပြီးပါပြီ။" : "Burmese AI voiceover generated!"
      )
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate Burmese voiceover."
      toast.error(msg)
    } finally {
      setIsGeneratingVoice(false)
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

  const handleMergeVideo = async () => {
    if (!videoFile) {
      toast.error(
        isMy
          ? "ဗီဒီယိုဖိုင် မရှိသေးပါ။ ဗီဒီယိုတစ်ခု တင်ပေးပါ။"
          : "No video file loaded. Upload a video below first."
      )
      return
    }
    if (!voiceoverResult) {
      toast.error(
        isMy
          ? "အရင်ဆုံး AI Voiceover အသံဖန်တီးပါ။"
          : "Generate the AI voice preview first."
      )
      return
    }

    mergeAbortRef.current?.abort()
    const controller = new AbortController()
    mergeAbortRef.current = controller

    setIsMergingVideo(true)
    setMergeProgress(0)

    try {
      const merged = await mergeVideoWithVoiceover({
        videoFile,
        voiceoverAudio: voiceoverResult.audioBuffer,
        originalVolume,
        voiceoverVolume: 1.0,
        durationSyncMode,
        enableSubtitles,
        subtitleScript: voiceoverDraftScript,
        watermarkText: enableWatermark ? brandSignature : "",
        onProgress: setMergeProgress,
        signal: controller.signal,
      })

      revokeMergedUrl()
      mergedUrlRef.current = merged.videoUrl
      setMergedVideo(merged)

      const baseName = videoFile.name.replace(/\.[^.]+$/, "") || "video"
      triggerBlobDownload(
        merged.videoUrl,
        `${baseName}-burmese-ai.${merged.fileExtension}`
      )

      toast.success(
        isMy
          ? "အသံနှင့် ဗီဒီယို ပေါင်းစပ်ပြီး ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။"
          : "Video & AI voiceover merged and downloaded!"
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
    const baseName = videoFile?.name.replace(/\.[^.]+$/, "") || "burmese-ai-video"
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

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24 lg:pb-6">
      <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.04] via-card to-blue-500/[0.04] shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 font-myanmar">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isMy
                  ? "မြန်မာ AI အသံသွင်းနှင့် ဗီဒီယိုပေါင်းစပ်စတူဒီယို"
                  : "Burmese AI Voiceover & Video Merge Studio"}
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 font-myanmar">
              {isMy
                ? "စာသားမှ AI အသံဖန်တီးပြီး ဗီဒီယိုနှင့် တိုက်ရိုက်ပေါင်းစပ်ထုတ်ယူပါ"
                : "Synthesize Burmese AI voiceover and optionally merge directly into a video"}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            100% On-Device
          </Badge>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-5 space-y-4">
          {/* Script input */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label
                htmlFor="voiceover-page-text"
                className="text-xs font-medium text-muted-foreground font-myanmar"
              >
                {isMy ? "အသံဖတ်မည့် စာသား" : "Spoken Script"}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOptimizeSpeechText}
                  disabled={!voiceoverDraftScript.trim() || isGeneratingVoice}
                  className="h-7 px-2.5 text-[11px] font-medium font-myanmar border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10"
                >
                  🪄 အသံထွက်စာသား ပြောင်းမည် (Optimize for Voice)
                </Button>
                {voiceoverDraftScript && (
                  <button
                    type="button"
                    onClick={() => setVoiceoverDraftScript("")}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {isMy ? "ရှင်းမည်" : "Clear"}
                  </button>
                )}
              </div>
            </div>
            <Textarea
              id="voiceover-page-text"
              value={voiceoverDraftScript}
              onChange={(e) => setVoiceoverDraftScript(e.target.value)}
              rows={5}
              placeholder={
                isMy
                  ? "အသံပြောင်းလိုသော မြန်မာစာသားကို ရိုက်ထည့်ပါ သို့မဟုတ် စာသားပို့စ်/ဗီဒီယိုမှ ပေးပို့ပါ..."
                  : "Type or paste Burmese script here, or send from Text Post / Video Script..."
              }
              className="text-sm font-myanmar leading-relaxed resize-y bg-background/80 border-border/60"
            />
          </div>

          {/* Voice Delivery Preset Pills */}
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
                    className={`rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer ${
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Mic className="h-3 w-3" aria-hidden="true" />
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
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div className="text-xs font-semibold leading-tight">
                        {type === "female" ? "Female" : "Male"}
                      </div>
                      <div className="text-[11px] opacity-80 truncate font-myanmar">
                        {type === "female" ? "Nilar" : "Thiha"}
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
                      className={`rounded-lg border py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
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

          {/* Collapsible Custom Pronunciation Dictionary */}
          <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsDictOpen((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-myanmar">
                <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>📖 အသံထွက်မှတ်စု (Custom Words)</span>
                {customPronunciations.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {customPronunciations.length}
                  </Badge>
                )}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                  isDictOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {isDictOpen && (
              <div className="px-3 pb-3 pt-1.5 border-t border-border/50 space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-1.5">
                  <Input
                    value={newDictWord}
                    onChange={(e) => setNewDictWord(e.target.value)}
                    placeholder={isMy ? "စကားလုံး (ဥပမာ - GlowSkin)" : "Word (e.g. GlowSkin)"}
                    className="h-8 text-xs bg-background/80"
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
                    placeholder={isMy ? "မြန်မာအသံထွက် (ဥပမာ - ဂလိုးစကင်း)" : "Burmese Phonetic (e.g. ဂလိုးစကင်း)"}
                    className="h-8 text-xs font-myanmar bg-background/80"
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
                    className="h-8 px-3 text-xs shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    {isMy ? "ထည့်မည်" : "Add"}
                  </Button>
                </div>

                {customPronunciations.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {customPronunciations.map((entry) => (
                      <span
                        key={entry.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 text-[11px]"
                      >
                        <span className="font-medium">{entry.word}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-myanmar text-indigo-700 dark:text-indigo-300">
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
                  <p className="text-[11px] text-muted-foreground font-myanmar">
                    {isMy
                      ? "အမှတ်တံဆိပ်အမည်များ သို့မဟုတ် အထူးစကားလုံးများကို မြန်မာအသံထွက်အဖြစ် သိမ်းဆည်းထားနိုင်ပါသည်။"
                      : "Save brand names or special terms with custom Burmese phonetics—applied automatically before TTS."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Generate Audio CTA (Desktop) */}
          <div className="hidden lg:block">
            <Button
              type="button"
              onClick={handleGenerateVoice}
              disabled={isGeneratingVoice || isMergingVideo || !voiceoverDraftScript.trim()}
              className="w-full h-10 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border-0"
            >
              {isGeneratingVoice ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  {isMy ? "AI အသံဖန်တီးနေသည်..." : "Synthesizing Burmese Voiceover..."}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" aria-hidden="true" />
                  {isMy ? "AI အသံနမူနာ ဖန်တီးမည်" : "Generate Voice Preview"}
                </>
              )}
            </Button>
          </div>

          {/* Audio Preview Player */}
          {voiceoverResult && (
            <div className="rounded-xl border border-border/60 bg-background/80 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground truncate">
                  {voiceoverResult.voiceName}
                </span>
                <span className="shrink-0">
                  {voiceoverResult.durationSeconds.toFixed(1)}s ·{" "}
                  {voiceoverResult.fileExtension.toUpperCase()}
                </span>
              </div>
              <audio controls src={voiceoverResult.audioUrl} className="w-full h-10" />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAudio}
                  className="h-8 px-3 text-xs border-border/60"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {isMy ? "အသံဖိုင် ဒေါင်းလုဒ်" : "Download Audio"} (.{voiceoverResult.fileExtension})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareAudio}
                  className="h-8 px-3 text-xs border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {canShareFiles ? (isMy ? "အသံမျှဝေမည်" : "Share Audio") : (isMy ? "သိမ်းဆည်းမည်" : "Save Audio")}
                </Button>
              </div>
            </div>
          )}

          {/* Optional Video Upload & Merge Section */}
          <div className="space-y-3 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5 font-myanmar">
                <Film className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {isMy
                  ? "ဗီဒီယိုနှင့် ပေါင်းစပ်မည် (Optional)"
                  : "Merge with Video (Optional)"}
              </Label>
              {videoFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearUploadedVideo()
                    revokeMergedUrl()
                    setMergedVideo(null)
                  }}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {isMy ? "ဖယ်ရှားမည်" : "Remove"}
                </Button>
              )}
            </div>

            {!videoFile ? (
              <div className="relative rounded-xl border-2 border-dashed border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-indigo-500/50 p-4 text-center transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv"
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  onChange={(e) => {
                    handleSelectVideoFile(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
                <div className="flex items-center justify-center gap-2.5 pointer-events-none">
                  <Upload className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium text-muted-foreground font-myanmar">
                    {isMy
                      ? "အသံနှင့်ပေါင်းစပ်ရန် ဗီဒီယိုဖိုင် ရွေးချယ်ပါ (MP4, MOV)"
                      : "Tap to upload a video (MP4, MOV, WebM) to merge voiceover"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
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
                    className="w-full max-h-[160px] rounded-lg bg-black/90 object-contain"
                  />
                )}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium truncate">{videoFile.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {videoDuration !== null && (
                      <Badge variant="outline" className="text-[11px]">
                        {videoDuration.toFixed(1)}s
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[11px]">
                      {formatFileSize(videoFile.size)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Compact Video Export Options (Pills) */}
            <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/15 p-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEnableSubtitles((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer font-myanmar ${
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    enableWatermark && brandSignature.trim()
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate max-w-[160px]">
                    {brandSignature.trim()
                      ? `Watermark: ${brandSignature.trim()}`
                      : isMy
                        ? "Brand Watermark (မရှိသေးပါ)"
                        : "Brand Watermark"}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-border/50">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 font-myanmar">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    {isMy ? "အချိန်ကိုက်ညှိမှု (Duration Sync)" : "Duration Sync"}
                  </Label>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setDurationSyncMode("loop_video")}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors text-left cursor-pointer font-myanmar ${
                        durationSyncMode === "loop_video"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div className="truncate font-semibold">
                        {isMy ? "အသံဆုံးထိ ပြန်ကျော့" : "Loop Video"}
                      </div>
                      <div className="text-[10px] opacity-80 truncate">
                        {isMy ? "အသံမပြတ်စေရန်" : "Match voice"}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurationSyncMode("fit_video")}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors text-left cursor-pointer font-myanmar ${
                        durationSyncMode === "fit_video"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div className="truncate font-semibold flex items-center gap-1">
                        <Scissors className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        {isMy ? "ဗီဒီယိုအတိုင်း ဖြတ်" : "Fit Video"}
                      </div>
                      <div className="text-[10px] opacity-80 truncate">
                        {isMy ? "မူရင်းအရှည်" : "Stop at video end"}
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
                          title={isMy ? opt.labelMy : opt.label}
                          className={`rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors truncate cursor-pointer ${
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
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onClick={handleMergeVideo}
                disabled={!voiceoverResult || !videoFile || isMergingVideo || isGeneratingVoice}
                className="flex-1 h-10 text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 disabled:opacity-50"
              >
                {isMergingVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
                    Merging Audio &amp; Video... {mergeProgress}%
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    {isMy ? "ဗီဒီယိုနှင့် ပေါင်းစပ်ပြီး ဒေါင်းလုဒ်ဆွဲမည်" : "Merge into Video & Download"}
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
                  <span>Merging Audio &amp; Video...</span>
                  <span className="font-semibold text-foreground">{mergeProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-150"
                    style={{ width: `${mergeProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Bottom Thumb-Zone Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-md px-3 py-2.5 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Button
            type="button"
            onClick={handleGenerateVoice}
            disabled={isGeneratingVoice || isMergingVideo || !voiceoverDraftScript.trim()}
            className="flex-1 min-h-[44px] text-xs font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border-0 font-myanmar"
          >
            {isGeneratingVoice ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
                {isMy ? "ဖန်တီးနေသည်..." : "Generating..."}
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {isMy ? "AI အသံဖန်တီးမည်" : "Generate Voice"}
              </>
            )}
          </Button>
          {voiceoverResult && videoFile && (
            <Button
              type="button"
              onClick={handleMergeVideo}
              disabled={isMergingVideo || isGeneratingVoice}
              className="min-h-[44px] px-3.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-myanmar"
            >
              <Film className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isMy ? "ပေါင်းစပ်မည်" : "Merge"}
            </Button>
          )}
          {mergedVideo && (
            <Button
              type="button"
              variant="outline"
              onClick={handleShareVideo}
              className="min-h-[44px] px-3 text-xs font-semibold border-emerald-500/40"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

