"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  Film,
  Hash,
  Loader2,
  Mic,
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
  type VideoContentResult,
  type VideoPlatformOption,
} from "@/api/aiService"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ReadAloudButton } from "@/components/shared/read-aloud-button"
import {
  Card,
  CardContent,
  CardDescription,
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isSupportedVideoFile(file: File): boolean {
  const mime = file.type.toLowerCase()
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "video/webm") {
    return true
  }
  const name = file.name.toLowerCase()
  return name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".webm")
}

function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#[^\s#]+/g)].map((match) => match[0].slice(1))
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

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [productNote, setProductNote] = useState("")
  const [platform, setPlatform] = useState<VideoPlatformOption>("TikTok / Reels")
  const [outputLanguage, setOutputLanguage] = useState<"en" | "my">(language)

  const [progressStage, setProgressStage] = useState<"extracting" | "analyzing" | null>(null)
  const [result, setResult] = useState<VideoContentResult | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    setOutputLanguage(language)
  }, [language])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleSelectFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      if (!isSupportedVideoFile(file)) {
        toast.error(t(language, "generator.videoInvalidType"))
        return
      }
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      setVideoFile(file)
      setResult(null)
    },
    [language]
  )

  const handleClearFile = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setVideoFile(null)
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!videoFile || progressStage) return
    setProgressStage(
      videoFile.size <= DIRECT_MODE_LIMIT_BYTES ? "analyzing" : "extracting"
    )
    try {
      const generated = await generateVideoContent({
        file: videoFile,
        productNote: productNote.trim() || undefined,
        platform,
        language: outputLanguage,
        onProgress: (stage) => setProgressStage(stage),
      })
      setResult(generated)
      toast.success(t(language, "generator.videoSuccess"))
      if (window.innerWidth < 1024) {
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t(language, "generator.videoError")
      toast.error(message)
    } finally {
      setProgressStage(null)
    }
  }, [videoFile, progressStage, productNote, platform, outputLanguage, language])

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
      return [
        `[${t(language, "generator.videoCoverTitle")}]\n${data.coverTitle}`,
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
    saveToVault({
      title: result.coverTitle || productNote.trim() || videoFile?.name || "Video Script",
      content: combined,
      platform: mapVideoPlatformToVaultPlatform(platform),
      tags: extractHashtags(result.caption),
    })
    toast.success(t(language, "generator.videoSavedVault"))
  }, [result, formatAllContent, saveToVault, productNote, videoFile, platform, language])

  const isGenerating = progressStage !== null
  const isDirectMode = videoFile ? videoFile.size <= DIRECT_MODE_LIMIT_BYTES : true

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="w-full flex-1 min-w-0">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-4 border-b border-border/60">
            <CardDescription className="leading-[1.85]">
              {t(language, "generator.videoDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 sm:p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            {!videoFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
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
                className={`w-full rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-blue-500/50"
                }`}
              >
                <div className="h-12 w-12 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t(language, "generator.videoUploadTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(language, "generator.videoUploadHint")}
                  </p>
                </div>
              </button>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-3">
                {previewUrl && (
                  <div className="relative overflow-hidden rounded-lg bg-black/90 flex items-center justify-center">
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-64 object-contain"
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isGenerating}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 text-xs border-border/60"
                    >
                      <Film className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      {t(language, "generator.videoChange")}
                    </Button>
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

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!videoFile || isGenerating}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 border-0 h-10"
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
          </CardContent>
        </Card>
      </div>

      <div
        ref={resultRef}
        className="w-full lg:w-[440px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start"
      >
        {!result ? (
          <Card className="border-border/60 border-dashed bg-card/60">
            <CardContent className="p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Video className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyText("all", formatAllContent(result))}
                className="flex-1 sm:flex-none border-border/60"
              >
                {copiedKey === "all" ? (
                  <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                )}
                {t(language, "generator.videoCopyAll")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveToVault}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {t(language, "generator.videoSaveVault")}
              </Button>
            </div>

            {result.coverTitle && (
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    {t(language, "generator.videoCoverTitle")}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyText("cover", result.coverTitle)}
                    className="h-7 px-2 text-xs"
                  >
                    {copiedKey === "cover" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1">{t(language, "generator.copy")}</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold font-myanmar leading-relaxed">
                    {result.coverTitle}
                  </p>
                </CardContent>
              </Card>
            )}

            {result.hooks.length > 0 && (
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    {t(language, "generator.videoHooksTitle")}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyText(
                        "hooks",
                        result.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")
                      )
                    }
                    className="h-7 px-2 text-xs"
                  >
                    {copiedKey === "hooks" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1">{t(language, "generator.copy")}</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
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
              </Card>
            )}

            {result.voiceoverScript && (
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                    {t(language, "generator.videoVoiceoverTitle")}
                  </CardTitle>
                  <div className="flex items-center gap-1 flex-wrap">
                    <ReadAloudButton
                      text={result.voiceoverScript}
                      language={outputLanguage}
                      size="xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyText("voiceover", result.voiceoverScript)}
                      className="h-7 px-2 text-xs"
                    >
                      {copiedKey === "voiceover" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="ml-1">{t(language, "generator.copy")}</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm font-myanmar whitespace-pre-wrap leading-[1.85]">
                    {result.voiceoverScript}
                  </p>
                </CardContent>
              </Card>
            )}

            {result.caption && (
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    {t(language, "generator.videoCaptionTitle")}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyText("caption", result.caption)}
                    className="h-7 px-2 text-xs"
                  >
                    {copiedKey === "caption" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="ml-1">{t(language, "generator.copy")}</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm font-myanmar whitespace-pre-wrap leading-[1.85]">
                    {result.caption}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

