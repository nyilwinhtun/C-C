"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Clock,
  Film,
  Loader2,
  Mic,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import {
  BURMESE_VOICE_PRESETS,
  VOICEOVER_SPEEDS,
  cleanVoiceoverText,
  estimateSpokenDurationSeconds,
  generateBurmeseVoiceover,
  type BurmeseVoiceType,
  type VoiceoverResult,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import {
  mergeVideoWithVoiceover,
  revokeBlobUrlAfterDelay,
  type MergeVideoAudioResult,
  type OriginalAudioVolume,
} from "@/lib/videoAudioMerger"
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
import { IosAudioPlayer } from "@/components/shared/IosAudioPlayer"
import { Textarea } from "@/components/ui/textarea"

interface VoiceoverStudioCardProps {
  voiceoverScript: string
  videoFile: File | null
  language: "en" | "my"
}

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

export function VoiceoverStudioCard({
  voiceoverScript,
  videoFile,
  language,
}: VoiceoverStudioCardProps) {
  const [editableScript, setEditableScript] = useState(() =>
    cleanVoiceoverText(voiceoverScript)
  )
  const [voiceType, setVoiceType] = useState<BurmeseVoiceType>("female")
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [originalVolume, setOriginalVolume] = useState<OriginalAudioVolume>(0.15)

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
      revokeBlobUrlAfterDelay(mergedUrlRef.current)
      mergedUrlRef.current = null
    }
  }, [])

  // Sync clean script whenever a new voiceover script is generated
  useEffect(() => {
    setEditableScript(cleanVoiceoverText(voiceoverScript))
    revokeVoiceUrl()
    revokeMergedUrl()
    setVoiceoverResult(null)
    setMergedVideo(null)
  }, [voiceoverScript, revokeVoiceUrl, revokeMergedUrl])

  // Cleanup object URLs & active merge on unmount
  useEffect(() => {
    return () => {
      mergeAbortRef.current?.abort()
      revokeVoiceUrl()
      revokeMergedUrl()
    }
  }, [revokeVoiceUrl, revokeMergedUrl])

  const handleGenerateVoice = async () => {
    const trimmed = editableScript.trim()
    if (!trimmed) {
      toast.error(
        language === "my"
          ? "အသံသွင်းရန် စာသားထည့်ပါ။"
          : "Please enter voiceover text before generating."
      )
      return
    }

    setIsGeneratingVoice(true)
    try {
      const result = await generateBurmeseVoiceover(trimmed, voiceType, speed)
      revokeVoiceUrl()
      revokeMergedUrl()
      voiceUrlRef.current = result.audioUrl
      setVoiceoverResult(result)
      setMergedVideo(null)
      toast.success(
        language === "my"
          ? "အသံနမူနာ ဖန်တီးပြီးပါပြီ။"
          : "Burmese voiceover generated!"
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

  const handleMergeVideo = async () => {
    if (!videoFile) {
      toast.error(
        language === "my"
          ? "ဗီဒီယိုဖိုင် မရှိသေးပါ။ အပေါ်တွင် ဗီဒီယိုပြန်တင်ပေးပါ။"
          : "No video file loaded. Please upload a video above first."
      )
      return
    }
    if (!voiceoverResult) {
      toast.error(
        language === "my"
          ? "အရင်ဆုံး Voiceover အသံဖန်တီးပါ။"
          : "Generate the voice preview first."
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
        language === "my"
          ? "အသံနှင့် ဗီဒီယို ပေါင်းစပ်ပြီး ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။"
          : "Video & voiceover merged and downloaded!"
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
          title: "Burmese Voiceover Video",
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        toast.error("Could not open share sheet. Use Download instead.")
      }
      return
    }

    // Fallback to direct download if Web Share API with files is unsupported
    triggerBlobDownload(mergedVideo.videoUrl, filename)
    toast.info("Direct sharing is not supported on this browser; downloading video instead.")
  }

  const canShareFiles =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  return (
    <Card className="border-[#E7E5E4] dark:border-[#3F3F46] bg-card overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{language === "my" ? "အသံသွင်းခန်းနှင့် ဗီဒီယိုပေါင်းစပ်စတူဒီယို" : "Recording Booth & Video Merge"}</span>
          </CardTitle>
          <CardDescription className="text-[11px] mt-0.5 font-myanmar">
            {language === "my"
              ? "မြန်မာအသံသွင်းပြီး ဗီဒီယိုနှင့် တိုက်ရိုက်ပေါင်းစပ်ထုတ်ယူပါ"
              : "Record Burmese narration and merge directly into your video"}
          </CardDescription>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          100% On-Device
        </Badge>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 space-y-3.5">
        {/* Editable clean voiceover text */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor="voiceover-studio-text"
                className="text-xs font-medium text-muted-foreground font-myanmar"
              >
                {language === "my"
                  ? "အသံဖတ်မည့် စာသား (ပြင်ဆင်နိုင်သည်)"
                  : "Spoken Burmese Script (Editable)"}
              </Label>
              {editableScript.trim() && (
                <Badge
                  variant="outline"
                  className="text-[11px] font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-myanmar"
                >
                  <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                  {language === "my"
                    ? `ခန့်မှန်းကြာချိန်: ~${estimateSpokenDurationSeconds(editableScript, speed)} စက္ကန့်`
                    : `Est. duration: ~${estimateSpokenDurationSeconds(editableScript, speed)}s`}
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditableScript(cleanVoiceoverText(voiceoverScript))}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Reset
            </button>
          </div>
          <Textarea
            id="voiceover-studio-text"
            value={editableScript}
            onChange={(e) => setEditableScript(e.target.value)}
            rows={4}
            placeholder="မြန်မာအသံသွင်းစာသား..."
            className="text-sm font-myanmar leading-relaxed resize-y bg-background/80 border-border/60"
          />
        </div>

        {/* Controls: Voice, Speed, Original Audio Volume */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Voice selector */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Mic className="h-3 w-3" aria-hidden="true" />
              Voice
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
                    className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                      active
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-[11px] font-semibold leading-tight font-myanmar">
                      {language === "my"
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

          {/* Speed pills */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Speed
            </Label>
            <div className="grid grid-cols-4 gap-1">
              {VOICEOVER_SPEEDS.map((option) => {
                const active = speed === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSpeed(option)}
                    className={`rounded-lg border py-2 text-[11px] font-semibold transition-colors ${
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

          {/* Original Video Audio Volume pills */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              {originalVolume === 0 ? (
                <VolumeX className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Volume2 className="h-3 w-3" aria-hidden="true" />
              )}
              Original Audio
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {VOLUME_OPTIONS.map((opt) => {
                const active = originalVolume === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOriginalVolume(opt.value)}
                    title={language === "my" ? opt.labelMy : opt.label}
                    className={`rounded-lg border px-1 py-2 text-[10px] font-semibold transition-colors truncate ${
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

        {/* Step 1: Generate Voice Preview */}
        <div className="space-y-2.5 pt-1">
          <Button
            type="button"
            onClick={handleGenerateVoice}
            disabled={isGeneratingVoice || isMergingVideo || !editableScript.trim()}
            className="w-full h-9 text-xs font-semibold"
          >
            {isGeneratingVoice ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                {language === "my" ? "အသံဖိုင် ပြင်ဆင်နေပါသည်..." : "Preparing audio..."}
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                1. Generate Voice Preview
              </>
            )}
          </Button>

          {voiceoverResult && (
            <IosAudioPlayer
              src={voiceoverResult.audioUrl}
              title={voiceoverResult.voiceName}
              subtitle={`${voiceoverResult.durationSeconds.toFixed(1)}s`}
              initialDuration={voiceoverResult.durationSeconds}
              fileExtension={voiceoverResult.fileExtension}
              onDownload={handleDownloadAudio}
              downloadLabel={`Download (.${voiceoverResult.fileExtension})`}
              compact
              accentColor="blue"
            />
          )}
        </div>

        {/* Step 2: Merge into Video & Download + Share */}
        <div className="space-y-2 pt-1 border-t border-border/50">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={handleMergeVideo}
              disabled={!voiceoverResult || !videoFile || isMergingVideo || isGeneratingVoice}
              className="flex-1 h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 disabled:opacity-50"
            >
              {isMergingVideo ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                  Merging Audio &amp; Video... {mergeProgress}%
                </>
              ) : (
                <>
                  <Film className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  2. Merge into Video &amp; Download
                </>
              )}
            </Button>

            {mergedVideo && (
              <Button
                type="button"
                variant="outline"
                onClick={handleShareVideo}
                className="h-9 px-3 text-xs font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              >
                <Share2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {canShareFiles ? "Share Video" : "Download Again"}
              </Button>
            )}
          </div>

          {!videoFile && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-myanmar">
              {language === "my"
                ? "ဗီဒီယိုနှင့် ပေါင်းစပ်ရန် အပေါ်တွင် ဗီဒီယိုဖိုင်တစ်ခု တင်ပေးပါ။"
                : "Upload a video file above to enable Step 2 (Merge into Video)."}
            </p>
          )}

          {isMergingVideo && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Merging Audio &amp; Video...</span>
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
  )
}

