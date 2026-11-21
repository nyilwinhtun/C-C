"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check,
  Columns2,
  Download,
  Eraser,
  Flame,
  ImagePlus,
  Loader2,
  MessageSquareQuote,
  Palette,
  RefreshCw,
  RotateCcw,
  Rows2,
  Share2,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  Type,
  LayoutTemplate,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { t } from "@/locales/translations"
import { generateProductScene, suggestFromPhoto } from "@/api/aiService"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { isShoppingCategory } from "@/types"
import { renderPosterCanvas } from "./posterRenderer"
import {
  BRAND_THEMES,
  type AspectRatioId,
  type BrandThemeId,
  type ControlTabId,
  type PosterFontStyle,
  type PosterState,
  type PosterTemplateId,
} from "./types"

const TEMPLATE_OPTIONS: {
  id: PosterTemplateId
  label: string
  labelMy: string
  icon: typeof LayoutTemplate
}[] = [
  {
    id: "spotlight",
    label: "Spotlight / Topic Cover",
    labelMy: "အထူးပြ / ခေါင်းစဉ်ကတ်",
    icon: LayoutTemplate,
  },
  {
    id: "flash_sale",
    label: "Flash Sale",
    labelMy: "အထူးလျှော့ဈေး",
    icon: Flame,
  },
  {
    id: "before_after",
    label: "Before / After",
    labelMy: "မတိုင်ခင် / ပြီးနောက်",
    icon: Columns2,
  },
  {
    id: "review",
    label: "Review / Quote Card",
    labelMy: "မှတ်ချက် / Quote ကတ်",
    icon: MessageSquareQuote,
  },
]

const CONTROL_TABS: {
  id: ControlTabId
  labelKey: string
  icon: typeof LayoutTemplate
}[] = [
  { id: "template", labelKey: "photoStudio.tabTemplate", icon: LayoutTemplate },
  { id: "scene_bg", labelKey: "photoStudio.tabScene", icon: Sparkles },
  { id: "text_price", labelKey: "photoStudio.tabText", icon: Type },
  { id: "theme_color", labelKey: "photoStudio.tabTheme", icon: Palette },
  { id: "shop_footer", labelKey: "photoStudio.tabFooter", icon: Store },
]

const STUDIO_BACKDROPS = [
  { id: "white", color: "#FFFFFF", labelKey: "photoStudio.backdropWhite" },
  { id: "slate", color: "#E2E8F0", labelKey: "photoStudio.backdropSlate" },
  { id: "indigo", color: "#312E81", labelKey: "photoStudio.backdropIndigo" },
  { id: "sunset", color: "#F59E0B", labelKey: "photoStudio.backdropSunset" },
  { id: "emerald", color: "#065F46", labelKey: "photoStudio.backdropEmerald" },
  { id: "black", color: "#09090B", labelKey: "photoStudio.backdropBlack" },
] as const

const SCENE_PRESETS = [
  {
    id: "white",
    labelKey: "photoStudio.scenePresetWhite",
    prompt: "Clean minimalist pure white studio tabletop with soft diffused commercial lighting and subtle natural contact shadow",
  },
  {
    id: "desk",
    labelKey: "photoStudio.scenePresetDesk",
    prompt: "Modern minimalist dark oak tech desk setup with soft ambient LED rim light, sleek matte desk mat, and shallow depth-of-field background",
  },
  {
    id: "marble",
    labelKey: "photoStudio.scenePresetMarble",
    prompt: "Luxury cream Carrara marble vanity surface with warm golden sunlight beams and soft botanical shadows",
  },
  {
    id: "cafe",
    labelKey: "photoStudio.scenePresetCafe",
    prompt: "Warm rustic wooden cafe table with cozy golden hour ambient light and softly blurred warm cafe interior background",
  },
] as const

async function compositeCutoutWithBackdrop(
  cutoutUrl: string,
  backdropHex: string
): Promise<string> {
  const img = await loadImageElement(cutoutUrl)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth || 1080
  canvas.height = img.naturalHeight || 1080
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")
  ctx.fillStyle = backdropHex
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}

async function compressLogoToDataUrl(file: File, maxDim = 240): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas context unavailable")
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function formatShopProfileLine(profile?: {
  name?: string
  phone?: string
  address?: string
}): string {
  if (!profile) return ""
  return [profile.name?.trim(), profile.phone?.trim(), profile.address?.trim()]
    .filter(Boolean)
    .join(" • ")
}

export function PhotoStudioPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const {
    shopProfile,
    brandSignature,
    businessCategory,
    posterDraft,
    setPosterDraft,
    shopLogoDataUrl,
    setShopLogoDataUrl,
  } = useContentStore(
    useShallow((state) => ({
      shopProfile: state.shopProfile,
      brandSignature: state.brandSignature,
      businessCategory: state.businessCategory,
      posterDraft: state.posterDraft,
      setPosterDraft: state.setPosterDraft,
      shopLogoDataUrl: state.shopLogoDataUrl,
      setShopLogoDataUrl: state.setShopLogoDataUrl,
    }))
  )

  const isShop = isShoppingCategory(businessCategory)
  const [activeTab, setActiveTab] = useState<ControlTabId>("template")
  const [hasCustomFooter, setHasCustomFooter] = useState(false)

  const savedFooterLine =
    formatShopProfileLine(shopProfile) || brandSignature.trim()

  const [poster, setPoster] = useState<PosterState>(() => ({
    template: "spotlight",
    aspectRatio: "1:1",
    theme: "clean_white",
    title: isShop
      ? "Premium Daily Essential"
      : isMy
        ? "နေ့စဉ်တိုးတက်စေမယ့် နည်းလမ်း ၃ ချက်"
        : "3 Daily Habits That Changed Everything",
    subtitle: isShop
      ? isMy
        ? "အရည်အသွေးမြင့် • နေ့စဉ်သုံး"
        : "High quality • Ready to ship"
      : isMy
        ? "သိမ်းထားပြီး လက်တွေ့သုံးကြည့်ပါ • Creator Notes"
        : "Save for later • Episode / Topic Notes",
    showPriceBadge: isShop,
    priceTag: isShop ? "35,000 Ks" : "",
    originalPrice: "48,000 Ks",
    showNewArrivalPill: true,
    pillBadgeText: isShop ? "NEW ARRIVAL" : "EPISODE / TIP",
    promoBadgeText: isMy ? "အထူးလျှော့ဈေး" : "FLASH SALE",
    splitDirection: "side-by-side",
    beforeLabel: "BEFORE",
    afterLabel: "AFTER",
    reviewQuote: isShop
      ? isMy
        ? "ပစ္စည်းအရမ်းကောင်းပြီး ပို့ဆောင်မှုလည်း မြန်ဆန်ပါတယ်။ ထပ်မှာဦးမယ်!"
        : "Amazing quality and super fast delivery! Will definitely order again."
      : isMy
        ? "တစ်နေ့ကို နည်းနည်းချင်း ပုံမှန်လုပ်သွားရင် ရလဒ်ကောင်းတွေ သေချာပေါက် ရလာမှာပါ။"
        : "Consistency beats intensity. Focus on one small step every single day.",
    reviewerName: isShop
      ? isMy
        ? "Su Myat • Yangon"
        : "Verified Buyer"
      : isMy
        ? "Creator Note"
        : "Creator Note",
    showStarRating: isShop,
    showShopFooter: true,
    shopFooterText:
      savedFooterLine ||
      (isShop ? "My Online Shop • Inbox to Order" : "Creator Studio • Follow for More"),
    showShopLogo: true,
    fontStyle: "modern_clean",
    showCodBadge: isShop,
    codBadgeText: "COD Available / အိမ်အရောက်ငွေချေ",
  }))

  const [primaryDataUrl, setPrimaryDataUrl] = useState<string | null>(null)
  const [originalPrimaryDataUrl, setOriginalPrimaryDataUrl] = useState<string | null>(null)
  const [cutoutDataUrl, setCutoutDataUrl] = useState<string | null>(null)
  const [backdropColor, setBackdropColor] = useState<string>("#FFFFFF")
  const [isRemovingBg, setIsRemovingBg] = useState(false)
  const [scenePrompt, setScenePrompt] = useState("")
  const [selectedScenePreset, setSelectedScenePreset] = useState<string | null>(null)
  const [isGeneratingScene, setIsGeneratingScene] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [aiCaption, setAiCaption] = useState("")
  const [secondaryDataUrl, setSecondaryDataUrl] = useState<string | null>(null)
  const [primaryImg, setPrimaryImg] = useState<HTMLImageElement | null>(null)
  const [secondaryImg, setSecondaryImg] = useState<HTMLImageElement | null>(null)
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const primaryInputRef = useRef<HTMLInputElement | null>(null)
  const secondaryInputRef = useRef<HTMLInputElement | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-sync saved shopProfile from Settings unless manually overridden
  useEffect(() => {
    if (hasCustomFooter) return
    const trimmed = savedFooterLine.trim()
    if (trimmed) {
      setPoster((prev) => ({ ...prev, shopFooterText: trimmed }))
    }
  }, [savedFooterLine, hasCustomFooter])

  // Consume shared posterDraft from Text Generator
  useEffect(() => {
    if (!posterDraft) return
    setPoster((prev) => ({
      ...prev,
      title: posterDraft.headline || prev.title,
      subtitle:
        [posterDraft.spec1, posterDraft.spec2].filter(Boolean).join(" • ") ||
        prev.subtitle,
    }))
    setPosterDraft(null)
    toast.success(
      isMy ? "စာသားဒီဇိုင်းကို Poster ထဲသို့ ထည့်သွင်းပြီးပါပြီ" : "Draft loaded into Poster Studio"
    )
  }, [posterDraft, setPosterDraft, isMy])

  // Load primary image
  useEffect(() => {
    if (!primaryDataUrl) {
      setPrimaryImg(null)
      return
    }
    let cancelled = false
    loadImageElement(primaryDataUrl)
      .then((img) => {
        if (!cancelled) setPrimaryImg(img)
      })
      .catch(() => {
        if (!cancelled) toast.error(isMy ? "ပုံဖွင့်၍မရပါ" : "Could not load image")
      })
    return () => {
      cancelled = true
    }
  }, [primaryDataUrl, isMy])

  // Load secondary image (for Before/After)
  useEffect(() => {
    if (!secondaryDataUrl) {
      setSecondaryImg(null)
      return
    }
    let cancelled = false
    loadImageElement(secondaryDataUrl)
      .then((img) => {
        if (!cancelled) setSecondaryImg(img)
      })
      .catch(() => {
        if (!cancelled) toast.error(isMy ? "ပုံဖွင့်၍မရပါ" : "Could not load image")
      })
    return () => {
      cancelled = true
    }
  }, [secondaryDataUrl, isMy])

  // Load persisted Shop Logo image
  useEffect(() => {
    if (!shopLogoDataUrl) {
      setLogoImg(null)
      return
    }
    let cancelled = false
    loadImageElement(shopLogoDataUrl)
      .then((img) => {
        if (!cancelled) setLogoImg(img)
      })
      .catch(() => {
        if (!cancelled) setLogoImg(null)
      })
    return () => {
      cancelled = true
    }
  }, [shopLogoDataUrl])

  // Re-render HTML5 Canvas whenever poster state or images change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderPosterCanvas(canvas, poster, primaryImg, secondaryImg, logoImg)
  }, [poster, primaryImg, secondaryImg, logoImg])

  const updatePoster = useCallback(
    <K extends keyof PosterState>(key: K, value: PosterState[K]) => {
      setPoster((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleImageFile = useCallback(
    (file: File | undefined, slot: "primary" | "secondary") => {
      if (!file) return
      if (!file.type.startsWith("image/")) {
        toast.error(isMy ? "ပုံဖိုင် (JPG/PNG/WEBP) သာ ရွေးချယ်ပါ" : "Please select a valid image file")
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : null
        if (!result) return
        if (slot === "primary") {
          setPrimaryDataUrl(result)
          setOriginalPrimaryDataUrl(result)
          setCutoutDataUrl(null)
        } else {
          setSecondaryDataUrl(result)
        }
      }
      reader.readAsDataURL(file)
    },
    [isMy]
  )

  const handleRemoveBackground = useCallback(async () => {
    const sourceUrl = originalPrimaryDataUrl ?? primaryDataUrl
    if (!sourceUrl) {
      toast.error(t(language, "photoStudio.sceneUploadFirst"))
      return
    }
    setIsRemovingBg(true)
    try {
      const { removeBackground } = await import("@imgly/background-removal")
      const res = await fetch(sourceUrl)
      const blob = await res.blob()
      const cutoutBlob = await removeBackground(blob)
      const cutoutUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () =>
          typeof r.result === "string" ? resolve(r.result) : reject(new Error("Read failed"))
        r.onerror = () => reject(new Error("Read failed"))
        r.readAsDataURL(cutoutBlob)
      })
      setCutoutDataUrl(cutoutUrl)
      const composited = await compositeCutoutWithBackdrop(cutoutUrl, backdropColor)
      setPrimaryDataUrl(composited)
      toast.success(t(language, "photoStudio.cutoutSuccess"))
    } catch (err) {
      console.error("Local background removal failed:", err)
      toast.error(t(language, "photoStudio.cutoutError"))
    } finally {
      setIsRemovingBg(false)
    }
  }, [originalPrimaryDataUrl, primaryDataUrl, backdropColor, language])

  const handleSelectBackdrop = useCallback(
    async (hex: string) => {
      setBackdropColor(hex)
      if (!cutoutDataUrl) return
      try {
        const composited = await compositeCutoutWithBackdrop(cutoutDataUrl, hex)
        setPrimaryDataUrl(composited)
      } catch (err) {
        console.error("Failed to composite backdrop:", err)
      }
    },
    [cutoutDataUrl]
  )

  const handleGenerateAiScene = useCallback(async () => {
    const sourceUrl = originalPrimaryDataUrl ?? primaryDataUrl
    if (!sourceUrl) {
      toast.error(t(language, "photoStudio.sceneUploadFirst"))
      return
    }
    const promptToUse = scenePrompt.trim()
    if (!promptToUse) return

    setIsGeneratingScene(true)
    try {
      const mimeMatch = sourceUrl.match(/^data:([^;]+);base64,/)
      const result = await generateProductScene({
        imageBase64: sourceUrl,
        mimeType: mimeMatch?.[1] || "image/jpeg",
        scenePrompt: promptToUse,
      })
      setCutoutDataUrl(null)
      setPrimaryDataUrl(result.imageDataUrl)
      toast.success(t(language, "photoStudio.sceneGenerateSuccess"))
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t(language, "photoStudio.sceneGenerateError")
      toast.error(msg)
    } finally {
      setIsGeneratingScene(false)
    }
  }, [originalPrimaryDataUrl, primaryDataUrl, scenePrompt, language])

  const handleAiSuggest = useCallback(async () => {
    const sourceUrl = originalPrimaryDataUrl ?? primaryDataUrl
    if (!sourceUrl) {
      toast.error(t(language, "photoStudio.sceneUploadFirst"))
      return
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(sourceUrl)
    if (!match) return
    setIsSuggesting(true)
    try {
      const suggestion = await suggestFromPhoto({
        imageBase64: match[2],
        mimeType: match[1],
        language,
      })
      setPoster((prev) => ({
        ...prev,
        title: suggestion.headline || prev.title,
        subtitle:
          [suggestion.spec1, suggestion.spec2, suggestion.spec3].filter(Boolean).join(" • ") ||
          prev.subtitle,
        priceTag: suggestion.suggestedPrice || prev.priceTag,
        showPriceBadge: suggestion.suggestedPrice ? true : prev.showPriceBadge,
      }))
      setAiCaption(suggestion.caption ?? "")
      toast.success(t(language, "photoStudio.aiSuggestDone"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(language, "photoStudio.aiSuggestFailed"))
    } finally {
      setIsSuggesting(false)
    }
  }, [originalPrimaryDataUrl, primaryDataUrl, language])

  const handleCopyAiCaption = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aiCaption)
      toast.success(t(language, "postWriter.toast.copied"))
    } catch {
      toast.error(t(language, "postWriter.toast.copyFailed"))
    }
  }, [aiCaption, language])

  const handleRevertToOriginal = useCallback(() => {
    if (!originalPrimaryDataUrl) return
    setPrimaryDataUrl(originalPrimaryDataUrl)
    setCutoutDataUrl(null)
  }, [originalPrimaryDataUrl])

  const handleLogoFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (!file.type.startsWith("image/")) {
        toast.error(isMy ? "ပုံဖိုင် (PNG/JPG/WEBP) သာ ရွေးချယ်ပါ" : "Please select a valid image file")
        return
      }
      try {
        const compressed = await compressLogoToDataUrl(file)
        setShopLogoDataUrl(compressed)
        updatePoster("showShopLogo", true)
        toast.success(isMy ? "ဆိုင်လိုဂို ထည့်သွင်းပြီးပါပြီ" : "Shop logo saved")
      } catch {
        toast.error(isMy ? "လိုဂိုဖတ်၍မရပါ" : "Could not process logo image")
      }
    },
    [isMy, setShopLogoDataUrl, updatePoster]
  )

  const handleDownloadPng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Ensure canvas is freshly rendered at full resolution before export
    renderPosterCanvas(canvas, poster, primaryImg, secondaryImg, logoImg)

    const filename = `poster-${poster.template}-${poster.aspectRatio.replace(":", "x")}-${Date.now()}.png`

    const triggerLink = (href: string, revokeAfter = false) => {
      const link = document.createElement("a")
      link.download = filename
      link.href = href
      link.rel = "noopener"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (revokeAfter) {
        window.setTimeout(() => URL.revokeObjectURL(href), 2000)
      }
      toast.success(isMy ? "Poster PNG ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ" : "Poster PNG downloaded!")
    }

    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            triggerLink(url, true)
          } else {
            triggerLink(canvas.toDataURL("image/png"))
          }
        },
        "image/png",
        1.0
      )
      return
    }

    triggerLink(canvas.toDataURL("image/png"))
  }, [poster, primaryImg, secondaryImg, logoImg, isMy])

  const handleSharePoster = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    renderPosterCanvas(canvas, poster, primaryImg, secondaryImg, logoImg)
    const filename = `poster-${poster.template}-${poster.aspectRatio.replace(":", "x")}-${Date.now()}.png`

    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((b) => resolve(b), "image/png", 1.0)
      } else {
        resolve(null)
      }
    })

    if (!blob) {
      handleDownloadPng()
      return
    }

    const file = new File([blob], filename, { type: "image/png" })
    const shareData: ShareData = {
      files: [file],
      title: poster.title.trim() || "Online Shop Poster",
      text: [poster.title.trim(), poster.priceTag.trim(), poster.shopFooterText.trim()]
        .filter(Boolean)
        .join(" • "),
    }

    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))

    if (!canNativeShare) {
      handleDownloadPng()
      return
    }

    try {
      await navigator.share(shareData)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      handleDownloadPng()
    }
  }, [poster, primaryImg, secondaryImg, logoImg, handleDownloadPng])

  const handleSyncBrandSignature = () => {
    const trimmed = savedFooterLine.trim()
    setHasCustomFooter(false)
    updatePoster(
      "shopFooterText",
      trimmed || "My Online Shop • Inbox to Order"
    )
    toast.success(
      trimmed
        ? isMy
          ? "Settings မှ ဆိုင်အမည်ကို ထည့်သွင်းပြီးပါပြီ"
          : "Synced from Settings"
        : isMy
          ? "Settings တွင် ဆိုင်အချက်အလက် မထည့်ရသေးပါ"
          : "No shop contact info saved in Settings yet"
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-4">
      {/* Compact Header Bar: Aspect Ratio Switcher + 1-Tap PNG Download */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          {(["1:1", "4:5", "9:16"] as AspectRatioId[]).map((ratio) => {
            const active = poster.aspectRatio === ratio
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => updatePoster("aspectRatio", ratio)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {ratio === "1:1"
                  ? t(language, "photoStudio.ratioSquare")
                  : ratio === "4:5"
                    ? t(language, "photoStudio.ratioPortrait")
                    : "9:16 Story / TikTok"}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSharePoster}
            className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold border-border/70"
          >
            <Share2 className="h-3.5 w-3.5" />
            {isMy ? "1-Tap မျှဝေမည်" : "1-Tap Share"}
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadPng}
            className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" />
            {isMy ? "PNG ဒေါင်းလုဒ်" : "Download PNG"}
          </Button>
        </div>
      </div>

      {/* Main Responsive Studio Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        {/* Live Canvas Preview (Compactly sticky at top on mobile while editing inputs) */}
        <div className="lg:col-span-5 sticky top-0 z-20 bg-background/95 backdrop-blur-md pb-2 pt-0.5 lg:top-4 lg:bg-transparent lg:backdrop-blur-none lg:pb-0 lg:pt-0 space-y-2.5">
          <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/30 p-2 sm:p-3">
            <canvas
              ref={canvasRef}
              className={cn(
                "block rounded-xl shadow-md transition-all duration-200",
                poster.aspectRatio === "1:1"
                  ? "aspect-square max-h-[210px] sm:max-h-[340px] lg:max-h-[440px] w-auto max-w-full"
                  : poster.aspectRatio === "4:5"
                    ? "aspect-[4/5] max-h-[220px] sm:max-h-[380px] lg:max-h-[480px] w-auto max-w-full"
                    : "aspect-[9/16] max-h-[230px] sm:max-h-[380px] lg:max-h-[480px] w-auto max-w-full"
              )}
            />
          </div>

          {/* Quick Image Upload Strip */}
          <input
            ref={primaryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleImageFile(e.target.files?.[0], "primary")
              e.target.value = ""
            }}
          />
          <input
            ref={secondaryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleImageFile(e.target.files?.[0], "secondary")
              e.target.value = ""
            }}
          />

          {poster.template === "before_after" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => primaryInputRef.current?.click()}
                  className="h-9 flex-1 gap-1.5 text-xs"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {primaryDataUrl ? t(language, "photoStudio.changeBefore") : t(language, "photoStudio.beforePhoto")}
                </Button>
                {primaryDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setPrimaryDataUrl(null)}
                    aria-label="Remove Before photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => secondaryInputRef.current?.click()}
                  className="h-9 flex-1 gap-1.5 text-xs"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {secondaryDataUrl ? t(language, "photoStudio.changeAfter") : t(language, "photoStudio.afterPhoto")}
                </Button>
                {secondaryDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setSecondaryDataUrl(null)}
                    aria-label="Remove After photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => primaryInputRef.current?.click()}
                className="h-9 flex-1 gap-1.5 text-xs font-medium"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {primaryDataUrl
                  ? isMy
                    ? "ပုံပြောင်းမည်"
                    : "Change Product Photo"
                  : isMy
                    ? "ပစ္စည်းပုံ ထည့်မည်"
                    : "Upload Product Photo"}
              </Button>
              {primaryDataUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrimaryDataUrl(null)}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {primaryDataUrl && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAiSuggest()}
                  disabled={isSuggesting}
                  className="h-9 w-full gap-1.5 text-xs font-medium font-myanmar"
                >
                  {isSuggesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t(language, "photoStudio.aiSuggestBtn")}
                </Button>
                {aiCaption && (
                  <div className="rounded-xl border border-[#18181B]/10 dark:border-[#FAF8F5]/10 bg-[#FAF8F5] dark:bg-[#27272A]/60 p-3">
                    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground font-myanmar">
                      {aiCaption}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCopyAiCaption()}
                      className="mt-1.5 h-7 px-2 text-[11px]"
                    >
                      {t(language, "generator.copy")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>

        {/* Compact Horizontal-Pill Tabbed Controls */}
        <div className="lg:col-span-7 space-y-3">
          {/* Horizontal Pill Navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {CONTROL_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(language, tab.labelKey)}
                </button>
              )
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-sm">
            {activeTab === "scene_bg" && (
              <div className="space-y-4">
                {/* 1. Local Background Removal (No API Quota) */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Eraser className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold">
                        {t(language, "photoStudio.cutoutTitle")}
                      </span>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t(language, "photoStudio.cutoutBadge")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(language, "photoStudio.cutoutDesc")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!primaryDataUrl || isRemovingBg || isGeneratingScene}
                      onClick={handleRemoveBackground}
                      className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                    >
                      {isRemovingBg ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>{t(language, "photoStudio.cutoutProcessing")}</span>
                        </>
                      ) : (
                        <>
                          <Eraser className="h-3.5 w-3.5" />
                          <span>{t(language, "photoStudio.cutoutBtn")}</span>
                        </>
                      )}
                    </Button>
                    {originalPrimaryDataUrl && primaryDataUrl !== originalPrimaryDataUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleRevertToOriginal}
                        className="h-8 gap-1 text-xs text-muted-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{t(language, "photoStudio.sceneResetOriginal")}</span>
                      </Button>
                    )}
                  </div>

                  {cutoutDataUrl && (
                    <div className="space-y-1.5 pt-2 border-t border-border/60">
                      <Label className="text-[11px] text-muted-foreground">
                        {t(language, "photoStudio.backdropPickerLabel")}
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {STUDIO_BACKDROPS.map((b) => {
                          const active = backdropColor === b.color
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => handleSelectBackdrop(b.color)}
                              title={t(language, b.labelKey)}
                              className={cn(
                                "h-7 w-7 rounded-full border-2 transition-transform cursor-pointer",
                                active
                                  ? "border-primary scale-110 ring-2 ring-primary/30"
                                  : "border-border hover:scale-105"
                              )}
                              style={{ backgroundColor: b.color }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. AI Scene Studio */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">
                      {t(language, "photoStudio.sceneStudioTitle")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(language, "photoStudio.sceneStudioDesc")}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCENE_PRESETS.map((preset) => {
                      const active = selectedScenePreset === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={!primaryDataUrl || isGeneratingScene}
                          onClick={() => {
                            setSelectedScenePreset(preset.id)
                            setScenePrompt(preset.prompt)
                          }}
                          className={cn(
                            "rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted/60"
                          )}
                        >
                          {t(language, preset.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      {t(language, "photoStudio.sceneCustomLabel")}
                    </Label>
                    <Textarea
                      value={scenePrompt}
                      onChange={(e) => {
                        setScenePrompt(e.target.value)
                        setSelectedScenePreset(null)
                      }}
                      rows={2}
                      placeholder={t(language, "photoStudio.sceneCustomPlaceholder")}
                      className="min-h-[60px] text-xs bg-background"
                      disabled={!primaryDataUrl || isGeneratingScene}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!primaryDataUrl || !scenePrompt.trim() || isGeneratingScene || isRemovingBg}
                    onClick={handleGenerateAiScene}
                    className="w-full h-9 gap-1.5 rounded-lg text-xs font-semibold"
                  >
                    {isGeneratingScene ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{t(language, "photoStudio.sceneGenerating")}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t(language, "photoStudio.sceneGenerateBtn")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "template" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATE_OPTIONS.map((tpl) => {
                    const Icon = tpl.icon
                    const selected = poster.template === tpl.id
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => updatePoster("template", tpl.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "border-border bg-background hover:bg-muted/60"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-semibold leading-tight">
                          {isMy ? tpl.labelMy : tpl.label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {poster.template === "before_after" && (
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-2.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isMy ? "ပုံစီစဉ်မှု" : "Split Layout"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster("splitDirection", "side-by-side")
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium",
                          poster.splitDirection === "side-by-side"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        )}
                      >
                        <Columns2 className="h-3.5 w-3.5" />
                        {t(language, "photoStudio.sideBySide")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster("splitDirection", "top-bottom")
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium",
                          poster.splitDirection === "top-bottom"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        )}
                      >
                        <Rows2 className="h-3.5 w-3.5" />
                        {t(language, "photoStudio.topBottom")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "text_price" && (
              <div className="space-y-3">
                {poster.template !== "review" && (
                  <div className="space-y-1">
                    <Label htmlFor="poster-title" className="text-xs">
                      {isMy ? "ခေါင်းစဉ် / ပစ္စည်းအမည်" : "Headline / Topic Title"}
                    </Label>
                    <Input
                      id="poster-title"
                      value={poster.title}
                      onChange={(e) => updatePoster("title", e.target.value)}
                      placeholder="e.g. Ep 05: Morning Routine or Glow Serum"
                      className="h-9 text-sm"
                    />
                  </div>
                )}

                {poster.template === "spotlight" && (
                  <>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="poster-subtitle" className="text-xs">
                          {isMy ? "အသေးစိတ်စာတို" : "Short Subtitle"}
                        </Label>
                        <Input
                          id="poster-subtitle"
                          value={poster.subtitle}
                          onChange={(e) =>
                            updatePoster("subtitle", e.target.value)
                          }
                          placeholder="Save for later • Key takeaway"
                          className="h-9 text-sm"
                        />
                      </div>
                      {poster.showPriceBadge && (
                        <div className="space-y-1">
                          <Label htmlFor="poster-price" className="text-xs">
                            {isMy ? "ဈေးနှုန်း (Optional)" : "Price Tag (Optional)"}
                          </Label>
                          <Input
                            id="poster-price"
                            value={poster.priceTag}
                            onChange={(e) =>
                              updatePoster("priceTag", e.target.value)
                            }
                            placeholder="35,000 Ks"
                            className="h-9 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster(
                            "showNewArrivalPill",
                            !poster.showNewArrivalPill
                          )
                        }
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          poster.showNewArrivalPill
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {isMy ? "ထိပ်တန်းတံဆိပ်ပြမည်" : "Show Top Badge Pill"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster("showPriceBadge", !poster.showPriceBadge)
                        }
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          poster.showPriceBadge
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {isMy ? "ဈေးနှုန်းတံဆိပ်ပြမည်" : "Show Price Badge"}
                      </button>
                    </div>

                    {poster.showNewArrivalPill && (
                      <div className="space-y-1">
                        <Label htmlFor="poster-pill-text" className="text-xs">
                          {isMy ? "တံဆိပ်စာသား (ဥပမာ - EPISODE 01 / KEY TIP / NEW ARRIVAL)" : "Badge Pill Text"}
                        </Label>
                        <Input
                          id="poster-pill-text"
                          value={poster.pillBadgeText}
                          onChange={(e) =>
                            updatePoster("pillBadgeText", e.target.value)
                          }
                          placeholder="EPISODE 01 / KEY TIP / NEW ARRIVAL"
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </>
                )}

                {poster.template === "flash_sale" && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="promo-badge" className="text-xs">
                        {isMy ? "Promo တံဆိပ်" : "Promo Badge"}
                      </Label>
                      <Input
                        id="promo-badge"
                        value={poster.promoBadgeText}
                        onChange={(e) =>
                          updatePoster("promoBadgeText", e.target.value)
                        }
                        placeholder="FLASH SALE"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="orig-price" className="text-xs">
                        {isMy ? "မူလဈေး (ခြစ်ချမည်)" : "Original Price"}
                      </Label>
                      <Input
                        id="orig-price"
                        value={poster.originalPrice}
                        onChange={(e) =>
                          updatePoster("originalPrice", e.target.value)
                        }
                        placeholder="48,000 Ks"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sale-price" className="text-xs">
                        {isMy ? "လျှော့ဈေး" : "Promo Price"}
                      </Label>
                      <Input
                        id="sale-price"
                        value={poster.priceTag}
                        onChange={(e) =>
                          updatePoster("priceTag", e.target.value)
                        }
                        placeholder="35,000 Ks"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                )}

                {poster.template === "before_after" && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="before-label" className="text-xs">
                        {t(language, "photoStudio.beforeLabel")}
                      </Label>
                      <Input
                        id="before-label"
                        value={poster.beforeLabel}
                        onChange={(e) =>
                          updatePoster("beforeLabel", e.target.value)
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="after-label" className="text-xs">
                        {t(language, "photoStudio.afterLabel")}
                      </Label>
                      <Input
                        id="after-label"
                        value={poster.afterLabel}
                        onChange={(e) =>
                          updatePoster("afterLabel", e.target.value)
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                )}

                {poster.template === "review" && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster("showStarRating", !poster.showStarRating)
                        }
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          poster.showStarRating
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Star className="h-3.5 w-3.5" />
                        {isMy ? "ကြယ် ၅ ပွင့်ပြမည် (Review Mode)" : "Show 5-Star Rating (Review Mode)"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePoster("showPriceBadge", !poster.showPriceBadge)
                        }
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          poster.showPriceBadge
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        {isMy ? "ဈေးနှုန်းတံဆိပ်ပြမည်" : "Show Price Badge"}
                      </button>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="review-quote" className="text-xs">
                        {isMy ? "မှတ်ချက် / Quote / Tip စာသား" : "Quote / Review / Tip Text"}
                      </Label>
                      <Textarea
                        id="review-quote"
                        rows={2}
                        value={poster.reviewQuote}
                        onChange={(e) =>
                          updatePoster("reviewQuote", e.target.value)
                        }
                        className="resize-none text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="reviewer-name" className="text-xs">
                          {isMy ? "အမည် / Source" : "Author / Reviewer"}
                        </Label>
                        <Input
                          id="reviewer-name"
                          value={poster.reviewerName}
                          onChange={(e) =>
                            updatePoster("reviewerName", e.target.value)
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      {poster.showPriceBadge ? (
                        <div className="space-y-1">
                          <Label htmlFor="review-price" className="text-xs">
                            {isMy ? "ဈေးနှုန်း (Optional)" : "Price Tag (Optional)"}
                          </Label>
                          <Input
                            id="review-price"
                            value={poster.priceTag}
                            onChange={(e) =>
                              updatePoster("priceTag", e.target.value)
                            }
                            className="h-9 text-sm"
                          />
                        </div>
                      ) : !poster.showStarRating ? (
                        <div className="space-y-1">
                          <Label htmlFor="quote-badge" className="text-xs">
                            {isMy ? "တံဆိပ်စာသား" : "Badge Pill Text"}
                          </Label>
                          <Input
                            id="quote-badge"
                            value={poster.pillBadgeText}
                            onChange={(e) =>
                              updatePoster("pillBadgeText", e.target.value)
                            }
                            placeholder="KEY TIP / QUOTE"
                            className="h-9 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "theme_color" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(BRAND_THEMES) as BrandThemeId[]).map((themeId) => {
                    const cfg = BRAND_THEMES[themeId]
                    const selected = poster.theme === themeId
                    return (
                      <button
                        key={themeId}
                        type="button"
                        onClick={() => updatePoster("theme", themeId)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border p-2.5 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border bg-background hover:bg-muted/60"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-5 w-5 shrink-0 rounded-full border border-border shadow-sm"
                            style={{ backgroundColor: cfg.swatch }}
                          />
                          <span className="text-xs font-semibold">
                            {isMy ? cfg.nameMy : cfg.name}
                          </span>
                        </div>
                        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    )
                  })}
                </div>

                <div className="border-t border-border pt-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {isMy ? "စာလုံးဒီဇိုင်း" : "Typography Style"}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "modern_clean", label: "Modern Clean", labelMy: "Modern Clean" },
                        { id: "bold_promo", label: "Bold Promo", labelMy: "Bold Promo" },
                      ] as { id: PosterFontStyle; label: string; labelMy: string }[]
                    ).map((style) => {
                      const active = poster.fontStyle === style.id
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => updatePoster("fontStyle", style.id)}
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-all",
                            style.id === "bold_promo" ? "font-black tracking-tight" : "font-semibold",
                            active
                              ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                              : "border-border bg-background hover:bg-muted/60"
                          )}
                        >
                          <span>{isMy ? style.labelMy : style.label}</span>
                          {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "shop_footer" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updatePoster("showShopFooter", !poster.showShopFooter)
                    }
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      poster.showShopFooter
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <Store className="h-3.5 w-3.5" />
                    {isMy ? "ဆိုင်အောက်ခြေဘား ပြမည်" : "Show Shop Footer Bar"}
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSyncBrandSignature}
                    className="h-8 gap-1 text-xs"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {isMy ? "Settings မှယူမည်" : "Sync Settings"}
                  </Button>
                </div>

                {poster.showShopFooter && (
                  <div className="space-y-1">
                    <Label htmlFor="shop-footer-text" className="text-xs">
                      {isMy
                        ? "ဆိုင်အမည် / ဖုန်းနံပါတ် (Settings မှ အလိုအလျောက်ယူသည်)"
                        : "Shop Footer (Auto-synced from Brand Signature)"}
                    </Label>
                    <Input
                      id="shop-footer-text"
                      value={poster.shopFooterText}
                      onChange={(e) => {
                        setHasCustomFooter(true)
                        updatePoster("shopFooterText", e.target.value)
                      }}
                      placeholder="Shop Name • 09-xxx-xxx • Yangon"
                      className="h-9 text-sm"
                    />
                  </div>
                )}

                <div className="border-t border-border pt-2.5 space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      updatePoster("showCodBadge", !poster.showCodBadge)
                    }
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      poster.showCodBadge
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isMy
                      ? "COD Available / အိမ်အရောက်ငွေချေ တံဆိပ်"
                      : "COD Available Corner Badge"}
                  </button>

                  {poster.showCodBadge && (
                    <Input
                      value={poster.codBadgeText}
                      onChange={(e) =>
                        updatePoster("codBadgeText", e.target.value)
                      }
                      className="h-9 text-sm"
                      aria-label="COD Badge Text"
                    />
                  )}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      "💳 KPay / WavePay ရသည်",
                      "🚚 အိမ်အရောက်ငွေချေ (COD)",
                      "✨ 100% Authentic",
                    ].map((badgeLabel) => {
                      const active = poster.showCodBadge && poster.codBadgeText === badgeLabel
                      return (
                        <button
                          key={badgeLabel}
                          type="button"
                          onClick={() => {
                            updatePoster("showCodBadge", true)
                            updatePoster("codBadgeText", badgeLabel)
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer font-myanmar",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {badgeLabel}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-border pt-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => updatePoster("showShopLogo", !poster.showShopLogo)}
                      disabled={!shopLogoDataUrl}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                        poster.showShopLogo && shopLogoDataUrl
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {isMy ? "ဆိုင်လိုဂို Watermark" : "Shop Logo Watermark"}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          void handleLogoFile(e.target.files?.[0])
                          e.target.value = ""
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        {shopLogoDataUrl
                          ? isMy
                            ? "ပြောင်းမည်"
                            : "Change"
                          : isMy
                            ? "လိုဂိုတင်မည်"
                            : "Upload Logo"}
                      </Button>
                      {shopLogoDataUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => setShopLogoDataUrl(null)}
                          title={isMy ? "လိုဂိုဖျက်မည်" : "Remove logo"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {shopLogoDataUrl && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2">
                      <img
                        src={shopLogoDataUrl}
                        alt="Shop Logo"
                        className="h-9 w-9 rounded-md object-contain bg-white p-0.5 border border-border/40"
                      />
                      <span className="text-xs text-muted-foreground">
                        {poster.showShopLogo
                          ? isMy
                            ? "Poster ထောင့်/အောက်ခြေတွင် အလိုအလျောက်ပြနေပါသည်"
                            : "Rendered automatically on your poster"
                          : isMy
                            ? "လိုဂိုပိတ်ထားပါသည်"
                            : "Logo watermark hidden"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
