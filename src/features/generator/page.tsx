"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  User,
  ThumbsUp,
  Share2,
  MessageCircle,
  Clock,
  Minimize2,
  Smile,
  Megaphone,
  Video,
  Send,
  Sparkles,
  Repeat,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"

import {
  generatorSchema,
  type GeneratorFormInput,
} from "@/features/generator/schema"
import { useGenerateContent } from "@/features/generator/useGenerateContent"
import { useContentStore } from "@/store/useContentStore"
import type { GeneratedContent } from "@/api/aiService"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"

import { Button } from "@/components/ui/button"
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

import { Badge } from "@/components/ui/badge"



function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#[^\s#]+/g)].map((match) => match[0].slice(1))
}

type ActiveAction = {
  kind: "generate" | "refine" | "repurpose"
  id: string
  baseTopic?: string
}

const REFINE_OPTIONS = [
  {
    id: "shorten",
    labelKey: "generator.refineShorten",
    icon: Minimize2,
    instruction:
      "Condense the following post to be shorter and punchier while keeping all key selling points and core message.",
  },
  {
    id: "emojis",
    labelKey: "generator.refineEmojis",
    icon: Smile,
    instruction:
      "Enrich the following post with engaging, relevant emojis while keeping the meaning and structure natural.",
  },
  {
    id: "sales_cta",
    labelKey: "generator.refineSalesCta",
    icon: Megaphone,
    instruction:
      "Rewrite the following post with stronger sales urgency and a clear, compelling call-to-action (CTA).",
  },
] as const

const REPURPOSE_OPTIONS = [
  {
    id: "tiktok_script",
    labelKey: "generator.repurposeTiktok",
    icon: Video,
    platform: "tiktok",
    contentType: "video_script",
    instruction:
      "Transform the following post into a 30-second TikTok video script with a spoken hook, concise body, and [Visual Cue] directions.",
  },
  {
    id: "telegram_post",
    labelKey: "generator.repurposeTelegram",
    icon: Send,
    platform: "telegram",
    contentType: "post_caption",
    instruction:
      "Transform the following post into a Telegram channel post formatted with clear bullet points and **bold** highlights.",
  },
  {
    id: "ig_caption",
    labelKey: "generator.repurposeIg",
    icon: Sparkles,
    platform: "instagram",
    contentType: "post_caption",
    instruction:
      "Transform the following post into a short, punchy 2-3 line Instagram caption with relevant hashtags at the end.",
  },
] as const

export function GeneratorPage() {
  const { language } = useUIStore(
    useShallow((state) => ({ language: state.language, setLanguage: state.setLanguage }))
  )

  const PLATFORMS = [
    { value: "facebook", label: t(language, "generator.platform_facebook") },
    { value: "tiktok", label: t(language, "generator.platform_tiktok") },
    { value: "youtube", label: t(language, "generator.platform_youtube") },
    { value: "instagram", label: t(language, "generator.platform_instagram") },
  ] as const

  const CONTENT_TYPES = [
    { value: "post_caption", label: t(language, "generator.content_type_post_caption") },
    { value: "video_script", label: t(language, "generator.content_type_video_script") },
    { value: "hook_ideas", label: t(language, "generator.content_type_hook_ideas") },
    { value: "thread", label: t(language, "generator.content_type_thread") },
  ] as const

  const TONES = [
    { value: "engaging", label: t(language, "generator.tone_engaging") },
    { value: "educational", label: t(language, "generator.tone_educational") },
    { value: "funny", label: t(language, "generator.tone_funny") },
    { value: "storytelling", label: t(language, "generator.tone_storytelling") },
    { value: "sales", label: t(language, "generator.tone_sales") },
  ] as const

  const LANGUAGES = [
    { value: "myanmar", label: t(language, "generator.language_myanmar") },
    { value: "english", label: t(language, "generator.language_english") },
    { value: "bilingual", label: t(language, "generator.language_bilingual") },
  ] as const

  const QUICK_STARTERS = [
    {
      title: t(language, "generator.starter_street_food"),
      topic: "Yangon street food guide",
      platform: "instagram",
      contentType: "post_caption",
      tone: "engaging",
      language: "english",
    },
    {
      title: t(language, "generator.starter_travel_tips"),
      topic: "Best time to visit Bagan",
      platform: "facebook",
      contentType: "post_caption",
      tone: "educational",
      language: "english",
    },
    {
      title: t(language, "generator.starter_product_launch"),
      topic: "New organic skincare line launch",
      platform: "tiktok",
      contentType: "video_script",
      tone: "sales",
      language: "english",
    },
    {
      title: t(language, "generator.starter_weekend_thread"),
      topic: "Relaxing weekend in Inle Lake",
      platform: "facebook",
      contentType: "thread",
      tone: "storytelling",
      language: "english",
    },
  ] as const
  const setDraftInput = useContentStore(
    useShallow((state) => state.setDraftInput)
  )
  const draftInput = useContentStore(useShallow((state) => state.draftInput))
  const { addGeneratedItem, saveToVault } = useContentStore(
    useShallow((state) => ({
      addGeneratedItem: state.addGeneratedItem,
      saveToVault: state.saveToVault,
    }))
  )

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const pendingActionRef = useRef<ActiveAction | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const mutation = useGenerateContent({
    onSuccess: (data) => {
      const action = pendingActionRef.current
      pendingActionRef.current = null
      setActiveAction(null)
      setIsGenerating(false)

      const normalizedData: GeneratedContent = action?.baseTopic
        ? { ...data, topic: action.baseTopic }
        : data

      setResult(normalizedData)
      setDisplayedText("")
      setTypewriterIndex(0)
      setIsTypewriting(true)
      addGeneratedItem({
        topic: normalizedData.topic,
        platform: normalizedData.platform,
        contentType: normalizedData.contentType,
        tone: normalizedData.tone,
        content: normalizedData.content,
      })
      const successKey =
        action?.kind === "refine"
          ? "generator.refineSuccess"
          : action?.kind === "repurpose"
            ? "generator.repurposeSuccess"
            : "generator.genSuccess"
      toast.success(t(language, successKey))

      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setTimeout(() => {
          previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
    },
    onError: (err) => {
      pendingActionRef.current = null
      setActiveAction(null)
      setIsGenerating(false)
      const baseMsg = t(language, "generator.genError")
      const detail = err instanceof Error && err.message ? err.message : String(err ?? "")
      toast.error(detail ? `${baseMsg}: ${detail}` : baseMsg)
    },
  })

  const { mutate: generate, isPending } = mutation

  const [result, setResult] = useState<GeneratedContent | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor")
  const [displayedText, setDisplayedText] = useState("")
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isTypewriting, setIsTypewriting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const form = useForm<GeneratorFormInput>({
    resolver: zodResolver(generatorSchema),
    defaultValues: draftInput,
  })

  const formValues = useWatch({ control: form.control })
  useEffect(() => {
    setDraftInput(formValues)
  }, [formValues, setDraftInput])

  useEffect(() => {
    if (!isTypewriting || !result) return
    if (typewriterIndex < result.content.length) {
      const timer = setTimeout(() => {
        setDisplayedText(result.content.slice(0, typewriterIndex + 1))
        setTypewriterIndex((prev) => prev + 1)
      }, 15)
      return () => clearTimeout(timer)
    } else {
      setIsTypewriting(false)
    }
  }, [isTypewriting, typewriterIndex, result])

  const onSubmit = (data: GeneratorFormInput) => {
    const action: ActiveAction = { kind: "generate", id: "generate" }
    pendingActionRef.current = action
    setActiveAction(action)
    setIsGenerating(true)
    setResult(null)
    setDisplayedText("")
    setTypewriterIndex(0)
    setIsTypewriting(false)
    generate({ ...data, includeHashtags: data.includeHashtags ?? true })
  }

  const handleCopy = useCallback(async () => {
    const textToCopy = result?.content ?? displayedText
    if (!textToCopy) return
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(textToCopy)
      toast.success(t(language, "generator.copySuccess"))
    } catch {
      toast.error("Failed to copy to clipboard")
    } finally {
      setIsCopying(false)
    }
  }, [result, displayedText, language])

  const handleSaveToVault = useCallback(() => {
    if (!result) return
    saveToVault({
      title: result.topic,
      content: result.content,
      platform: result.platform,
      tags: extractHashtags(result.content),
    })
    toast.success(t(language, "generator.saveSuccess"))
  }, [result, saveToVault, language])

  const handleRegenerate = useCallback(() => {
    if (!result) return
    const values = form.getValues()
    const action: ActiveAction = { kind: "generate", id: "regenerate" }
    pendingActionRef.current = action
    setActiveAction(action)
    setIsGenerating(true)
    setResult(null)
    setDisplayedText("")
    setTypewriterIndex(0)
    setIsTypewriting(false)
    generate({
      topic: result.topic,
      platform: result.platform,
      contentType: result.contentType,
      tone: result.tone,
      language: values.language,
      includeHashtags: values.includeHashtags ?? true,
    })
  }, [result, form, generate])

  const isGeneratingFlag = isPending || isGenerating

  const runTransform = useCallback(
    (params: {
      kind: "refine" | "repurpose"
      id: string
      instruction: string
      platform?: string
      contentType?: string
    }) => {
      const currentText = result?.content || displayedText
      if (!currentText || isGeneratingFlag) return
      const values = form.getValues()
      const selectedLang = values.language || "english"
      const languageDirective =
        selectedLang === "myanmar"
          ? "Output language: Myanmar (Burmese Unicode script only)."
          : selectedLang === "bilingual"
            ? "Output language: Bilingual (natural blend of Myanmar Unicode and English)."
            : "Output language: English."

      const action: ActiveAction = {
        kind: params.kind,
        id: params.id,
        baseTopic: result?.topic || values.topic,
      }
      pendingActionRef.current = action
      setActiveAction(action)
      setIsGenerating(true)
      setIsTypewriting(false)

      generate({
        topic: result?.topic || values.topic || "Social Media Post",
        platform: params.platform ?? result?.platform ?? values.platform,
        contentType: params.contentType ?? result?.contentType ?? values.contentType,
        tone: result?.tone ?? values.tone,
        language: selectedLang,
        includeHashtags: values.includeHashtags ?? true,
        instruction: `${params.instruction}\n${languageDirective}`,
        currentContent: currentText,
      })
    },
    [result, displayedText, isGeneratingFlag, form, generate]
  )

  const handleLoadTemplate = useCallback((template: any) => {
    form.setValues({
      topic: template.topic,
      platform: template.platform,
      contentType: template.contentType,
      tone: template.tone,
      language: template.language,
      includeHashtags: true,
    })
  }, [form])

  const loadingLabel =
    activeAction?.kind === "refine"
      ? t(language, "generator.refining")
      : activeAction?.kind === "repurpose"
        ? t(language, "generator.repurposing")
        : t(language, "generator.generating")
  const contentToShow = viewMode === "editor" ? (displayedText || (result?.content ?? "")) : (result?.content ?? "")
  const charCount = contentToShow.length
  const wordCount = contentToShow ? contentToShow.split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-relaxed">
          {t(language, "generator.templates")}
        </span>
        {QUICK_STARTERS.map((tpl) => (
          <Button
            key={tpl.title}
            variant="outline"
            size="sm"
            onClick={() => handleLoadTemplate(tpl)}
            className="flex items-center gap-2 text-xs leading-relaxed"
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {tpl.title}
          </Button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>{t(language, "generator.title")}</CardTitle>
              <CardDescription>{t(language, "generator.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-4 p-6"
              >
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="topic">{t(language, "generator.topic")}</Label>
                    <Input
                      id="topic"
                      placeholder={t(language, "generator.topicPlaceholder")}
                      {...form.register("topic")}
                    />
                    {form.formState.errors.topic && (
                      <span className="text-sm text-destructive leading-relaxed">
                        {form.formState.errors.topic.message}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="platform">{t(language, "generator.platform")}</Label>
                    <Select id="platform" {...form.register("platform")}>
                      <option value="">{t(language, "generator.platform")}</option>
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="contentType">{t(language, "generator.contentType")}</Label>
                    <Select id="contentType" {...form.register("contentType")}>
                      <option value="">{t(language, "generator.contentType")}</option>
                      {CONTENT_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tone">{t(language, "generator.tone")}</Label>
                    <Select id="tone" {...form.register("tone")}>
                      <option value="">{t(language, "generator.tone")}</option>
                      {TONES.map((t2) => (
                        <option key={t2.value} value={t2.value}>
                          {t2.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="language">{t(language, "generator.language")}</Label>
                    <Select id="language" {...form.register("language")}>
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2 items-end">
                    <Label htmlFor="includeHashtags" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="includeHashtags"
                        type="checkbox"
                        {...form.register("includeHashtags")}
                        className="rounded border-input bg-background text-primary"
                      />
                      {t(language, "generator.includeHashtags")}
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="default"
                    className="w-full"
                    disabled={isGeneratingFlag}
                  >
                    {isGeneratingFlag ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                        {t(language, "generator.generating")}
                      </>
                    ) : (
                      t(language, "generator.generate")
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!result || isGeneratingFlag}
                    onClick={handleRegenerate}
                  >
                    <RefreshCw className="h-3 w-3 mr-1.5" aria-hidden="true" />
                    {t(language, "generator.regenerate")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div ref={previewRef} className="w-full lg:w-[400px] shrink-0 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t(language, "generator.viewMode")}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant={viewMode === "editor" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("editor")}
                    className="h-8 px-2"
                  >
                    <User className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    variant={viewMode === "preview" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("preview")}
                    className="h-8 px-2"
                  >
                    <Share2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <CardDescription>
                {t(language, "generator.previewDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px] flex flex-col gap-4">
              {isGeneratingFlag ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                  <p className="text-sm leading-relaxed">
                    {loadingLabel}
                  </p>
                </div>
              ) : !result && !displayedText ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground leading-relaxed">
                  <FileText className="h-10 w-10 opacity-50" aria-hidden="true" />
                  <p className="text-sm">{t(language, "generator.noContent")}</p>
                </div>
              ) : viewMode === "editor" ? (
                <>
                  <div className="overflow-y-auto font-myanmar leading-relaxed">
                    <p className="whitespace-pre-wrap break-words">
                      {contentToShow}
                    </p>
                  </div>
                  {isTypewriting && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="animate-pulse">&#9647;</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{charCount} {t(language, "generator.characters")}</Badge>
                    <Badge variant="outline">{wordCount} {t(language, "generator.words")}</Badge>
                    <Badge variant="outline">{result?.platform ?? ""}</Badge>
                  </div>
                </>
              ) : (
                <SocialPostPreview content={result?.content ?? ""} platform={result?.platform ?? "instagram"} />
              )}
            </CardContent>
            <CardFooter>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={isCopying || (!result && !displayedText)}
                  className="flex-1"
                >
                  {isCopying ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" aria-hidden="true" />
                      {t(language, "generator.copying")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1.5" aria-hidden="true" />
                      {t(language, "generator.copy")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToVault}
                  disabled={!result}
                  className="flex-1"
                >
                  <Save className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.saveToVault")}
                </Button>
              </div>
            </CardFooter>
          </Card>

          {result && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t(language, "generator.refineTitle")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {REFINE_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const isThisLoading =
                      isGeneratingFlag &&
                      activeAction?.kind === "refine" &&
                      activeAction.id === opt.id
                    return (
                      <Button
                        key={opt.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isGeneratingFlag}
                        onClick={() =>
                          runTransform({
                            kind: "refine",
                            id: opt.id,
                            instruction: opt.instruction,
                          })
                        }
                        className="h-auto py-1.5 px-2.5 text-xs font-myanmar"
                      >
                        {isThisLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" aria-hidden="true" />
                        ) : (
                          <Icon className="h-3 w-3 mr-1.5" aria-hidden="true" />
                        )}
                        {t(language, opt.labelKey)}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t(language, "generator.repurposeTitle")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {REPURPOSE_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const isThisLoading =
                      isGeneratingFlag &&
                      activeAction?.kind === "repurpose" &&
                      activeAction.id === opt.id
                    return (
                      <Button
                        key={opt.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isGeneratingFlag}
                        onClick={() =>
                          runTransform({
                            kind: "repurpose",
                            id: opt.id,
                            instruction: opt.instruction,
                            platform: opt.platform,
                            contentType: opt.contentType,
                          })
                        }
                        className="h-auto py-1.5 px-2.5 text-xs font-myanmar"
                      >
                        {isThisLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" aria-hidden="true" />
                        ) : (
                          <Icon className="h-3 w-3 mr-1.5" aria-hidden="true" />
                        )}
                        {t(language, opt.labelKey)}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SocialPostPreview({ content, platform }: { content: string; platform: string }) {
  const language = useUIStore((state) => state.language)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(false)

  return (
    <div className="rounded-xl border bg-card p-4 font-myanmar leading-relaxed">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
          CC
        </div>
        <div className="flex flex-col leading-none">
          <div className="text-sm font-semibold">{t(language, "preview.content_creator")}</div>
          <div className="text-xs text-muted-foreground">
            {platform === "instagram" ? t(language, "platform.instagram") : platform.charAt(0).toUpperCase() + platform.slice(1)} &#8226; {t(language, "preview.time_ago")}
          </div>
        </div>
      </div>
      <div className="text-sm mb-3">
        <p className="whitespace-pre-wrap break-words">
          {content.length > 200 && !expanded ? `${content.slice(0, 200)}...` : content}
        </p>
        {content.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary underline underline-offset-4 mt-1 flex items-center gap-1"
          >
            {expanded ? t(language, "preview.see_less") : t(language, "preview.see_more")}
          </button>
        )}
      </div>
      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLiked(!liked)}
            className="flex items-center gap-1.5 text-xs transition-colors"
          >
            <ThumbsUp className={`h-3 w-3 ${liked ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
            <span className={liked ? "text-destructive font-medium" : "text-muted-foreground"}>{t(language, "preview.like")}</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <MessageCircle className="h-3 w-3" aria-hidden="true" />
            <span>{t(language, "preview.comment")}</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <Share2 className="h-3 w-3" aria-hidden="true" />
            <span>{t(language, "preview.share")}</span>
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

