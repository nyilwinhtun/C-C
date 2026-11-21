"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Calendar,
  Camera,
  Copy,
  Globe,
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
  History,
  Hash,
  Store,
  Check,
  AlertTriangle,
  ImagePlus,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"

import {
  generatorSchema,
  type GeneratorFormInput,
} from "@/features/generator/schema"
import { useGenerateContent } from "@/features/generator/useGenerateContent"
import { cleanVoiceoverText } from "@/api/ttsService"
import { ReadAloudButton } from "@/components/shared/read-aloud-button"
import {
  useContentStore,
  type GeneratedItem,
  type PosterDraft,
} from "@/store/useContentStore"
import {
  BUSINESS_CATEGORIES,
  DEFAULT_ONLINE_SHOP_CTA_EN,
  DEFAULT_ONLINE_SHOP_CTA_MY,
  SALES_ANGLES,
  isShoppingCategory,
  type BusinessCategory,
} from "@/types"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"



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

function buildGeneratorVaultTags(
  text: string,
  contentType?: string,
  salesAngle?: string
): string[] {
  const tags = extractHashtags(text)
  if (contentType === "video_script" && !tags.includes("video-script")) {
    tags.push("video-script")
  } else if (contentType === "post_caption" && !tags.includes("caption")) {
    tags.push("caption")
  }
  if (salesAngle === "promo_showcase" && !tags.includes("promo")) {
    tags.push("promo")
  }
  return Array.from(new Set(tags))
}

function cleanPosterLine(line: string): string {
  return line
    .replace(/^\s*(?:[•\-\*▪▸►✅✔🔥⚡📌👉🎯💎✨📱🛍️]+|\d+[.)])\s*/u, "")
    .replace(/\s+/g, " ")
    .trim()
}

function truncateCleanly(text: string, maxLen: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  const sliced = trimmed.slice(0, maxLen)
  const lastSpace = sliced.lastIndexOf(" ")
  return (lastSpace > maxLen * 0.55 ? sliced.slice(0, lastSpace) : sliced).trim()
}

function extractPosterDraftFromPost(postText: string, fallbackTopic?: string): PosterDraft {
  const rawLines = postText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))

  const firstLine = cleanPosterLine(rawLines[0] ?? fallbackTopic ?? "")
  const headline = truncateCleanly(firstLine, 60)

  const bulletPattern = /^(?:[•\-\*▪▸►✅✔🔥⚡📌👉🎯💎✨]+|\d+[.)])\s*/u
  const remaining = rawLines.slice(1)

  const explicitBullets = remaining
    .filter((l) => bulletPattern.test(l))
    .map(cleanPosterLine)
    .filter((l) => l.length >= 2 && l !== headline)

  const fallbackCandidates = remaining
    .filter((l) => !bulletPattern.test(l))
    .map(cleanPosterLine)
    .filter((l) => l.length >= 2 && l.length <= 48 && l !== headline)

  const specs: string[] = []
  for (const item of [...explicitBullets, ...fallbackCandidates]) {
    if (specs.length >= 3) break
    const pill = truncateCleanly(item, 28)
    if (pill && !specs.includes(pill)) {
      specs.push(pill)
    }
  }

  return {
    headline,
    spec1: specs[0] ?? "",
    spec2: specs[1] ?? "",
    spec3: specs[2] ?? "",
    caption: postText.trim(),
  }
}

const FB_FOLD_LIMIT = 140

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  tiktok: 2200,
  instagram: 2200,
  telegram: 4096,
  youtube: 5000,
  facebook: 63206,
}

function getOpeningHookLength(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const firstParagraph = trimmed.split(/\n\s*\n/)[0] ?? ""
  const hookText = firstParagraph.split("\n").slice(0, 2).join("\n").trim()
  return hookText.length
}

function getPlatformCharLimit(platform?: string): number {
  return PLATFORM_CHAR_LIMITS[(platform || "instagram").toLowerCase()] ?? 2200
}

function getPlatformMeta(platform?: string) {
  const normalized = (platform || "instagram").toLowerCase()
  switch (normalized) {
    case "facebook":
      return { icon: Globe, label: "Facebook", badgeClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20" }
    case "tiktok":
      return { icon: Video, label: "TikTok", badgeClass: "text-foreground bg-muted/60 border-border" }
    case "youtube":
      return { icon: Video, label: "YouTube", badgeClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" }
    case "telegram":
      return { icon: Send, label: "Telegram", badgeClass: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20" }
    case "instagram":
    default:
      return { icon: Camera, label: "Instagram", badgeClass: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20" }
  }
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
  {
    id: "swap_hook",
    labelKey: "generator.refineSwapHook",
    icon: RefreshCw,
    instruction:
      "Rewrite ONLY the first 2 opening hook lines of the following post to be more attention-grabbing and scroll-stopping, while keeping the rest of the body, details, hashtags, and call-to-action (CTA) completely unchanged.",
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
      "Transform the following post into a Telegram channel post formatted with clear bullet points and clean plain-text highlights (no Markdown asterisks).",
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

const MYANMAR_HASHTAG_PACKS = [
  {
    id: "tech",
    labelKey: "generator.hashtagTech",
    tags: ["#TechMyanmar", "#GadgetMyanmar", "#နည်းပညာ", "#ElectronicsMyanmar", "#OnlineShopMyanmar"],
  },
  {
    id: "fashion",
    labelKey: "generator.hashtagFashion",
    tags: ["#FashionMyanmar", "#BeautyMyanmar", "#အလှကုန်", "#ဖက်ရှင်", "#SkincareMyanmar"],
  },
  {
    id: "food",
    labelKey: "generator.hashtagFood",
    tags: ["#MyanmarFoodie", "#MyanmarFood", "#အစားအသောက်", "#စားသောက်ဆိုင်", "#FoodieMyanmar"],
  },
  {
    id: "promo",
    labelKey: "generator.hashtagPromo",
    tags: ["#SpecialOffer", "#SaleMyanmar", "#အထူးလျှော့ဈေး", "#OnlineShopMyanmar", "#Promo"],
  },
] as const

function extractCopySections(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return { hook: "", script: "", caption: "", all: "" }
  }
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean)

  const hook =
    paragraphs[0] && paragraphs[0].split("\n").length <= 3
      ? paragraphs[0]
      : lines.slice(0, 2).join("\n")

  const nonHashtagParagraphs = paragraphs.filter((p) => !/^#[^\s#]+(\s+#[^\s#]+)*$/.test(p))
  const script =
    nonHashtagParagraphs.length > 1
      ? nonHashtagParagraphs.slice(1).join("\n\n")
      : trimmed

  const captionLines = lines.filter(
    (l) => !/^(\[\d+-\d+s[^\]]*\]|မြင်ကွင်း:|အသံ:|ဖန်သားပြင်စာသား:|ပြောစကား:)/i.test(l)
  )
  const caption = captionLines.join("\n").trim() || trimmed

  return { hook, script, caption, all: trimmed }
}

export function GeneratorPage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      setActivePageKey: state.setActivePageKey,
    }))
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
      title: t(language, "generator.starter_flash_sale"),
      topic: "Limited-time weekend flash sale promotion",
      platform: "facebook",
      contentType: "post_caption",
      tone: "sales",
      language: "english",
    },
    {
      title: t(language, "generator.starter_tips_guide"),
      topic: "5 helpful tips for choosing the right product",
      platform: "facebook",
      contentType: "post_caption",
      tone: "educational",
      language: "english",
    },
    {
      title: t(language, "generator.starter_product_launch"),
      topic: "New product arrival and key highlights",
      platform: "tiktok",
      contentType: "video_script",
      tone: "engaging",
      language: "english",
    },
    {
      title: t(language, "generator.starter_behind_scenes"),
      topic: "Behind the scenes of our daily workflow",
      platform: "instagram",
      contentType: "thread",
      tone: "storytelling",
      language: "english",
    },
  ] as const
  const setDraftInput = useContentStore(
    useShallow((state) => state.setDraftInput)
  )
  const draftInput = useContentStore(useShallow((state) => state.draftInput))
  const {
    textPostResult: result,
    setTextPostResult: setResult,
    clearTextPostDraft,
    addGeneratedItem,
    saveToVault,
    generatedHistory,
    brandSignature,
    businessCategory,
    customNiche,
    autoAppendShopCta,
    setBusinessCategory,
    setCustomNiche,
    setAutoAppendShopCta,
    setPosterDraft,
    setVoiceoverDraftScript,
  } = useContentStore(
    useShallow((state) => ({
      textPostResult: state.textPostResult,
      setTextPostResult: state.setTextPostResult,
      clearTextPostDraft: state.clearTextPostDraft,
      addGeneratedItem: state.addGeneratedItem,
      saveToVault: state.saveToVault,
      generatedHistory: state.generatedHistory,
      brandSignature: state.brandSignature,
      businessCategory: state.businessCategory,
      customNiche: state.customNiche,
      autoAppendShopCta: state.autoAppendShopCta,
      setBusinessCategory: state.setBusinessCategory,
      setCustomNiche: state.setCustomNiche,
      setAutoAppendShopCta: state.setAutoAppendShopCta,
      setPosterDraft: state.setPosterDraft,
      setVoiceoverDraftScript: state.setVoiceoverDraftScript,
    }))
  )

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [isExpanding, setIsExpanding] = useState(false)
  const pendingActionRef = useRef<ActiveAction | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const mutation = useGenerateContent({
    onSuccess: (data) => {
      const action = pendingActionRef.current
      pendingActionRef.current = null
      setActiveAction(null)
      setIsGenerating(false)
      setIsExpanding(false)

      const rawContent = data.content
      const selectedGenLang = form.getValues("language")
      const ctaText =
        selectedGenLang === "english"
          ? DEFAULT_ONLINE_SHOP_CTA_EN
          : DEFAULT_ONLINE_SHOP_CTA_MY
      const shouldAppendCta =
        autoAppendShopCta &&
        action?.kind === "generate" &&
        !rawContent.includes(ctaText)
      const finalContent = shouldAppendCta
        ? `${rawContent.trimEnd()}\n\n${ctaText}`
        : rawContent

      const normalizedData: GeneratedContent = {
        ...data,
        content: finalContent,
        ...(action?.baseTopic ? { topic: action.baseTopic } : {}),
      }

      setResult(normalizedData)
      if (action?.kind === "refine") {
        setDisplayedText(normalizedData.content)
        setTypewriterIndex(normalizedData.content.length)
        setIsTypewriting(false)
      } else {
        setDisplayedText("")
        setTypewriterIndex(0)
        setIsTypewriting(true)
      }
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

      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setMobileView("result")
      }
    },
    onError: (err) => {
      pendingActionRef.current = null
      setActiveAction(null)
      setIsGenerating(false)
      setIsExpanding(false)
      const baseMsg = t(language, "generator.genError")
      const detail = err instanceof Error && err.message ? err.message : String(err ?? "")
      toast.error(detail ? `${baseMsg}: ${detail}` : baseMsg)
    },
  })

  const { mutate: generate, isPending } = mutation

  const [isCopying, setIsCopying] = useState(false)
  const [copiedStripKey, setCopiedStripKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor")
  const [displayedText, setDisplayedText] = useState(() => result?.content ?? "")
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isTypewriting, setIsTypewriting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [mobileView, setMobileView] = useState<"create" | "result">("create")
  const [optionsOpen, setOptionsOpen] = useState(false)

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
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileView("result")
    }
    generate({
      ...data,
      salesAngle: data.salesAngle ?? "viral_story",
      businessCategory,
      customNiche: customNiche.trim() || undefined,
      includeHashtags: data.includeHashtags ?? true,
      targetDurationSeconds: data.targetDurationSeconds ?? 15,
    })
  }

  const updatePreviewContent = useCallback(
    (nextText: string) => {
      setIsTypewriting(false)
      setDisplayedText(nextText)
      setTypewriterIndex(nextText.length)
      const prev = useContentStore.getState().textPostResult
      if (prev) {
        setResult({ ...prev, content: nextText })
      } else {
        const values = form.getValues()
        setResult({
          id: crypto.randomUUID(),
          topic: values.topic || "Draft",
          platform: values.platform || "instagram",
          contentType: values.contentType || "post_caption",
          tone: values.tone || "engaging",
          content: nextText,
          createdAt: new Date().toISOString(),
        })
      }
    },
    [form, setResult]
  )

  const handleQuickCopySection = useCallback(
    async (key: "hook" | "script" | "caption" | "all", text: string, label: string) => {
      if (!text.trim()) return
      try {
        await navigator.clipboard.writeText(text)
        setCopiedStripKey(key)
        toast.success(t(language, "generator.copiedSection", { section: label }))
        window.setTimeout(() => {
          setCopiedStripKey((prev) => (prev === key ? null : prev))
        }, 1600)
      } catch {
        toast.error(t(language, "generator.copyError"))
      }
    },
    [language]
  )

  const handleCopy = useCallback(async () => {
    const textToCopy = isTypewriting ? displayedText : (result?.content ?? displayedText)
    if (!textToCopy) return
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(textToCopy)
      toast.success(t(language, "generator.copySuccess"))
    } catch {
      toast.error(t(language, "generator.copyError"))
    } finally {
      setIsCopying(false)
    }
  }, [isTypewriting, result, displayedText, language])

  const handleShare = useCallback(async () => {
    const textToShare = isTypewriting ? displayedText : (result?.content ?? displayedText)
    if (!textToShare) return
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: textToShare })
        toast.success(t(language, "generator.shareSuccess"))
        return
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
      }
    }
    try {
      await navigator.clipboard.writeText(textToShare)
      toast.success(t(language, "generator.shareFallbackCopied"))
    } catch {
      toast.error(t(language, "generator.copyError"))
    }
  }, [isTypewriting, result, displayedText, language])

  const handleRestoreRecent = useCallback(
    (item: GeneratedItem) => {
      setIsTypewriting(false)
      setResult({
        id: item.id,
        topic: item.topic,
        platform: item.platform,
        contentType: item.contentType,
        tone: item.tone,
        content: item.content,
        createdAt: item.createdAt,
      })
      setDisplayedText(item.content)
      setTypewriterIndex(item.content.length)
      toast.success(t(language, "generator.recentRestored"))
    },
    [language]
  )

  const handleSaveToVault = useCallback(() => {
    if (!result) return
    const text = (displayedText || result.content).trim()
    saveToVault({
      title: result.topic,
      content: text,
      platform: result.platform,
      tags: buildGeneratorVaultTags(text, result.contentType, form.getValues("salesAngle")),
    })
    toast.success(t(language, "generator.saveSuccess"))
  }, [result, displayedText, saveToVault, form, language])

  const handleScheduleToCalendar = useCallback(() => {
    if (!result) return
    const text = (displayedText || result.content).trim()
    const todayIso = getTodayIsoDate()
    saveToVault({
      title: result.topic,
      content: text,
      platform: result.platform,
      tags: buildGeneratorVaultTags(text, result.contentType, form.getValues("salesAngle")),
      status: "scheduled",
      scheduledDate: todayIso,
    })
    toast.success(
      language === "my"
        ? `ယနေ့ (${todayIso}) ပြက္ခဒိန်တွင် စီစဉ်ပြီးပါပြီ`
        : `Scheduled to Calendar for Today (${todayIso})`
    )
  }, [result, displayedText, saveToVault, form, language])

  const handleCreatePoster = useCallback(() => {
    const activeText = (displayedText || result?.content || "").trim()
    if (!activeText) return
    const draft = extractPosterDraftFromPost(
      activeText,
      result?.topic || form.getValues("topic")
    )
    setPosterDraft(draft)
    setActivePageKey("studio")
  }, [displayedText, result, form, setPosterDraft, setActivePageKey])

  const handleSendToVoiceover = useCallback(() => {
    const activeText = (result?.content || displayedText || "").trim()
    if (!activeText) return
    setVoiceoverDraftScript(cleanVoiceoverText(activeText))
    setActivePageKey("voiceover")
  }, [displayedText, result, setVoiceoverDraftScript, setActivePageKey])

  const handleClearDraft = useCallback(() => {
    clearTextPostDraft()
    form.reset(useContentStore.getState().draftInput)
    setDisplayedText("")
    setTypewriterIndex(0)
    setIsTypewriting(false)
    setMobileView("create")
  }, [clearTextPostDraft, form])

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
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileView("result")
    }
    generate({
      topic: result.topic,
      platform: result.platform,
      contentType: result.contentType,
      tone: result.tone,
      salesAngle: values.salesAngle ?? "viral_story",
      businessCategory,
      customNiche: customNiche.trim() || undefined,
      language: values.language,
      includeHashtags: values.includeHashtags ?? true,
      targetDurationSeconds: values.targetDurationSeconds ?? 15,
      creativeAngleHint:
        "Use a completely fresh, different creative hook, storytelling angle, and phrasing compared to the previous version.",
    })
  }, [result, form, generate, businessCategory, customNiche])

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
      setIsExpanding(params.id === "expand_longer")
      setIsTypewriting(false)

      generate({
        topic: result?.topic || values.topic || "Social Media Post",
        platform: params.platform ?? result?.platform ?? values.platform,
        contentType: params.contentType ?? result?.contentType ?? values.contentType,
        tone: result?.tone ?? values.tone,
        salesAngle: values.salesAngle ?? "viral_story",
        businessCategory,
        customNiche: customNiche.trim() || undefined,
        language: selectedLang,
        includeHashtags: values.includeHashtags ?? true,
        targetDurationSeconds:
          params.id === "expand_longer"
            ? Math.round((values.targetDurationSeconds ?? 15) * 2)
            : values.targetDurationSeconds ?? 15,
        instruction: `${params.instruction}\n${languageDirective}`,
        currentContent: currentText,
      })
    },
    [result, displayedText, isGeneratingFlag, form, generate, businessCategory, customNiche]
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
  const contentToShow = isTypewriting
    ? displayedText
    : (result?.content ?? displayedText)
  const charCount = contentToShow.length
  const wordCount = contentToShow ? contentToShow.split(/\s+/).filter(Boolean).length : 0
  const activePlatform = result?.platform || formValues.platform || "instagram"
  const platformMeta = getPlatformMeta(activePlatform)
  const PlatformIcon = platformMeta.icon
  const selectedTone = formValues.tone
  const selectedSalesAngle = formValues.salesAngle ?? "viral_story"
  const copySections = extractCopySections(contentToShow)

  const hookLength = getOpeningHookLength(contentToShow)
  const fitsFbFold = hookLength <= FB_FOLD_LIMIT
  const platformLimit = getPlatformCharLimit(activePlatform)
  const isOverPlatformLimit = charCount > platformLimit
  const isNearPlatformLimit = !isOverPlatformLimit && charCount >= platformLimit * 0.85

  const trimmedSignature = brandSignature.trim()
  const isFooterApplied = Boolean(
    trimmedSignature && contentToShow.trimEnd().endsWith(trimmedSignature)
  )

  const handleToggleBrandFooter = useCallback(() => {
    if (!trimmedSignature) {
      toast(t(language, "generator.brandFooterEmpty"))
      return
    }
    const base = contentToShow.trimEnd()
    if (base.endsWith(trimmedSignature)) {
      const stripped = base.slice(0, base.length - trimmedSignature.length).trimEnd()
      updatePreviewContent(stripped)
    } else {
      const next = base ? `${base}\n\n${trimmedSignature}` : trimmedSignature
      updatePreviewContent(next)
    }
  }, [trimmedSignature, contentToShow, language, updatePreviewContent])

  const handleInsertHashtagPack = useCallback(
    (tags: readonly string[]) => {
      const missing = tags.filter((tag) => !contentToShow.includes(tag))
      if (missing.length === 0) {
        toast.success(t(language, "generator.hashtagsAdded"))
        return
      }
      const trimmed = contentToShow.trimEnd()
      const separator = !trimmed ? "" : /#[^\s#]+$/.test(trimmed) ? " " : "\n\n"
      updatePreviewContent(`${trimmed}${separator}${missing.join(" ")}`)
      toast.success(t(language, "generator.hashtagsAdded"))
    },
    [contentToShow, language, updatePreviewContent]
  )

  useEffect(() => {
    if (viewMode !== "editor") return
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`
  }, [contentToShow, viewMode])

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Mobile 2-Pill Create vs Result Switcher */}
      <div
        role="tablist"
        aria-label="Create or Result View"
        className="lg:hidden grid grid-cols-2 items-center rounded-xl border border-border/60 bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === "create"}
          onClick={() => setMobileView("create")}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer font-myanmar ${
            mobileView === "create"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t(language, "generator.tabCreate")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === "result"}
          onClick={() => setMobileView("result")}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer font-myanmar ${
            mobileView === "result"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t(language, "generator.tabResult")}</span>
          {(result || isGeneratingFlag) && (
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className={mobileView === "create" ? "flex flex-wrap items-center gap-2" : "hidden lg:flex flex-wrap items-center gap-2"}>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-relaxed mr-1">
          {t(language, "generator.templates")}
        </span>
        {QUICK_STARTERS.map((tpl) => (
          <Button
            key={tpl.title}
            variant="outline"
            size="sm"
            onClick={() => handleLoadTemplate(tpl)}
            className="flex items-center gap-1.5 h-8 text-xs leading-relaxed border-border/60 bg-card/80 hover:bg-accent/70"
          >
            <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            {tpl.title}
          </Button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        <div className={`w-full flex-1 min-w-0 ${mobileView === "create" ? "block" : "hidden lg:block"}`}>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="py-3 px-4 sm:py-4 sm:px-5 border-b border-border/60 flex flex-row items-start justify-between gap-3 space-y-0">
              <CardDescription className="text-xs sm:text-sm leading-relaxed">{t(language, "generator.desc")}</CardDescription>
              {(Boolean(formValues.topic?.trim()) || Boolean(result)) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearDraft}
                  disabled={isGeneratingFlag}
                  className="h-7 px-2.5 text-xs shrink-0 border-border/60 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                  <span>{language === "my" ? "Clear / ရှင်းမည်" : "Clear"}</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault()
                    if (!isGeneratingFlag) {
                      void form.handleSubmit(onSubmit)()
                    }
                  }
                }}
                className="grid gap-3 p-3.5 sm:p-5"
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="topic" className="leading-relaxed">{t(language, "generator.topic")}</Label>
                  <Input
                    id="topic"
                    placeholder={t(language, "generator.topicPlaceholder")}
                    className="border-border/60 font-myanmar"
                    {...form.register("topic")}
                  />
                  {form.formState.errors.topic && (
                    <span className="text-xs text-destructive leading-relaxed">
                      {form.formState.errors.topic.message}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="grid gap-1.5">
                    <Label htmlFor="platform" className="leading-relaxed text-xs">{t(language, "generator.platform")}</Label>
                    <Select id="platform" className="border-border/60 h-9 text-xs sm:text-sm" {...form.register("platform")}>
                      <option value="">{t(language, "generator.platform")}</option>
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="contentType" className="leading-relaxed text-xs">{t(language, "generator.contentType")}</Label>
                    <Select id="contentType" className="border-border/60 h-9 text-xs sm:text-sm" {...form.register("contentType")}>
                      <option value="">{t(language, "generator.contentType")}</option>
                      {CONTENT_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Target Duration Selector Pills (15s / 30s / 60s) */}
                <div className="grid gap-1.5">
                  <Label className="text-xs leading-relaxed flex items-center gap-1.5 font-myanmar">
                    <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span>{language === "my" ? "ကြာချိန် (စာသားအရှည်)" : "Target Duration"}</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Target Duration">
                    {([15, 30, 60] as const).map((sec) => {
                      const selectedDuration = form.watch("targetDurationSeconds") ?? 15
                      const isSelected = selectedDuration === sec
                      return (
                        <button
                          key={sec}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() =>
                            form.setValue("targetDurationSeconds", sec, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          className={`inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer font-myanmar ${
                            isSelected
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-xs"
                              : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent/70"
                          }`}
                        >
                          {language === "my" ? `${sec} စက္ကန့် (${sec}s)` : `${sec}s`}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Collapsible Options Panel (Niche, Angle, Tone, Output Language, Hashtags) */}
                <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOptionsOpen((prev) => !prev)}
                    aria-expanded={optionsOpen}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                      <span className="font-semibold font-myanmar">
                        ⚙️ {t(language, "generator.optionsToggle")}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        · {selectedTone || "engaging"} · {form.watch("language") || "english"}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150 ${
                        optionsOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {optionsOpen && (
                    <div className="grid gap-3 p-3 pt-2 border-t border-border/60 bg-background/40">
                      <div className="grid gap-1.5">
                        <Label htmlFor="creatorNiche" className="leading-relaxed font-myanmar text-xs">
                          {t(language, "settings.businessCategory")}
                        </Label>
                        <Select
                          id="creatorNiche"
                          value={businessCategory}
                          onChange={(e) => {
                            const nextCat = (e.target as HTMLSelectElement).value as BusinessCategory
                            setBusinessCategory(nextCat)
                            setAutoAppendShopCta(isShoppingCategory(nextCat))
                          }}
                          className="border-border/60 font-myanmar"
                        >
                          {BUSINESS_CATEGORIES.map((cat) => (
                            <option key={cat.value} value={cat.value}>
                              {language === "my" ? `${cat.labelMy} (${cat.label})` : cat.label}
                            </option>
                          ))}
                        </Select>
                        {businessCategory === "custom" && (
                          <Input
                            id="generatorCustomNiche"
                            type="text"
                            value={customNiche}
                            onChange={(e) => setCustomNiche(e.target.value)}
                            placeholder={t(language, "settings.customNichePlaceholder")}
                            className="border-border/60 font-myanmar text-sm"
                          />
                        )}
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-xs leading-relaxed">{t(language, "generator.salesAngle")}</Label>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t(language, "generator.salesAngle")}>
                          {SALES_ANGLES.map((angleOption) => {
                            const isSelected = selectedSalesAngle === angleOption.value
                            return (
                              <button
                                key={angleOption.value}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() =>
                                  form.setValue("salesAngle", angleOption.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer font-myanmar ${
                                  isSelected
                                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-transparent shadow-xs"
                                    : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent/70"
                                }`}
                              >
                                {language === "my" ? angleOption.labelMy : angleOption.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-xs leading-relaxed">{t(language, "generator.tone")}</Label>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t(language, "generator.tone")}>
                          {TONES.map((toneOption) => {
                            const isSelected = selectedTone === toneOption.value
                            return (
                              <button
                                key={toneOption.value}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() =>
                                  form.setValue("tone", toneOption.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all leading-relaxed cursor-pointer ${
                                  isSelected
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-sm shadow-blue-500/20"
                                    : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent/70"
                                }`}
                              >
                                {toneOption.label}
                              </button>
                            )
                          })}
                        </div>
                        {form.formState.errors.tone && (
                          <span className="text-xs text-destructive leading-relaxed">
                            {form.formState.errors.tone.message}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        <div className="grid gap-1.5">
                          <Label htmlFor="language" className="text-xs leading-relaxed">{t(language, "generator.language")}</Label>
                          <Select id="language" className="border-border/60" {...form.register("language")}>
                            {LANGUAGES.map((l) => (
                              <option key={l.value} value={l.value}>
                                {l.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex items-center h-10 px-3 rounded-md border border-border/60 bg-background/50">
                          <Label htmlFor="includeHashtags" className="flex items-center gap-2 cursor-pointer text-xs leading-relaxed w-full">
                            <input
                              id="includeHashtags"
                              type="checkbox"
                              {...form.register("includeHashtags")}
                              className="rounded border-input bg-background text-blue-600 focus:ring-blue-500"
                            />
                            <span>{t(language, "generator.includeHashtags")}</span>
                          </Label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    variant="default"
                    className="flex-1 min-h-[44px] rounded-xl font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 border-0"
                    disabled={isGeneratingFlag}
                  >
                    {isGeneratingFlag ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                        {t(language, "generator.generating")}
                      </>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <span>{t(language, "generator.generate")}</span>
                        <kbd className="hidden sm:inline-flex items-center rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-white/90">
                          ⌘↵
                        </kbd>
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!result || isGeneratingFlag}
                    onClick={handleRegenerate}
                    className="border-border/60"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    {t(language, "generator.regenerate")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div
          ref={previewRef}
          className={`w-full lg:w-[420px] shrink-0 flex-col gap-3 lg:sticky lg:top-6 lg:self-start scroll-mt-4 ${
            mobileView === "result" ? "flex" : "hidden lg:flex"
          }`}
        >
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="py-2.5 px-3.5 sm:py-3 sm:px-5 border-b border-border/60 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${platformMeta.badgeClass}`}>
                    <PlatformIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{platformMeta.label}</span>
                  </span>
                  {(result || displayedText) && (
                    <Badge variant="outline" className="text-[11px] font-normal border-border/60 bg-background/70">
                      {charCount} {t(language, "generator.characters")} · {wordCount} {t(language, "generator.words")}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs border-border/60 font-myanmar"
                      >
                        <History className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        <span className="hidden sm:inline">{t(language, "generator.recent")}</span>
                        {generatedHistory.length > 0 && (
                          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-medium">
                            {generatedHistory.length}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto p-1">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground font-myanmar">
                        {t(language, "generator.recentTitle")}
                      </div>
                      <DropdownMenuSeparator />
                      {generatedHistory.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground font-myanmar">
                          {t(language, "generator.recentEmpty")}
                        </div>
                      ) : (
                        generatedHistory.map((item) => {
                          const meta = getPlatformMeta(item.platform)
                          return (
                            <DropdownMenuItem
                              key={item.id}
                              onClick={() => handleRestoreRecent(item)}
                              className="flex flex-col items-start gap-1 py-2 px-2 cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="text-xs font-medium truncate font-myanmar">
                                  {item.topic || "Untitled"}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] shrink-0 ${meta.badgeClass}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1 w-full font-myanmar">
                                {item.content}
                              </p>
                            </DropdownMenuItem>
                          )
                        })
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant={viewMode === "editor" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("editor")}
                    aria-label="Editor view"
                    className={`h-8 px-2.5 ${
                      viewMode === "editor"
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-xs"
                        : "border-border/60"
                    }`}
                  >
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant={viewMode === "preview" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("preview")}
                    aria-label="Social post preview"
                    className={`h-8 px-2.5 ${
                      viewMode === "preview"
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-xs"
                        : "border-border/60"
                    }`}
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <CardTitle className="hidden sm:block text-sm font-semibold pt-1.5 leading-relaxed">
                {t(language, "generator.viewMode")}
              </CardTitle>
              <CardDescription className="hidden sm:block text-xs leading-relaxed">
                {t(language, "generator.previewDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[220px] sm:min-h-[280px] flex flex-col gap-3 p-3.5 sm:p-5">
              {isGeneratingFlag ? (
                <div className="flex flex-col gap-4 py-2" aria-busy="true" aria-label={loadingLabel}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full animate-shimmer shrink-0" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 w-28 rounded-md animate-shimmer" />
                        <div className="h-2.5 w-20 rounded-md animate-shimmer" />
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      {loadingLabel}
                    </span>
                  </div>
                  <div className="space-y-2.5 pt-2">
                    <div className="h-3.5 w-full rounded-md animate-shimmer" />
                    <div className="h-3.5 w-[92%] rounded-md animate-shimmer" />
                    <div className="h-3.5 w-[85%] rounded-md animate-shimmer" />
                    <div className="h-3.5 w-[95%] rounded-md animate-shimmer" />
                    <div className="h-3.5 w-[60%] rounded-md animate-shimmer" />
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-border/60">
                    <div className="h-3 w-14 rounded-md animate-shimmer" />
                    <div className="h-3 w-16 rounded-md animate-shimmer" />
                    <div className="h-3 w-14 rounded-md animate-shimmer" />
                  </div>
                </div>
              ) : !result && !displayedText ? (
                <div className="flex flex-1 min-h-[260px] flex-col items-center justify-center gap-4 text-center px-3 py-4">
                  <div className="h-14 w-14 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 max-w-xs">
                    <p className="text-sm font-semibold text-foreground leading-relaxed">
                      {t(language, "generator.emptyTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(language, "generator.emptyDesc")}
                    </p>
                  </div>
                  <div className="w-full max-w-sm space-y-2 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(language, "presets.title")}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        {
                          label: t(language, "presets.flashSale"),
                          topic: language === "my"
                            ? "ဒီနေ့တစ်ရက်တည်း 30% Off Flash Sale အထူးလျှော့ဈေး"
                            : "24-Hour Weekend Flash Sale — 30% Off All Best Sellers",
                          platform: "facebook" as const,
                          contentType: "post_caption" as const,
                          tone: "sales" as const,
                          language: language === "my" ? ("myanmar" as const) : ("english" as const),
                        },
                        {
                          label: t(language, "presets.newArrival"),
                          topic: language === "my"
                            ? "ပစ္စည်းသစ် ရောက်ရှိပါပြီ — အရည်အသွေးမြင့် Premium Collection"
                            : "New Arrival Showcase — Meet Our Latest Collection",
                          platform: "instagram" as const,
                          contentType: "post_caption" as const,
                          tone: "engaging" as const,
                          language: language === "my" ? ("myanmar" as const) : ("english" as const),
                        },
                        {
                          label: t(language, "presets.customerReview"),
                          topic: language === "my"
                            ? "ဝယ်ယူအားပေးသူ Customer များ၏ အမှန်တကယ် သုံးသပ်ချက်"
                            : "Real Customer Review: Why Buyers Love Our Product",
                          platform: "facebook" as const,
                          contentType: "post_caption" as const,
                          tone: "storytelling" as const,
                          language: language === "my" ? ("myanmar" as const) : ("english" as const),
                        },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleLoadTemplate(preset)}
                          className="flex items-center justify-between gap-2 w-full rounded-xl border border-border/60 bg-background/70 hover:bg-accent/60 hover:border-blue-500/30 px-3 py-2 text-left text-xs font-medium transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                            <span className="truncate">{preset.label}</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : viewMode === "editor" ? (
                <>
                  <textarea
                    ref={textareaRef}
                    value={contentToShow}
                    onChange={(e) => updatePreviewContent(e.target.value)}
                    placeholder={t(language, "generator.editablePlaceholder")}
                    aria-label={t(language, "generator.textEditor")}
                    rows={1}
                    className="w-full min-h-[180px] sm:min-h-[220px] max-h-[340px] sm:max-h-[420px] overflow-y-auto resize-none border-0 bg-transparent p-0 font-myanmar leading-[1.8] text-sm sm:text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                  />
                  {isTypewriting && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="animate-pulse">&#9647;</span>
                    </div>
                  )}
                </>
              ) : (
                <SocialPostPreview
                  content={contentToShow}
                  platform={result?.platform ?? "instagram"}
                  charCount={charCount}
                  wordCount={wordCount}
                />
              )}
              {(result || displayedText) && !isGeneratingFlag && contentToShow && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium font-myanmar ${
                      fitsFbFold
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {fitsFbFold ? (
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {t(
                        language,
                        fitsFbFold ? "generator.fbFoldFits" : "generator.fbFoldExceeds",
                        { count: String(hookLength) }
                      )}
                    </span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium font-myanmar ${
                      isOverPlatformLimit
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : isNearPlatformLimit
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "border-border/60 bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {(isOverPlatformLimit || isNearPlatformLimit) && (
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {t(
                        language,
                        isOverPlatformLimit
                          ? "generator.charLimitOver"
                          : isNearPlatformLimit
                            ? "generator.charLimitNear"
                            : "generator.charLimitOk",
                        {
                          platform: platformMeta.label,
                          count: charCount.toLocaleString(),
                          limit: platformLimit.toLocaleString(),
                        }
                      )}
                    </span>
                  </span>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t border-border/60 bg-muted/10 px-3 py-2.5 sm:px-5 sm:py-3 flex-col gap-2">
              {contentToShow && (
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  {(
                    [
                      { key: "hook", label: t(language, "generator.copyHook"), value: copySections.hook },
                      { key: "script", label: t(language, "generator.copyScript"), value: copySections.script },
                      { key: "caption", label: t(language, "generator.copyCaption"), value: copySections.caption },
                      { key: "all", label: t(language, "generator.copyAll"), value: copySections.all },
                    ] as const
                  ).map((item) => {
                    const isCopied = copiedStripKey === item.key
                    return (
                      <Button
                        key={item.key}
                        type="button"
                        variant={item.key === "all" ? "default" : "outline"}
                        size="sm"
                        disabled={!item.value || isGeneratingFlag}
                        onClick={() => handleQuickCopySection(item.key, item.value, item.label)}
                        className={`h-8 px-1.5 text-[11px] font-medium font-myanmar truncate ${
                          item.key === "all"
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0"
                            : "border-border/60 bg-background/80"
                        }`}
                      >
                        {isCopied ? (
                          <Check className="h-3 w-3 mr-1 shrink-0 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1 shrink-0" aria-hidden="true" />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Button>
                    )
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 w-full">
                <ReadAloudButton
                  text={contentToShow}
                  language={form.watch("language")}
                  disabled={isTypewriting || !contentToShow}
                  size="sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={isCopying || !contentToShow}
                  className="flex-1 min-w-[90px] border-border/60"
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
                  onClick={handleShare}
                  disabled={!contentToShow}
                  className="border-border/60"
                >
                  <Share2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.share")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToVault}
                  disabled={!result || !contentToShow}
                  className="flex-1 border-border/60"
                >
                  <Save className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.saveToVault")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScheduleToCalendar}
                  disabled={!result || !contentToShow}
                  className="border-border/60"
                >
                  <Calendar className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "vault.schedule")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={!result || isGeneratingFlag}
                  className="w-full h-9 text-xs font-medium border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-myanmar"
                >
                  {isGeneratingFlag && activeAction?.id === "regenerate" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {language === "my" ? "🔄 ထပ်ထုတ်မည်" : "🔄 Regenerate"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    runTransform({
                      kind: "refine",
                      id: "expand_longer",
                      instruction:
                        "Expand and enrich the following script/post to roughly 2x its current length with richer storytelling, clear product/content benefits, and a strong natural Burmese call-to-action (or English CTA if English) so it fills more spoken time naturally without filler.",
                    })
                  }
                  disabled={!contentToShow || isGeneratingFlag || isExpanding}
                  className="w-full h-9 text-xs font-medium border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-myanmar"
                >
                  {isExpanding ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {language === "my" ? "➕ ပိုရှည်ရှည် ရေးမည်" : "➕ Expand / Longer"}
                  </span>
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendToVoiceover}
                  disabled={!contentToShow || isGeneratingFlag}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white border-0 shadow-xs font-myanmar"
                >
                  <Mic className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.sendToVoiceover")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreatePoster}
                  disabled={!contentToShow || isGeneratingFlag}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-xs font-myanmar"
                >
                  <ImagePlus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {t(language, "generator.createPoster")}
                </Button>
              </div>
            </CardFooter>
          </Card>

          {(result || displayedText) && !isGeneratingFlag && (
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant={isFooterApplied ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleBrandFooter}
                  className={`w-full justify-between h-9 text-xs font-myanmar ${
                    isFooterApplied
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-xs"
                      : "border-border/60"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {isFooterApplied
                        ? t(language, "generator.removeBrandFooter")
                        : t(language, "generator.appendBrandFooter")}
                    </span>
                  </span>
                  {isFooterApplied && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </Button>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-myanmar">
                  <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t(language, "generator.hashtagPacksTitle")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MYANMAR_HASHTAG_PACKS.map((pack) => (
                    <Button
                      key={pack.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleInsertHashtagPack(pack.tags)}
                      className="h-auto py-1 px-2.5 text-xs rounded-full border-border/60 bg-background/80 hover:bg-accent/70 font-myanmar"
                    >
                      <Hash className="h-3 w-3 mr-1 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      {t(language, pack.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-xs">
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

function SocialPostPreview({
  content,
  platform,
  charCount,
  wordCount,
}: {
  content: string
  platform: string
  charCount: number
  wordCount: number
}) {
  const language = useUIStore((state) => state.language)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(false)
  const platformMeta = getPlatformMeta(platform)
  const PlatformIcon = platformMeta.icon

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 font-myanmar leading-[1.85] shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs shrink-0">
            <PlatformIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <div className="text-sm font-semibold truncate">{t(language, "preview.content_creator")}</div>
            <div className="text-[11px] text-muted-foreground">
              {platform === "instagram" ? t(language, "platform.instagram") : platformMeta.label} &#8226; {t(language, "preview.time_ago")}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-normal border-border/60 shrink-0">
          {charCount} · {wordCount}w
        </Badge>
      </div>
      <div className="text-sm mb-3">
        <p className="whitespace-pre-wrap break-words">
          {content.length > 200 && !expanded ? `${content.slice(0, 200)}...` : content}
        </p>
        {content.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-4 mt-1 flex items-center gap-1"
          >
            {expanded ? t(language, "preview.see_less") : t(language, "preview.see_more")}
          </button>
        )}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLiked(!liked)}
            className="flex items-center gap-1.5 text-xs transition-colors"
          >
            <ThumbsUp className={`h-3 w-3 ${liked ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
            <span className={liked ? "text-destructive font-medium" : "text-muted-foreground"}>{t(language, "preview.like")}</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400">
            <MessageCircle className="h-3 w-3" aria-hidden="true" />
            <span>{t(language, "preview.comment")}</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400">
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

