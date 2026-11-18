"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  Film,
  FolderOpen,
  Hash,
  LayoutList,
  Loader2,
  Mic,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Type,
  Upload,
  Video,
  X,
  Zap,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import {
  generateVideoContent,
  isSupportedVideoFile,
  type VideoContentResult,
  type VideoPlatformOption,
} from "@/api/aiService"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import {
  DEFAULT_ONLINE_SHOP_CTA_EN,
  DEFAULT_ONLINE_SHOP_CTA_MY,
} from "@/types"
import { t } from "@/locales/translations"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ReadAloudButton } from "@/components/shared/read-aloud-button"
import { VoiceoverStudioCard } from "@/features/generator/VoiceoverStudioCard"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

const VIDEO_PLATFORMS: VideoPlatformOption[] = [
  "TikTok / Reels",
  "Facebook Video",
  "YouTube Shorts",
]

const DIRECT_MODE_LIMIT_BYTES = 15 * 1024 * 1024
const VIDEO_DRAFT_STORAGE_KEY = "cc_last_video_draft"

interface StoredVideoDraft {
  productNote: string
  platform: VideoPlatformOption
  outputLanguage: "en" | "my"
  result: VideoContentResult | null
}

function loadVideoDraft(fallbackLanguage: "en" | "my"): StoredVideoDraft {
  if (typeof window === "undefined") {
    return {
      productNote: "",
      platform: "TikTok / Reels",
      outputLanguage: fallbackLanguage,
      result: null,
    }
  }
  try {
    const raw = window.localStorage.getItem(VIDEO_DRAFT_STORAGE_KEY)
    if (!raw) {
      return {
        productNote: "",
        platform: "TikTok / Reels",
        outputLanguage: fallbackLanguage,
        result: null,
      }
    }
    const parsed = JSON.parse(raw) as Partial<StoredVideoDraft>
    const platform: VideoPlatformOption = VIDEO_PLATFORMS.includes(
      parsed.platform as VideoPlatformOption
    )
      ? (parsed.platform as VideoPlatformOption)
      : "TikTok / Reels"
    const outputLanguage: "en" | "my" =
      parsed.outputLanguage === "en" || parsed.outputLanguage === "my"
        ? parsed.outputLanguage
        : fallbackLanguage
    const productNote = typeof parsed.productNote === "string" ? parsed.productNote : ""
    const result =
      parsed.result && typeof parsed.result === "object"
        ? (parsed.result as VideoContentResult)
        : null

    return {
      productNote,
      platform,
      outputLanguage,
      result,
    }
  } catch {
    return {
      productNote: "",
      platform: "TikTok / Reels",
      outputLanguage: fallbackLanguage,
      result: null,
    }
  }
}

function getCoverTitles(data: VideoContentResult): string[] {
  if (Array.isArray(data.coverTitles) && data.coverTitles.length > 0) {
    return data.coverTitles.filter((item) => item.trim().length > 0)
  }
  return data.coverTitle?.trim() ? [data.coverTitle.trim()] : []
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type VideoOutputTab = "hooks" | "voiceover" | "caption" | "cover"

function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#[^\s#]+/g)].map((match) => match[0].slice(1))
}

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function mapVideoPlatformToVaultPlatform(platform: string): string {
  const lower = platform.toLowerCase()
  if (lower.includes("facebook")) return "facebook"
  if (lower.includes("youtube")) return "youtube"
  return "tiktok"
}

export function VideoToContentSection() {
  const language = useUIStore((state) => state.language)
  const saveToVault = useContentStore((state) => state.saveToVault)
  const brandSignature = useContentStore((state) => state.brandSignature)
  const businessCategory = useContentStore((state) => state.businessCategory)
  const autoAppendShopCta = useContentStore((state) => state.autoAppendShopCta)
  const videoFile = useContentStore((state) => state.uploadedVideoFile)
  const previewUrl = useContentStore((state) => state.videoPreviewUrl)
  const productNote = useContentStore((state) => state.videoProductNote)
  const result = useContentStore((state) => state.generatedVideoResult)
  const setUploadedVideo = useContentStore((state) => state.setUploadedVideo)
  const setProductNote = useContentStore((state) => state.setVideoProductNote)
  const setResult = useContentStore((state) => state.setGeneratedVideoResult)
  const clearUploadedVideo = useContentStore((state) => state.clearUploadedVideo)

  const resultRef = useRef<HTMLDivElement | null>(null)
  const prevLanguageRef = useRef(language)

  const [initialDraft] = useState<StoredVideoDraft>(() => loadVideoDraft(language))

  const [isDragging, setIsDragging] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [platform, setPlatform] = useState<VideoPlatformOption>(initialDraft.platform)
  const [outputLanguage, setOutputLanguage] = useState<"en" | "my">(
    initialDraft.outputLanguage
  )

  const [progressStage, setProgressStage] = useState<"extracting" | "analyzing" | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isInputCollapsed, setIsInputCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<VideoOutputTab>("hooks")
  const [showAllTabs, setShowAllTabs] = useState(false)

  // Hydrate store from localStorage draft once if store is empty
  useEffect(() => {
    const state = useContentStore.getState()
    if (!state.videoProductNote && initialDraft.productNote) {
      setProductNote(initialDraft.productNote)
    }
    if (!state.generatedVideoResult && initialDraft.result) {
      setResult(initialDraft.result)
    }
  }, [initialDraft, setProductNote, setResult])

  useEffect(() => {
    if (prevLanguageRef.current !== language) {
      prevLanguageRef.current = language
      setOutputLanguage(language)
    }
  }, [language])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const payload: StoredVideoDraft = {
        productNote,
        platform,
        outputLanguage,
        result,
      }
      window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore storage quota errors
    }
  }, [productNote, platform, outputLanguage, result])

  const handleSelectFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      if (file.size <= 0) {
        const msg = "Selected file is empty (0 bytes). Please choose a valid video file."
        setErrorMessage(msg)
        toast.error(msg)
        return
      }
      if (file.type && !isSupportedVideoFile(file)) {
        const msg = "Unsupported file format. Please choose a video file (MP4, MOV, WebM)."
        setErrorMessage(msg)
        toast.error(msg)
        return
      }
      const nextPreviewUrl = URL.createObjectURL(file)
      setErrorMessage(null)
      setUploadedVideo(file, nextPreviewUrl)
      setResult(null)
      setIsInputCollapsed(false)
    },
    [setUploadedVideo, setResult]
  )

  const handleClearFile = useCallback(() => {
    clearUploadedVideo()
    setErrorMessage(null)
    setIsInputCollapsed(false)
  }, [clearUploadedVideo])

  const handleResetDraft = useCallback(() => {
    clearUploadedVideo()
    setProductNote("")
    setPlatform("TikTok / Reels")
    setOutputLanguage(language)
    setErrorMessage(null)
    setIsInputCollapsed(false)
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(VIDEO_DRAFT_STORAGE_KEY)
      } catch {
        // Ignore storage errors
      }
    }
  }, [clearUploadedVideo, setProductNote, language])

  const handleGenerate = useCallback(async () => {
    if (!videoFile || progressStage) return
    setErrorMessage(null)
    setProgressStage(
      videoFile.size <= DIRECT_MODE_LIMIT_BYTES ? "analyzing" : "extracting"
    )
    try {
      const generated = await generateVideoContent({
        file: videoFile,
        productNote: productNote.trim() || undefined,
        platform,
        language: outputLanguage,
        brandSignature,
        businessCategory,
        onProgress: (stage) => setProgressStage(stage),
      })
      const ctaText =
        outputLanguage === "en"
          ? DEFAULT_ONLINE_SHOP_CTA_EN
          : DEFAULT_ONLINE_SHOP_CTA_MY
      const finalCaption =
        autoAppendShopCta &&
        generated.caption &&
        !generated.caption.includes(ctaText)
          ? `${generated.caption.trimEnd()}\n\n${ctaText}`
          : generated.caption
      const finalResult: VideoContentResult = {
        ...generated,
        caption: finalCaption,
      }
      setResult(finalResult)
      const defaultTab: VideoOutputTab =
        finalResult.hooks.length > 0
          ? "hooks"
          : finalResult.voiceoverScript
            ? "voiceover"
            : finalResult.caption
              ? "caption"
              : "cover"
      setActiveTab(defaultTab)
      setShowAllTabs(false)
      toast.success(t(language, "generator.videoSuccess"))
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setIsInputCollapsed(true)
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t(language, "generator.videoError")
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setProgressStage(null)
    }
  }, [videoFile, progressStage, productNote, platform, outputLanguage, brandSignature, businessCategory, autoAppendShopCta, language])

  const copyText = useCallback(
    async (key: string, text: string) => {
      if (!text.trim()) return
      try {
        await navigator.clipboard.writeText(text)
        setCopiedKey(key)
        toast.success(t(language, "generator.copySuccess"))
        window.setTimeout(() => {
          setCopiedKey((curr) => (curr === key ? null : curr))
        }, 1600)
      } catch {
        toast.error(t(language, "generator.copyError"))
      }
    },
    [language]
  )

  const formatAllContent = useCallback(
    (data: VideoContentResult): string => {
      const hooksBlock = data.hooks
        .map((hook, idx) => `${idx + 1}. ${hook}`)
        .join("\n")
      const covers = getCoverTitles(data)
      const coverBlock =
        covers.length > 1
          ? covers.map((title, idx) => `${idx + 1}. ${title}`).join("\n")
          : covers[0] ?? ""
      return [
        `[${t(language, "generator.videoCoverTitle")}]\n${coverBlock}`,
        `[${t(language, "generator.videoHooksTitle")}]\n${hooksBlock}`,
        `[${t(language, "generator.videoVoiceoverTitle")}]\n${data.voiceoverScript}`,
        `[${t(language, "generator.videoCaptionTitle")}]\n${data.caption}`,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n")
    },
    [language]
  )

  const handleSaveToVault = useCallback(() => {
    if (!result) return
    const combined = formatAllContent(result)
    const tags = Array.from(new Set([...extractHashtags(result.caption), "video-script"]))
    saveToVault({
      title: result.coverTitle || productNote.trim() || videoFile?.name || "Video Script",
      content: combined,
      platform: mapVideoPlatformToVaultPlatform(platform),
      tags,
    })
    toast.success(t(language, "generator.videoSavedVault"))
  }, [result, formatAllContent, saveToVault, productNote, videoFile, platform, language])

  const handleScheduleToCalendar = useCallback(() => {
    if (!result) return
    const combined = formatAllContent(result)
    const todayIso = getTodayIsoDate()
    const tags = Array.from(new Set([...extractHashtags(result.caption), "video-script"]))
    saveToVault({
      title: result.coverTitle || productNote.trim() || videoFile?.name || "Video Script",
      content: combined,
      platform: mapVideoPlatformToVaultPlatform(platform),
      tags,
      status: "scheduled",
      scheduledDate: todayIso,
    })
    toast.success(
      language === "my"
        ? `ယနေ့ (${todayIso}) ပြက္ခဒိန်တွင် စီစဉ်ပြီးပါပြီ`
        : `Scheduled to Calendar for Today (${todayIso})`
    )
  }, [result, formatAllContent, saveToVault, productNote, videoFile, platform, language])

  const isGenerating = progressStage !== null
  const isDirectMode = videoFile ? videoFile.size <= DIRECT_MODE_LIMIT_BYTES : true
  const hasDraft = Boolean(
    videoFile ||
      productNote.trim() ||
      result ||
      platform !== "TikTok / Reels"
  )
  const coverTitles = result ? getCoverTitles(result) : []

  const outputTabs: Array<{
    id: VideoOutputTab
    label: string
    icon: typeof Zap
  }> = [
    { id: "hooks", label: t(language, "generator.videoTabHooks"), icon: Zap },
    { id: "voiceover", label: t(language, "generator.videoTabVoiceover"), icon: Mic },
    { id: "caption", label: t(language, "generator.videoTabCaption"), icon: Hash },
    { id: "cover", label: t(language, "generator.videoTabCover"), icon: Type },
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
      <div className="w-full flex-1 min-w-0">
        {isInputCollapsed && result && (
          <div className="lg:hidden flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Video className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span className="text-xs font-medium truncate">
                {videoFile?.name || productNote || t(language, "generator.modeVideo")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInputCollapsed(false)}
              className="h-7 px-2.5 text-xs shrink-0 border-border/60 font-myanmar"
            >
              <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
              {t(language, "generator.edit")}
            </Button>
          </div>
        )}

        <Card
          className={
            isInputCollapsed && result
              ? "hidden lg:block border-border/60 shadow-sm"
              : "border-border/60 shadow-sm"
          }
        >
          <CardHeader className="py-3 px-4 sm:py-4 sm:px-5 border-b border-border/60 flex flex-row items-start justify-between gap-3 space-y-0">
            <CardDescription className="text-xs sm:text-sm leading-relaxed">
              {t(language, "generator.videoDesc")}
            </CardDescription>
            {hasDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDraft}
                disabled={isGenerating}
                className="h-7 px-2.5 text-xs shrink-0 border-border/60 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                <span>Clear / New Video</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 p-3.5 sm:p-5">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start justify-between gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                  <p className="leading-relaxed break-words">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="shrink-0 rounded p-0.5 text-red-600/80 hover:text-red-700 dark:text-red-400/80 dark:hover:text-red-300"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {!videoFile ? (
              <div className="space-y-2.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                    handleSelectFile(e.dataTransfer.files?.[0])
                  }}
                  className={`relative w-full rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden ${
                    isDragging
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-blue-500/50"
                  }`}
                >
                  <input
                    id="video-upload-input"
                    type="file"
                    accept="video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv"
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => {
                      handleSelectFile(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center pointer-events-none">
                    <Upload className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 pointer-events-none">
                    <p className="text-sm font-medium text-foreground">
                      {t(language, "generator.videoUploadTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(language, "generator.videoUploadHint")}
                    </p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="relative inline-flex items-center justify-center rounded-lg border border-border/60 bg-background px-3.5 h-9 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors overflow-hidden cursor-pointer">
                    <input
                      id="video-upload-all-files"
                      type="file"
                      accept="*/*"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      onChange={(e) => {
                        handleSelectFile(e.target.files?.[0])
                        e.target.value = ""
                      }}
                    />
                    <FolderOpen className="h-3.5 w-3.5 mr-1.5 pointer-events-none" aria-hidden="true" />
                    <span className="pointer-events-none font-myanmar">
                      Browse All Files / ဖိုင်အားလုံးမှ ရွေးမည်
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-3">
                {previewUrl && (
                  <div className="relative overflow-hidden rounded-lg bg-black/90 flex items-center justify-center">
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      muted
                      className="w-full max-h-[170px] lg:max-h-64 object-contain"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-xs font-medium truncate max-w-[180px] sm:max-w-[240px]">
                      {videoFile.name}
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-medium">
                      {formatFileSize(videoFile.size)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[11px] border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                    >
                      {isDirectMode
                        ? t(language, "generator.videoDirectBadge")
                        : t(language, "generator.videoKeyframeBadge")}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div
                      className={`relative inline-flex items-center justify-center rounded-md border border-border/60 bg-background px-2.5 h-8 text-xs font-medium transition-colors overflow-hidden ${
                        isGenerating
                          ? "opacity-50 pointer-events-none"
                          : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      }`}
                    >
                      <input
                        id="video-change-input"
                        type="file"
                        accept="video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv"
                        disabled={isGenerating}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => {
                          handleSelectFile(e.target.files?.[0])
                          e.target.value = ""
                        }}
                      />
                      <Film className="h-3.5 w-3.5 mr-1.5 pointer-events-none" aria-hidden="true" />
                      <span className="pointer-events-none">{t(language, "generator.videoChange")}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isGenerating}
                      onClick={handleClearFile}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={t(language, "generator.videoClear")}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="video-product-note" className="leading-relaxed">
                {t(language, "generator.videoProductNote")}
              </Label>
              <Input
                id="video-product-note"
                value={productNote}
                onChange={(e) => setProductNote(e.target.value)}
                placeholder={t(language, "generator.videoProductNotePlaceholder")}
                className="border-border/60 font-myanmar"
                disabled={isGenerating}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="video-platform" className="leading-relaxed">
                  {t(language, "generator.videoPlatform")}
                </Label>
                <Select
                  id="video-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as VideoPlatformOption)}
                  className="border-border/60"
                  disabled={isGenerating}
                >
                  {VIDEO_PLATFORMS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="video-language" className="leading-relaxed">
                  {t(language, "generator.videoOutputLang")}
                </Label>
                <Select
                  id="video-language"
                  value={outputLanguage}
                  onChange={(e) => setOutputLanguage(e.target.value as "en" | "my")}
                  className="border-border/60"
                  disabled={isGenerating}
                >
                  <option value="my">{t(language, "generator.language_myanmar")}</option>
                  <option value="en">{t(language, "generator.language_english")}</option>
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!videoFile || isGenerating}
                className="w-full min-h-[44px] rounded-xl font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 border-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    <span>
                      {progressStage === "extracting"
                        ? t(language, "generator.videoProgressExtracting")
                        : t(language, "generator.videoProgressAnalyzing")}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                    <span>{t(language, "generator.videoGenerate")}</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div
        ref={resultRef}
        className="w-full lg:w-[440px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start scroll-mt-4"
      >
        {isGenerating ? (
          <Card className="border-border/60 shadow-sm overflow-hidden" aria-busy="true">
            <CardHeader className="py-3.5 px-4 border-b border-border/60 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>
                    {progressStage === "extracting"
                      ? t(language, "generator.videoProgressExtracting")
                      : t(language, "generator.videoProgressAnalyzing")}
                  </span>
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-4 gap-1.5">
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
              </div>
              <div className="space-y-2.5">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
              <div className="space-y-2 pt-2 border-t border-border/60">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[88%]" />
                <Skeleton className="h-3.5 w-[70%]" />
              </div>
            </CardContent>
          </Card>
        ) : !result ? (
          <Card className="border-border/60 border-dashed bg-card/60">
            <CardContent className="p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Video className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {t(language, "generator.videoEmptyTitle")}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {t(language, "generator.videoEmptyDesc")}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <div
                role="tablist"
                aria-label="Video output sections"
                className="grid grid-cols-4 flex-1 rounded-xl bg-muted/60 p-1 border border-border/60 gap-1"
              >
                {outputTabs.map((tab) => {
                  const isSelected = !showAllTabs && activeTab === tab.id
                  const TabIcon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => {
                        setShowAllTabs(false)
                        setActiveTab(tab.id)
                      }}
                      className={`inline-flex items-center justify-center gap-1 rounded-lg px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium transition-all cursor-pointer font-myanmar ${
                        isSelected
                          ? "bg-background text-foreground shadow-xs border border-border/60"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <TabIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
              <Button
                type="button"
                variant={showAllTabs ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAllTabs((prev) => !prev)}
                className={`h-8 px-2.5 text-[11px] sm:text-xs shrink-0 font-myanmar ${
                  showAllTabs
                    ? "bg-blue-600 hover:bg-blue-700 text-white border-0"
                    : "border-border/60"
                }`}
              >
                <LayoutList className="h-3.5 w-3.5 mr-1 shrink-0" aria-hidden="true" />
                <span>{t(language, "generator.viewAll")}</span>
              </Button>
            </div>

            {(showAllTabs || activeTab === "hooks") && result.hooks.length > 0 && (
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    {t(language, "generator.videoHooksTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 space-y-2">
                  {result.hooks.map((hook, index) => (
                    <div
                      key={`${index}-${hook.slice(0, 12)}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5"
                    >
                      <p className="text-sm font-myanmar leading-relaxed">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 mr-1.5">
                          {index + 1}.
                        </span>
                        {hook}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyText(`hook-${index}`, hook)}
                        className="h-7 w-7 p-0 shrink-0"
                        aria-label={t(language, "generator.copy")}
                      >
                        {copiedKey === `hook-${index}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="border-t border-border/60 bg-muted/10 px-4 py-2.5 flex items-center justify-between gap-2">
                  <ReadAloudButton
                    text={result.hooks.join("\n")}
                    language={outputLanguage}
                    size="xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyText(
                        "hooks",
                        result.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")
                      )
                    }
                    className="h-8 px-3 text-xs border-border/60"
                  >
                    {copiedKey === "hooks" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1.5">{t(language, "generator.copy")}</span>
                  </Button>
                </CardFooter>
              </Card>
            )}

            {(showAllTabs || activeTab === "voiceover") && result.voiceoverScript && (
              <div className="space-y-4">
                <Card className="border-border/60 shadow-sm overflow-hidden">
                  <CardHeader className="py-2.5 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                      {t(language, "generator.videoVoiceoverTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3.5 sm:p-4 max-h-[52vh] lg:max-h-none overflow-y-auto">
                    <p className="text-sm font-myanmar whitespace-pre-wrap leading-[1.85]">
                      {result.voiceoverScript}
                    </p>
                  </CardContent>
                  <CardFooter className="border-t border-border/60 bg-muted/10 px-4 py-2.5 flex items-center justify-between gap-2">
                    <ReadAloudButton
                      text={result.voiceoverScript}
                      language={outputLanguage}
                      size="xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyText("voiceover", result.voiceoverScript)}
                      className="h-8 px-3 text-xs border-border/60"
                    >
                      {copiedKey === "voiceover" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="ml-1.5">{t(language, "generator.copy")}</span>
                    </Button>
                  </CardFooter>
                </Card>

                <VoiceoverStudioCard
                  voiceoverScript={result.voiceoverScript}
                  videoFile={videoFile}
                  language={language}
                />
              </div>
            )}

            {(showAllTabs || activeTab === "caption") && result.caption && (
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    {t(language, "generator.videoCaptionTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 max-h-[52vh] lg:max-h-none overflow-y-auto">
                  <p className="text-sm font-myanmar whitespace-pre-wrap leading-[1.85]">
                    {result.caption}
                  </p>
                </CardContent>
                <CardFooter className="border-t border-border/60 bg-muted/10 px-4 py-2.5 flex items-center justify-between gap-2">
                  <ReadAloudButton
                    text={result.caption}
                    language={outputLanguage}
                    size="xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyText("caption", result.caption)}
                    className="h-8 px-3 text-xs border-border/60"
                  >
                    {copiedKey === "caption" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1.5">{t(language, "generator.copy")}</span>
                  </Button>
                </CardFooter>
              </Card>
            )}

            {(showAllTabs || activeTab === "cover") && coverTitles.length > 0 && (
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {t(language, "generator.videoCoverTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 space-y-2">
                  {coverTitles.map((title, index) => (
                    <div
                      key={`${index}-${title.slice(0, 12)}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5"
                    >
                      <p className="text-sm font-semibold font-myanmar leading-relaxed">
                        {coverTitles.length > 1 && (
                          <span className="text-blue-600 dark:text-blue-400 mr-1.5">
                            {index + 1}.
                          </span>
                        )}
                        {title}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyText(`cover-${index}`, title)}
                        className="h-7 w-7 p-0 shrink-0"
                        aria-label={t(language, "generator.copy")}
                      >
                        {copiedKey === `cover-${index}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="border-t border-border/60 bg-muted/10 px-4 py-2.5 flex items-center justify-between gap-2">
                  <ReadAloudButton
                    text={coverTitles.join("\n")}
                    language={outputLanguage}
                    size="xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyText(
                        "cover",
                        coverTitles.length > 1
                          ? coverTitles.map((c, i) => `${i + 1}. ${c}`).join("\n")
                          : coverTitles[0]
                      )
                    }
                    className="h-8 px-3 text-xs border-border/60"
                  >
                    {copiedKey === "cover" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1.5">{t(language, "generator.copy")}</span>
                  </Button>
                </CardFooter>
              </Card>
            )}

            <div className="sticky bottom-16 sm:bottom-20 z-20 lg:static flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card/95 backdrop-blur-md p-2 shadow-lg lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:shadow-none">
              <div className="grid grid-cols-4 gap-1.5 w-full">
                {(
                  [
                    {
                      key: "quick-hook",
                      label: t(language, "generator.copyHook"),
                      value: result.hooks[0] ?? "",
                    },
                    {
                      key: "quick-script",
                      label: t(language, "generator.copyScript"),
                      value: result.voiceoverScript,
                    },
                    {
                      key: "quick-caption",
                      label: t(language, "generator.copyCaption"),
                      value: result.caption,
                    },
                    {
                      key: "all",
                      label: t(language, "generator.copyAll"),
                      value: formatAllContent(result),
                    },
                  ] as const
                ).map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    variant={item.key === "all" ? "default" : "outline"}
                    size="sm"
                    disabled={!item.value}
                    onClick={() => copyText(item.key, item.value)}
                    className={`h-8 px-1.5 text-[11px] font-medium font-myanmar truncate ${
                      item.key === "all"
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0"
                        : "border-border/60 bg-background/80"
                    }`}
                  >
                    {copiedKey === item.key ? (
                      <Check className="h-3 w-3 mr-1 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveToVault}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-8 text-xs font-myanmar"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.videoSaveVault")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleScheduleToCalendar}
                  className="w-full h-8 text-xs font-myanmar border-border/60"
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t(language, "vault.schedule")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

