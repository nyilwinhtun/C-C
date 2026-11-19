"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Download,
  Film,
  Loader2,
  Plus,
  Scissors,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { isSupportedVideoFile } from "@/api/aiService"
import {
  analyzeVideoSilence,
  exportMultiClipAutoCutVideo,
  type AutoCutSensitivityPreset,
  type MergeVideoAudioResult,
  type VideoSilenceAnalysis,
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
import { toast } from "@/components/ui/sonner"
import { useUIStore } from "@/store/useUIStore"

const MAX_CLIPS = 10

interface AutoCutClipItem {
  id: string
  file: File
  previewUrl: string
  thumbnailUrl: string | null
  duration: number | null
  status: "pending" | "analyzing" | "ready" | "error"
  analysis: VideoSilenceAnalysis | null
  error: string | null
}

const SENSITIVITY_PRESETS: Array<{
  id: AutoCutSensitivityPreset
  labelMy: string
  labelEn: string
  pauseHint: string
}> = [
  {
    id: "light",
    labelMy: "နည်းနည်း (Light)",
    labelEn: "Light",
    pauseHint: "> 1.0s",
  },
  {
    id: "balanced",
    labelMy: "ပုံမှန် (Balanced)",
    labelEn: "Balanced",
    pauseHint: "> 0.6s",
  },
  {
    id: "snappy",
    labelMy: "အပြတ် (Snappy)",
    labelEn: "Snappy",
    pauseHint: "> 0.35s",
  },
]

function formatSec(sec: number): string {
  return `${Math.max(0, Math.round(sec * 10) / 10)}s`
}

async function captureVideoMetadataAndThumb(
  objectUrl: string
): Promise<{ duration: number | null; thumbnailUrl: string | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.src = objectUrl
    video.muted = true
    video.playsInline = true
    video.preload = "metadata"

    let settled = false
    const finish = (duration: number | null, thumbnailUrl: string | null) => {
      if (settled) return
      settled = true
      video.removeAttribute("src")
      video.load()
      resolve({ duration, thumbnailUrl })
    }

    const timeout = setTimeout(() => finish(null, null), 4000)

    video.addEventListener(
      "loadedmetadata",
      () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null
        const targetTime = dur ? Math.min(0.25, dur * 0.1) : 0
        const onSeeked = () => {
          clearTimeout(timeout)
          try {
            const w = video.videoWidth || 160
            const h = video.videoHeight || 160
            const scale = Math.min(1, 160 / Math.max(w, h))
            const canvas = document.createElement("canvas")
            canvas.width = Math.max(2, Math.round(w * scale))
            canvas.height = Math.max(2, Math.round(h * scale))
            const ctx = canvas.getContext("2d")
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              finish(dur, canvas.toDataURL("image/jpeg", 0.7))
              return
            }
          } catch {
            // Ignore thumbnail errors
          }
          finish(dur, null)
        }
        video.addEventListener("seeked", onSeeked, { once: true })
        video.currentTime = targetTime
      },
      { once: true }
    )

    video.addEventListener(
      "error",
      () => {
        clearTimeout(timeout)
        finish(null, null)
      },
      { once: true }
    )
  })
}

export function AutoCutPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const [clips, setClips] = useState<AutoCutClipItem[]>([])
  const [preset, setPreset] = useState<AutoCutSensitivityPreset>("balanced")
  const [isAnalyzingQueue, setIsAnalyzingQueue] = useState(false)

  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportingClipIndex, setExportingClipIndex] = useState<number | null>(null)
  const [exportedResult, setExportedResult] = useState<MergeVideoAudioResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const exportUrlRef = useRef<string | null>(null)
  const analysisRunIdRef = useRef(0)
  const clipsRef = useRef<AutoCutClipItem[]>([])

  useEffect(() => {
    clipsRef.current = clips
  }, [clips])

  useEffect(() => {
    return () => {
      analysisRunIdRef.current += 1
      abortRef.current?.abort()
      for (const clip of clipsRef.current) {
        URL.revokeObjectURL(clip.previewUrl)
      }
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current)
    }
  }, [])

  const analyzeClipsSequentially = async (
    targetClips: AutoCutClipItem[],
    activePreset: AutoCutSensitivityPreset
  ) => {
    const runId = ++analysisRunIdRef.current
    setIsAnalyzingQueue(true)

    try {
      for (const clip of targetClips) {
        if (analysisRunIdRef.current !== runId) return
        // Skip if clip was removed
        if (!clipsRef.current.some((c) => c.id === clip.id)) continue

        setClips((prev) =>
          prev.map((c) => (c.id === clip.id ? { ...c, status: "analyzing", error: null } : c))
        )

        try {
          const analysis = await analyzeVideoSilence(clip.file, {
            preset: activePreset,
            preRollSeconds: 0.2,
            postRollSeconds: 0.2,
            mergeGapSeconds: 0.25,
          })
          if (analysisRunIdRef.current !== runId) return

          setClips((prev) =>
            prev.map((c) =>
              c.id === clip.id
                ? {
                    ...c,
                    status: "ready",
                    duration: c.duration ?? analysis.originalDuration,
                    analysis,
                    error: null,
                  }
                : c
            )
          )
        } catch (err) {
          if (analysisRunIdRef.current !== runId) return
          const msg = err instanceof Error ? err.message : "Could not analyze clip audio."
          setClips((prev) =>
            prev.map((c) =>
              c.id === clip.id ? { ...c, status: "error", analysis: null, error: msg } : c
            )
          )
        }
      }
    } finally {
      if (analysisRunIdRef.current === runId) {
        setIsAnalyzingQueue(false)
      }
    }
  }

  const handleVideosSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (selectedFiles.length === 0) return

    const validFiles = selectedFiles.filter((f) => isSupportedVideoFile(f))
    if (validFiles.length < selectedFiles.length) {
      toast.error(
        isMy
          ? "MP4, MOV, WebM ဗီဒီယိုဖိုင်များကိုသာ ရွေးချယ်ပါ"
          : "Some files were skipped. Only MP4, MOV, and WebM are supported."
      )
    }
    if (validFiles.length === 0) return

    const remainingSlots = MAX_CLIPS - clips.length
    if (remainingSlots <= 0) {
      toast.error(
        isMy
          ? `ဗီဒီယိုအများဆုံး ${MAX_CLIPS} ခုအထိသာ ထည့်သွင်းနိုင်ပါသည်`
          : `You can upload up to ${MAX_CLIPS} clips at once.`
      )
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    if (validFiles.length > remainingSlots) {
      toast.info(
        isMy
          ? `အများဆုံး ${MAX_CLIPS} ခုသာ ထည့်နိုင်သဖြင့် ပထမ ${remainingSlots} ခုကို ထည့်လိုက်ပါသည်`
          : `Added ${remainingSlots} clips (max ${MAX_CLIPS} clips allowed).`
      )
    }

    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setExportedResult(null)

    const newItems: AutoCutClipItem[] = filesToAdd.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      thumbnailUrl: null,
      duration: null,
      status: "pending",
      analysis: null,
      error: null,
    }))

    const updatedClips = [...clips, ...newItems]
    setClips(updatedClips)

    // Extract thumbnails & durations in background without blocking analysis
    for (const item of newItems) {
      void captureVideoMetadataAndThumb(item.previewUrl).then(({ duration, thumbnailUrl }) => {
        setClips((prev) =>
          prev.map((c) =>
            c.id === item.id
              ? {
                  ...c,
                  duration: c.duration ?? duration,
                  thumbnailUrl: thumbnailUrl ?? c.thumbnailUrl,
                }
              : c
          )
        )
      })
    }

    // Analyze newly added clips (or re-run pending ones) sequentially
    const pendingOrNew = updatedClips.filter((c) => c.status !== "ready" || newItems.some((n) => n.id === c.id))
    await analyzeClipsSequentially(pendingOrNew, preset)
  }

  const handlePresetChange = (nextPreset: AutoCutSensitivityPreset) => {
    if (nextPreset === preset) return
    setPreset(nextPreset)
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setExportedResult(null)
    if (clips.length > 0) {
      setClips((prev) => prev.map((c) => ({ ...c, status: "pending" })))
      void analyzeClipsSequentially(clips, nextPreset)
    }
  }

  const handleMoveClip = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= clips.length) return
    setClips((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
    setExportedResult(null)
  }

  const handleRemoveClip = (id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((c) => c.id !== id)
    })
    setExportedResult(null)
  }

  const handleReset = () => {
    analysisRunIdRef.current += 1
    abortRef.current?.abort()
    for (const clip of clips) {
      URL.revokeObjectURL(clip.previewUrl)
    }
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setClips([])
    setIsAnalyzingQueue(false)
    setExportedResult(null)
    setExportProgress(0)
    setExportingClipIndex(null)
  }

  const handleExport = async () => {
    const readyClips = clips.filter((c) => c.status === "ready" && c.analysis)
    if (readyClips.length === 0) return

    const hasSpeech = readyClips.some((c) => (c.analysis?.keepSegments.length ?? 0) > 0)
    if (!hasSpeech) {
      toast.error(
        isMy
          ? "စကားပြောအပိုင်း မတွေ့ရှိပါ။ Sensitivity ကို နည်းနည်း (Light) သို့ ပြောင်းကြည့်ပါ။"
          : "No speech segments detected. Try the Light sensitivity preset."
      )
      return
    }

    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setExportedResult(null)
    setIsExporting(true)
    setExportProgress(0)
    setExportingClipIndex(0)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await exportMultiClipAutoCutVideo({
        clips: readyClips.map((c) => ({
          videoFile: c.file,
          analysis: c.analysis!,
        })),
        onProgress: (pct, clipIdx) => {
          setExportProgress(pct)
          if (typeof clipIdx === "number") {
            setExportingClipIndex(clipIdx)
          }
        },
        signal: controller.signal,
      })
      exportUrlRef.current = result.videoUrl
      setExportedResult(result)
      toast.success(
        isMy
          ? "အသံတိတ်အပိုင်းများ ဖြတ်တောက်ပြီး ဗီဒီယိုထုတ်ပြီးပါပြီ!"
          : "Auto-Cut video exported!"
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info(isMy ? "ဗီဒီယိုထုတ်လုပ်မှုကို ပယ်ဖျက်လိုက်ပါပြီ" : "Export cancelled.")
      } else {
        const msg = err instanceof Error ? err.message : "Failed to export Auto-Cut video."
        toast.error(msg)
      }
    } finally {
      setIsExporting(false)
      setExportingClipIndex(null)
      abortRef.current = null
    }
  }

  const getExportFilename = (ext: string) => {
    if (clips.length === 1) {
      const baseName = clips[0].file.name.replace(/\.[^.]+$/, "") || "autocut-video"
      return `${baseName}-autocut.${ext}`
    }
    return `stitched-autocut-${clips.length}clips.${ext}`
  }

  const handleDownload = () => {
    if (!exportedResult) return
    const a = document.createElement("a")
    a.href = exportedResult.videoUrl
    a.download = getExportFilename(exportedResult.fileExtension)
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleShare = async () => {
    if (!exportedResult) return
    const file = new File(
      [exportedResult.blob],
      getExportFilename(exportedResult.fileExtension),
      { type: exportedResult.mimeType }
    )

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Auto-Cut Video",
        })
        return
      } catch {
        // User cancelled or share failed; fall through to download
      }
    }
    handleDownload()
    toast.info(
      isMy
        ? "တိုက်ရိုက် Share မရနိုင်သဖြင့် ဗီဒီယိုကို ဒေါင်းလုဒ်လုပ်ပေးထားပါသည်"
        : "Direct file share unavailable — downloaded video instead."
    )
  }

  const readyClips = clips.filter((c) => c.status === "ready" && c.analysis)
  const totalOrigSec = Math.round(
    readyClips.reduce((sum, c) => sum + (c.analysis?.originalDuration ?? 0), 0)
  )
  const totalKeptSec = Math.round(
    readyClips.reduce((sum, c) => sum + (c.analysis?.keptDuration ?? 0), 0)
  )
  const totalTrimmedSec = Math.max(0, totalOrigSec - totalKeptSec)
  const totalCuts = readyClips.reduce(
    (sum, c) => sum + (c.analysis?.silentSegments.length ?? 0),
    0
  )
  const hasAnySpeech = readyClips.some((c) => (c.analysis?.keepSegments.length ?? 0) > 0)
  const allReady = clips.length > 0 && clips.every((c) => c.status === "ready" || c.status === "error")

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Scissors className="h-5 w-5 text-violet-500 shrink-0" />
                <span>{isMy ? "ဗီဒီယို Auto-Cut (အသံတိတ်ဖြတ်စက်)" : "Smart Video Auto-Cut"}</span>
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                {isMy
                  ? "ဗီဒီယို ၁ ခုမှ ၁၀ ခုအထိ တစ်ပြိုင်နက်တင်ပြီး အသံတိတ်အပိုင်းများကို ဖြတ်ကာ တစ်ဆက်တည်း ပေါင်းထုတ်ပေးပါမည်။"
                  : "Upload 1–10 clips, trim silent pauses with 0.2s voice padding, and stitch into one smooth video."}
              </CardDescription>
            </div>
            {clips.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isExporting}
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-destructive gap-1 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isMy ? "အားလုံးဖျက်မည်" : "Reset"}</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/mp4,video/quicktime,video/webm,video/*"
            className="hidden"
            onChange={handleVideosSelected}
          />

          {clips.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors p-8 flex flex-col items-center justify-center gap-2 text-center"
            >
              <div className="h-11 w-11 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">
                {isMy
                  ? "စကားပြောဗီဒီယိုများ တင်ရန် နှိပ်ပါ (၁ - ၁၀ ခု)"
                  : "Tap to upload video clips (1 to 10 clips)"}
              </div>
              <div className="text-xs text-muted-foreground">
                MP4, MOV, WebM • {isMy ? "0.2s အသံကာကွယ် Padding ပါဝင်သည်" : "Includes 0.2s Burmese-safe voice padding"}
              </div>
            </button>
          ) : (
            <div className="space-y-4">
              {/* 3 Sensitivity Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {isMy ? "အသံတိတ် ဖြတ်တောက်မှု ပုံစံ" : "Sensitivity Preset"}
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {isMy ? "စကားလုံးမပြတ်စေရန် ±0.20s Padding" : "±0.20s voice padding"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SENSITIVITY_PRESETS.map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant={preset === opt.id ? "default" : "outline"}
                      disabled={isAnalyzingQueue || isExporting}
                      onClick={() => handlePresetChange(opt.id)}
                      className="h-auto py-2 px-2 flex flex-col items-center gap-0.5 text-center"
                    >
                      <span className="text-xs font-medium leading-tight">
                        {isMy ? opt.labelMy : opt.labelEn}
                      </span>
                      <span className="text-[10px] opacity-75">{opt.pauseHint}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Multi-Clip Queue Header + Add More */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {isMy
                    ? `ဗီဒီယိုအစီအစဉ် (${clips.length}/${MAX_CLIPS})`
                    : `Clip Queue (${clips.length}/${MAX_CLIPS})`}
                </span>
                {clips.length < MAX_CLIPS && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isExporting}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isMy ? "ဗီဒီယိုထပ်ထည့်မည်" : "Add Clips"}</span>
                  </Button>
                )}
              </div>

              {/* Clip Queue List with Per-Clip Visual Timeline Bar */}
              <div className="space-y-2.5">
                {clips.map((clip, idx) => {
                  const orig = clip.analysis?.originalDuration ?? clip.duration ?? 0
                  const kept = clip.analysis?.keptDuration ?? orig
                  const trimmed = clip.analysis?.trimmedSeconds ?? 0

                  return (
                    <div
                      key={clip.id}
                      className="rounded-lg border border-border/60 bg-muted/15 p-2.5 space-y-2"
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Thumbnail */}
                        <div className="h-12 w-12 rounded-md overflow-hidden bg-black/80 border border-border/50 shrink-0 flex items-center justify-center">
                          {clip.thumbnailUrl ? (
                            <img
                              src={clip.thumbnailUrl}
                              alt={clip.file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Film className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>

                        {/* Clip Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              #{idx + 1}
                            </Badge>
                            <span className="text-xs font-medium truncate">{clip.file.name}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            {clip.status === "analyzing" ? (
                              <span className="inline-flex items-center gap-1 text-violet-500">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {isMy ? "အသံလှိုင်း စစ်ဆေးနေသည်..." : "Analyzing audio..."}
                              </span>
                            ) : clip.status === "pending" ? (
                              <span>{isMy ? "စောင့်ဆိုင်းနေသည်..." : "Queued..."}</span>
                            ) : clip.status === "error" ? (
                              <span className="text-destructive">{clip.error ?? "Analysis error"}</span>
                            ) : (
                              <>
                                <span>
                                  {formatSec(orig)} → <strong className="text-foreground">{formatSec(kept)}</strong>
                                </span>
                                {trimmed > 0.05 && (
                                  <span className="text-rose-500">
                                    (-{formatSec(trimmed)})
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Reorder & Remove Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={idx === 0 || isExporting}
                            onClick={() => handleMoveClip(idx, -1)}
                            className="h-7 w-7"
                            title={isMy ? "အပေါ်သို့ ရွှေ့မည်" : "Move up"}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={idx === clips.length - 1 || isExporting}
                            onClick={() => handleMoveClip(idx, 1)}
                            className="h-7 w-7"
                            title={isMy ? "အောက်သို့ ရွှေ့မည်" : "Move down"}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={isExporting}
                            onClick={() => handleRemoveClip(clip.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title={isMy ? "ဖယ်ရှားမည်" : "Remove"}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Compact Per-Clip Visual Cut Timeline Bar */}
                      {clip.status === "ready" && clip.analysis && (
                        <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
                          {clip.analysis.timeline.map((seg, segIdx) => {
                            const widthPct =
                              clip.analysis!.originalDuration > 0
                                ? ((seg.end - seg.start) / clip.analysis!.originalDuration) * 100
                                : 0
                            return (
                              <div
                                key={segIdx}
                                title={`${seg.isSilent ? "Cut" : "Keep"}: ${formatSec(seg.start)} - ${formatSec(seg.end)}`}
                                className={
                                  seg.isSilent
                                    ? "bg-rose-500/70 h-full"
                                    : "bg-emerald-500 h-full"
                                }
                                style={{ width: `${widthPct}%` }}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Overall Before / After Duration Summary */}
              {readyClips.length > 0 && (
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      {isMy
                        ? `စုစုပေါင်း: ${totalOrigSec}s → ${totalKeptSec}s (${totalTrimmedSec}s အသံတိတ်ဖြတ်မည်)`
                        : `Total: ${totalOrigSec}s → ${totalKeptSec}s (${totalTrimmedSec}s dead air will be trimmed)`}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {totalCuts} {isMy ? "နေရာ ဖြတ်မည်" : "cuts"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {isMy ? "စကားပြောအပိုင်း (Keep)" : "Speech (Keep)"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500/70" />
                      {isMy ? "အသံတိတ်အပိုင်း (Cut)" : "Dead Air (Cut)"}
                    </span>
                  </div>
                </div>
              )}

              {/* Export / Cancel Button */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={!allReady || isAnalyzingQueue || isExporting || !hasAnySpeech}
                  onClick={handleExport}
                  className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>
                    {isExporting
                      ? isMy
                        ? `ဗီဒီယိုထုတ်လုပ်နေသည်${
                            clips.length > 1 && exportingClipIndex !== null
                              ? ` (${exportingClipIndex + 1}/${readyClips.length})`
                              : ""
                          }... ${exportProgress}%`
                        : `Exporting${
                            clips.length > 1 && exportingClipIndex !== null
                              ? ` (${exportingClipIndex + 1}/${readyClips.length})`
                              : ""
                          }... ${exportProgress}%`
                      : isAnalyzingQueue
                        ? isMy
                          ? "အသံလှိုင်း စစ်ဆေးနေသည်..."
                          : "Analyzing clips..."
                        : clips.length > 1
                          ? isMy
                            ? "အသံတိတ်ဖြတ်ပြီး ဗီဒီယိုပေါင်းထုတ်မည်"
                            : "Auto-Cut & Stitch Export"
                          : isMy
                            ? "အသံတိတ်ဖြတ်ပြီး ဗီဒီယိုထုတ်မည်"
                            : "Auto-Cut & Export Video"}
                  </span>
                </Button>

                {isExporting && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => abortRef.current?.abort()}
                    className="gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    <span>{isMy ? "ရပ်မည်" : "Cancel"}</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exported Video Result */}
      {exportedResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Film className="h-4 w-4 text-emerald-500" />
                <span>{isMy ? "Auto-Cut ဗီဒီယို အဆင်သင့်ဖြစ်ပါပြီ" : "Snappy Auto-Cut Video Ready"}</span>
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {formatSec(exportedResult.durationSeconds)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg overflow-hidden border border-border/60 bg-black">
              <video
                controls
                src={exportedResult.videoUrl}
                className="w-full max-h-[300px] object-contain mx-auto"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-4 w-4" />
                <span>{isMy ? "ဒေါင်းလုဒ်လုပ်မည်" : "Download"}</span>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleShare} className="gap-1.5">
                <Share2 className="h-4 w-4" />
                <span>{isMy ? "Share လုပ်မည်" : "Share"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
