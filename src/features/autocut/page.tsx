"use client"

import { useEffect, useRef, useState } from "react"
import {
  Download,
  Film,
  Loader2,
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
  exportAutoCutVideo,
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

const THRESHOLD_OPTIONS = [
  { db: -42, label: "Gentle (-42dB)", labelMy: "အသံတိုး (-42dB)" },
  { db: -35, label: "Balanced (-35dB)", labelMy: "ပုံမှန် (-35dB)" },
  { db: -28, label: "Strict (-28dB)", labelMy: "တင်းကျပ် (-28dB)" },
] as const

const MIN_SILENCE_OPTIONS = [0.4, 0.6, 0.8, 1.0] as const

function formatSec(sec: number): string {
  return `${Math.max(0, Math.round(sec * 10) / 10)}s`
}

export function AutoCutPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null)

  const [thresholdDb, setThresholdDb] = useState<number>(-35)
  const [minSilenceSeconds, setMinSilenceSeconds] = useState<number>(0.6)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<VideoSilenceAnalysis | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportedResult, setExportedResult] = useState<MergeVideoAudioResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const exportUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current)
    }
  }, [])

  const runAnalysis = async (file: File, db: number, minSil: number) => {
    setIsAnalyzing(true)
    try {
      const result = await analyzeVideoSilence(file, {
        thresholdDb: db,
        minSilenceSeconds: minSil,
        paddingSeconds: 0.08,
      })
      setAnalysis(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not analyze video audio."
      toast.error(msg)
      setAnalysis(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!isSupportedVideoFile(file)) {
      toast.error(
        isMy
          ? "ကျေးဇူးပြု၍ MP4, MOV, WebM ဗီဒီယိုဖိုင်ကိုသာ ရွေးချယ်ပါ"
          : "Please select a supported video file (MP4, MOV, WebM)."
      )
      return
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }

    const url = URL.createObjectURL(file)
    sourceUrlRef.current = url
    setVideoFile(file)
    setSourcePreviewUrl(url)
    setExportedResult(null)
    await runAnalysis(file, thresholdDb, minSilenceSeconds)
  }

  const handleSettingsChange = (nextDb: number, nextMinSil: number) => {
    setThresholdDb(nextDb)
    setMinSilenceSeconds(nextMinSil)
    if (videoFile) {
      void runAnalysis(videoFile, nextDb, nextMinSil)
    }
  }

  const handleExport = async () => {
    if (!videoFile || !analysis) return
    if (analysis.keepSegments.length === 0) {
      toast.error(
        isMy
          ? "စကားပြောအပိုင်း မတွေ့ရှိပါ။ Threshold ကို လျှော့ကြည့်ပါ။"
          : "No speech segments detected. Try a gentler threshold."
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

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await exportAutoCutVideo({
        videoFile,
        analysis,
        onProgress: (pct) => setExportProgress(pct),
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
      abortRef.current = null
    }
  }

  const handleDownload = () => {
    if (!exportedResult) return
    const baseName = videoFile?.name.replace(/\.[^.]+$/, "") || "autocut-video"
    const a = document.createElement("a")
    a.href = exportedResult.videoUrl
    a.download = `${baseName}-autocut.${exportedResult.fileExtension}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleShare = async () => {
    if (!exportedResult) return
    const baseName = videoFile?.name.replace(/\.[^.]+$/, "") || "autocut-video"
    const file = new File(
      [exportedResult.blob],
      `${baseName}-autocut.${exportedResult.fileExtension}`,
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

  const handleReset = () => {
    abortRef.current?.abort()
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = null
    }
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setVideoFile(null)
    setSourcePreviewUrl(null)
    setAnalysis(null)
    setExportedResult(null)
    setExportProgress(0)
  }

  const origSec = analysis ? Math.round(analysis.originalDuration) : 0
  const keptSec = analysis ? Math.round(analysis.keptDuration) : 0
  const trimmedSec = analysis ? Math.max(0, Math.round(analysis.trimmedSeconds)) : 0

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
                  ? "စကားပြောဗီဒီယိုထဲမှ အသံတိတ်နေသော Dead Air အပိုင်းများကို အလိုအလျောက် ဖြတ်ထုတ်ပေးပါမည်။"
                  : "Automatically detect and cut silent dead-air pauses from talking-head videos."}
              </CardDescription>
            </div>
            {videoFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isExporting}
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-destructive gap-1 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isMy ? "ဖယ်ရှားမည်" : "Reset"}</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            className="hidden"
            onChange={handleVideoSelected}
          />

          {!videoFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors p-8 flex flex-col items-center justify-center gap-2 text-center"
            >
              <div className="h-11 w-11 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center">
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">
                {isMy ? "စကားပြောဗီဒီယို တင်ရန် နှိပ်ပါ" : "Tap to upload talking-head video"}
              </div>
              <div className="text-xs text-muted-foreground">
                MP4, MOV, WebM
              </div>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Source Video Preview */}
              {sourcePreviewUrl && (
                <div className="rounded-lg overflow-hidden border border-border/60 bg-black">
                  <video
                    controls
                    src={sourcePreviewUrl}
                    className="w-full max-h-[260px] object-contain mx-auto"
                  />
                </div>
              )}

              {/* Configurable Threshold & Min Silence */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {isMy ? "အသံတိတ် သတ်မှတ်ချက်" : "Silence Sensitivity"}
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {THRESHOLD_OPTIONS.map((opt) => (
                      <Button
                        key={opt.db}
                        type="button"
                        size="sm"
                        variant={thresholdDb === opt.db ? "default" : "outline"}
                        disabled={isAnalyzing || isExporting}
                        onClick={() => handleSettingsChange(opt.db, minSilenceSeconds)}
                        className="text-[11px] px-2"
                      >
                        {isMy ? opt.labelMy : opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {isMy ? "အနည်းဆုံး အသံတိတ်ကြာချိန်" : "Min Pause to Cut"}
                  </Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MIN_SILENCE_OPTIONS.map((sec) => (
                      <Button
                        key={sec}
                        type="button"
                        size="sm"
                        variant={minSilenceSeconds === sec ? "default" : "outline"}
                        disabled={isAnalyzing || isExporting}
                        onClick={() => handleSettingsChange(thresholdDb, sec)}
                        className="text-xs"
                      >
                        &gt;{sec}s
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Silence Analysis Summary */}
              {isAnalyzing ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  <span>
                    {isMy
                      ? "ဗီဒီယိုအသံလှိုင်းကို စစ်ဆေးနေသည်..."
                      : "Analyzing audio track for dead air..."}
                  </span>
                </div>
              ) : (
                analysis && (
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">
                        {isMy
                          ? `${origSec}s → ${keptSec}s, ${trimmedSec}s အသံတိတ်ဖြတ်မည်`
                          : `${origSec}s → ${keptSec}s (${trimmedSec}s dead air will be trimmed)`}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {analysis.silentSegments.length}{" "}
                        {isMy ? "နေရာ ဖြတ်မည်" : "cuts"}
                      </Badge>
                    </div>

                    {/* Visual Timeline Bar */}
                    <div className="h-3 w-full rounded-full overflow-hidden bg-muted flex">
                      {analysis.timeline.map((seg, idx) => {
                        const widthPct =
                          analysis.originalDuration > 0
                            ? ((seg.end - seg.start) / analysis.originalDuration) * 100
                            : 0
                        return (
                          <div
                            key={idx}
                            title={`${seg.isSilent ? "Cut" : "Keep"}: ${formatSec(seg.start)} - ${formatSec(seg.end)}`}
                            className={
                              seg.isSilent
                                ? "bg-rose-500/60 h-full"
                                : "bg-emerald-500 h-full"
                            }
                            style={{ width: `${widthPct}%` }}
                          />
                        )
                      })}
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
                )
              )}

              {/* Export / Cancel Button */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={!analysis || isAnalyzing || isExporting || trimmedSec === 0}
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
                        ? `Auto-Cut ထုတ်လုပ်နေသည်... ${exportProgress}%`
                        : `Exporting Auto-Cut... ${exportProgress}%`
                      : trimmedSec === 0 && analysis
                        ? isMy
                          ? "ဖြတ်ရန် အသံတိတ်အပိုင်း မရှိပါ"
                          : "No Dead Air Detected"
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

