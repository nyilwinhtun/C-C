"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check,
  Columns2,
  Download,
  Flame,
  ImagePlus,
  MessageSquareQuote,
  Palette,
  RefreshCw,
  Rows2,
  Sparkles,
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
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { renderPosterCanvas } from "./posterRenderer"
import {
  BRAND_THEMES,
  type AspectRatioId,
  type BrandThemeId,
  type ControlTabId,
  type PosterState,
  type PosterTemplateId,
} from "./types"

const TEMPLATE_OPTIONS: {
  id: PosterTemplateId
  label: string
  labelMy: string
  icon: typeof Sparkles
}[] = [
  {
    id: "spotlight",
    label: "Product Spotlight",
    labelMy: "ပစ္စည်းအထူးပြ",
    icon: Sparkles,
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
    label: "Customer Review",
    labelMy: "ဝယ်သူမှတ်ချက်",
    icon: MessageSquareQuote,
  },
]

const CONTROL_TABS: {
  id: ControlTabId
  label: string
  labelMy: string
  icon: typeof LayoutTemplate
}[] = [
  { id: "template", label: "Template", labelMy: "ဒီဇိုင်း", icon: LayoutTemplate },
  { id: "text_price", label: "Text & Price", labelMy: "စာသားနှင့်ဈေး", icon: Type },
  { id: "theme_color", label: "Theme Color", labelMy: "အရောင်", icon: Palette },
  { id: "shop_footer", label: "Shop Footer", labelMy: "ဆိုင်အောက်ခြေ", icon: Store },
]

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}

export function PhotoStudioPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const { brandSignature, posterDraft, setPosterDraft } = useContentStore(
    useShallow((state) => ({
      brandSignature: state.brandSignature,
      posterDraft: state.posterDraft,
      setPosterDraft: state.setPosterDraft,
    }))
  )

  const [activeTab, setActiveTab] = useState<ControlTabId>("template")
  const [hasCustomFooter, setHasCustomFooter] = useState(false)

  const [poster, setPoster] = useState<PosterState>(() => ({
    template: "spotlight",
    aspectRatio: "1:1",
    theme: "clean_white",
    title: isMy ? "Premium Daily Essential" : "Premium Daily Essential",
    subtitle: isMy ? "အရည်အသွေးမြင့် • နေ့စဉ်သုံး" : "High quality • Ready to ship",
    priceTag: "35,000 Ks",
    originalPrice: "48,000 Ks",
    showNewArrivalPill: true,
    promoBadgeText: isMy ? "အထူးလျှော့ဈေး" : "FLASH SALE",
    splitDirection: "side-by-side",
    beforeLabel: "BEFORE",
    afterLabel: "AFTER",
    reviewQuote: isMy
      ? "ပစ္စည်းအရမ်းကောင်းပြီး ပို့ဆောင်မှုလည်း မြန်ဆန်ပါတယ်။ ထပ်မှာဦးမယ်!"
      : "Amazing quality and super fast delivery! Will definitely order again.",
    reviewerName: isMy ? "Su Myat • Yangon" : "Verified Buyer",
    showShopFooter: true,
    shopFooterText: brandSignature.trim() || "My Online Shop • Inbox to Order",
    showCodBadge: true,
    codBadgeText: "COD Available / အိမ်အရောက်ငွေချေ",
  }))

  const [primaryDataUrl, setPrimaryDataUrl] = useState<string | null>(null)
  const [secondaryDataUrl, setSecondaryDataUrl] = useState<string | null>(null)
  const [primaryImg, setPrimaryImg] = useState<HTMLImageElement | null>(null)
  const [secondaryImg, setSecondaryImg] = useState<HTMLImageElement | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const primaryInputRef = useRef<HTMLInputElement | null>(null)
  const secondaryInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-sync saved brandSignature from Settings unless manually overridden
  useEffect(() => {
    if (hasCustomFooter) return
    const trimmed = brandSignature.trim()
    if (trimmed) {
      setPoster((prev) => ({ ...prev, shopFooterText: trimmed }))
    }
  }, [brandSignature, hasCustomFooter])

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

  // Re-render HTML5 Canvas whenever poster state or images change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderPosterCanvas(canvas, poster, primaryImg, secondaryImg)
  }, [poster, primaryImg, secondaryImg])

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
        if (slot === "primary") setPrimaryDataUrl(result)
        else setSecondaryDataUrl(result)
      }
      reader.readAsDataURL(file)
    },
    [isMy]
  )

  const handleDownloadPng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Ensure canvas is freshly rendered at full resolution before export
    renderPosterCanvas(canvas, poster, primaryImg, secondaryImg)

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
  }, [poster, primaryImg, secondaryImg, isMy])

  const handleSyncBrandSignature = () => {
    const trimmed = brandSignature.trim()
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
          ? "Settings တွင် Brand Signature မထည့်ရသေးပါ"
          : "No brand signature saved in Settings yet"
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-4">
      {/* Compact Header Bar: Aspect Ratio Switcher + 1-Tap PNG Download */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          {(["1:1", "4:5"] as AspectRatioId[]).map((ratio) => {
            const active = poster.aspectRatio === ratio
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => updatePoster("aspectRatio", ratio)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {ratio === "1:1" ? "1:1 Square" : "4:5 Portrait"}
              </button>
            )
          })}
        </div>

        <Button
          size="sm"
          onClick={handleDownloadPng}
          className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
        >
          <Download className="h-3.5 w-3.5" />
          {isMy ? "PNG ဒေါင်းလုဒ်" : "Download PNG"}
        </Button>
      </div>

      {/* Main Responsive Studio Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        {/* Live Canvas Preview (Compact & visible near top on mobile) */}
        <div className="lg:col-span-5 lg:sticky lg:top-4 space-y-2.5">
          <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/30 p-2.5 sm:p-3">
            <canvas
              ref={canvasRef}
              className={cn(
                "block rounded-xl shadow-md transition-all duration-200",
                poster.aspectRatio === "1:1"
                  ? "aspect-square max-h-[290px] sm:max-h-[360px] lg:max-h-[440px] w-auto max-w-full"
                  : "aspect-[4/5] max-h-[320px] sm:max-h-[400px] lg:max-h-[480px] w-auto max-w-full"
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
                  {primaryDataUrl ? "Change Before" : "Before Photo"}
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
                  {secondaryDataUrl ? "Change After" : "After Photo"}
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
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {isMy ? tab.labelMy : tab.label}
                </button>
              )
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-sm">
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
                        Side-by-Side
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
                        Top-Bottom
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
                      {isMy ? "ခေါင်းစဉ် / ပစ္စည်းအမည်" : "Product Title"}
                    </Label>
                    <Input
                      id="poster-title"
                      value={poster.title}
                      onChange={(e) => updatePoster("title", e.target.value)}
                      placeholder="e.g. Glow Serum 30ml"
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
                          placeholder="Free gift with every order"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="poster-price" className="text-xs">
                          {isMy ? "ဈေးနှုန်း" : "Price Tag"}
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
                    </div>

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
                      {isMy ? "New Arrival တံဆိပ်ပြမည်" : "Show 'New Arrival' Pill"}
                    </button>
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
                        Before Label
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
                        After Label
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
                    <div className="space-y-1">
                      <Label htmlFor="review-quote" className="text-xs">
                        {isMy ? "ဝယ်သူမှတ်ချက် (★★★★★)" : "Customer Testimonial"}
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
                          {isMy ? "ဝယ်သူအမည်" : "Reviewer Name"}
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
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "theme_color" && (
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
