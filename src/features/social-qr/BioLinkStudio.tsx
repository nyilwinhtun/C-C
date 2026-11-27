import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Plus,
  QrCode,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, triggerHaptic } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import {
  buildBioShareUrl,
  buildLocalPreviewBioUrl,
  type BioPayload,
} from "./bioCodec"
import { PlatformIcon } from "./platformIcons"
import { PublicBioPage } from "./PublicBioPage"
import {
  createBadgedLogoDataUrl,
  downloadCardCanvasPng,
  generateQrImageBlob,
  getCardThemePalette,
  renderQrCardCanvas,
  selectQrErrorCorrection,
  triggerBlobDownload,
} from "./qrRenderer"
import type {
  BioLinkItem,
  QrCardAspectRatio,
  QrCardThemeId,
  SocialPlatformId,
} from "./types"
import { analyzeSocialUrl, PLATFORM_THEMES } from "./urlDetector"

const BIO_THEMES: { id: QrCardThemeId; labelKey: string; swatch: string }[] = [
  { id: "midnight_gold", labelKey: "socialQr.theme.midnightGold", swatch: "bg-gradient-to-br from-zinc-900 to-amber-500" },
  { id: "platform", labelKey: "socialQr.theme.platform", swatch: "bg-gradient-to-br from-blue-500 to-indigo-600" },
  { id: "studio_white", labelKey: "socialQr.theme.studioWhite", swatch: "bg-gradient-to-br from-stone-50 to-stone-300 border border-stone-300" },
  { id: "soft_coral", labelKey: "socialQr.theme.softCoral", swatch: "bg-gradient-to-br from-rose-400 to-orange-400" },
]

const QUICK_PLATFORMS: SocialPlatformId[] = [
  "facebook",
  "tiktok",
  "instagram",
  "telegram",
  "viber",
  "phone",
  "maps",
  "website",
]

function makeLinkId(): string {
  return `bio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function downscaleLogoFile(file: File, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Canvas unavailable")
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/png"))
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }
    img.src = objectUrl
  })
}

export function BioLinkStudio() {
  const language = useUIStore((s) => s.language)
  const isMy = language === "my"

  const {
    bioLinkSettings,
    updateBioLinkSettings,
    shopProfile,
    shopLogoDataUrl,
    presenterLogoDataUrl,
  } = useContentStore(
    useShallow((s) => ({
      bioLinkSettings: s.bioLinkSettings,
      updateBioLinkSettings: s.updateBioLinkSettings,
      shopProfile: s.shopProfile,
      shopLogoDataUrl: s.shopLogoDataUrl,
      presenterLogoDataUrl: s.presenterLogoDataUrl,
    }))
  )

  const [newUrlInput, setNewUrlInput] = useState("")
  const [previewMode, setPreviewMode] = useState<"phone" | "qr">("phone")
  const [copiedBioLink, setCopiedBioLink] = useState(false)
  const [renderingQr, setRenderingQr] = useState(false)
  const [exportingCard, setExportingCard] = useState(false)
  const [exportingQrOnly, setExportingQrOnly] = useState(false)
  const [badgedLogoUrl, setBadgedLogoUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const seededRef = useRef(false)

  // Pre-populate cleanly from shopProfile when bioLinkSettings is empty
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    const hasTitle = bioLinkSettings.shopTitle.trim().length > 0
    const hasTagline = bioLinkSettings.tagline.trim().length > 0
    const hasLinks = bioLinkSettings.links.length > 0

    if (hasTitle || hasTagline || hasLinks) return

    const initialLinks: BioLinkItem[] = []
    if (shopProfile?.phone?.trim()) {
      const analyzedPhone = analyzeSocialUrl(shopProfile.phone.trim(), true)
      if (analyzedPhone.isValid) {
        initialLinks.push({
          id: makeLinkId(),
          platform: "phone",
          label: isMy ? PLATFORM_THEMES.phone.labelMy : PLATFORM_THEMES.phone.labelEn,
          url: analyzedPhone.cleanUrl,
          enabled: true,
        })
      }
    }

    updateBioLinkSettings({
      shopTitle: shopProfile?.name?.trim() || "THE BOYS MOBILE",
      tagline: shopProfile?.address?.trim() || "",
      links: initialLinks,
    })
  }, [
    bioLinkSettings.links.length,
    bioLinkSettings.shopTitle,
    bioLinkSettings.tagline,
    isMy,
    shopProfile?.address,
    shopProfile?.name,
    shopProfile?.phone,
    updateBioLinkSettings,
  ])

  const storeLogoUrl = presenterLogoDataUrl || shopLogoDataUrl
  const activeLogoSrc = bioLinkSettings.showCenterLogo
    ? bioLinkSettings.customLogoDataUrl || (bioLinkSettings.useShopLogo ? storeLogoUrl : null)
    : null

  const effectiveShopTitle =
    bioLinkSettings.shopTitle.trim() || shopProfile?.name?.trim() || "THE BOYS MOBILE"

  const bioPayload: BioPayload = useMemo(
    () => ({
      shopTitle: effectiveShopTitle,
      tagline: bioLinkSettings.tagline.trim(),
      themeId: bioLinkSettings.themeId,
      links: bioLinkSettings.links
        .filter((item) => item.enabled && item.url.trim().length > 0)
        .map((item) => {
          const analyzed = analyzeSocialUrl(item.url, true)
          return {
            platform: item.platform,
            label:
              item.label.trim() ||
              (isMy
                ? PLATFORM_THEMES[item.platform].labelMy
                : PLATFORM_THEMES[item.platform].labelEn),
            url: analyzed.isValid ? analyzed.cleanUrl : item.url.trim(),
          }
        }),
    }),
    [
      bioLinkSettings.links,
      bioLinkSettings.tagline,
      bioLinkSettings.themeId,
      effectiveShopTitle,
      isMy,
    ]
  )

  const shareUrl = useMemo(() => buildBioShareUrl(bioPayload), [bioPayload])
  const localPreviewUrl = useMemo(
    () => buildLocalPreviewBioUrl(bioPayload),
    [bioPayload]
  )

  const palette = useMemo(
    () => getCardThemePalette(bioLinkSettings.themeId, PLATFORM_THEMES.website),
    [bioLinkSettings.themeId]
  )

  useEffect(() => {
    let cancelled = false
    if (!activeLogoSrc) {
      setBadgedLogoUrl(null)
      return
    }
    createBadgedLogoDataUrl(activeLogoSrc).then((url) => {
      if (!cancelled) setBadgedLogoUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [activeLogoSrc])

  // Render high-res Master QR Card onto canvas
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    const timer = window.setTimeout(async () => {
      setRenderingQr(true)
      try {
        const qrSize = bioLinkSettings.aspectRatio === "portrait" ? 574 : 476
        const qrBlob = await generateQrImageBlob({
          url: shareUrl,
          size: qrSize,
          qrColor: palette.qrColor,
          badgedLogoDataUrl: badgedLogoUrl,
        })
        if (cancelled) return

        await renderQrCardCanvas(canvas, {
          aspectRatio: bioLinkSettings.aspectRatio,
          themeId: bioLinkSettings.themeId,
          platform: PLATFORM_THEMES.website,
          headerText: t(language, "socialQr.bioMasterHeaderPill"),
          headline: effectiveShopTitle,
          handleText:
            bioLinkSettings.tagline.trim() ||
            t(language, "socialQr.bioMasterDefaultTagline"),
          ctaText:
            bioLinkSettings.ctaText.trim() ||
            t(language, "socialQr.bioMasterDefaultCta"),
          qrBlob,
        })
      } catch (err) {
        console.error("Failed to render Master Bio QR card", err)
      } finally {
        if (!cancelled) setRenderingQr(false)
      }
    }, 90)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    badgedLogoUrl,
    bioLinkSettings.aspectRatio,
    bioLinkSettings.ctaText,
    bioLinkSettings.tagline,
    bioLinkSettings.themeId,
    effectiveShopTitle,
    language,
    palette.qrColor,
    shareUrl,
  ])

  const handleAddUrlFromInput = useCallback(() => {
    const raw = newUrlInput.trim()
    if (!raw) return
    const analyzed = analyzeSocialUrl(raw, true)
    const platform = analyzed.platform.id
    const defaultLabel = isMy ? analyzed.platform.labelMy : analyzed.platform.labelEn
    const newItem: BioLinkItem = {
      id: makeLinkId(),
      platform,
      label: defaultLabel,
      url: analyzed.isValid ? analyzed.cleanUrl : raw,
      enabled: true,
    }
    updateBioLinkSettings({
      links: [...bioLinkSettings.links, newItem],
    })
    setNewUrlInput("")
    triggerHaptic(8)
  }, [bioLinkSettings.links, isMy, newUrlInput, updateBioLinkSettings])

  const handleQuickAddPlatform = useCallback(
    (platform: SocialPlatformId) => {
      const theme = PLATFORM_THEMES[platform]
      const defaultUrl =
        platform === "phone"
          ? `tel:${shopProfile?.phone?.replace(/[\s\-()]/g, "") || "09"}`
          : ""
      const newItem: BioLinkItem = {
        id: makeLinkId(),
        platform,
        label: isMy ? theme.labelMy : theme.labelEn,
        url: defaultUrl,
        enabled: true,
      }
      updateBioLinkSettings({
        links: [...bioLinkSettings.links, newItem],
      })
      triggerHaptic(6)
    },
    [bioLinkSettings.links, isMy, shopProfile?.phone, updateBioLinkSettings]
  )

  const handleUpdateLink = useCallback(
    (id: string, patch: Partial<BioLinkItem>) => {
      updateBioLinkSettings({
        links: bioLinkSettings.links.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        ),
      })
    },
    [bioLinkSettings.links, updateBioLinkSettings]
  )

  const handleCleanAndAutoDetectLink = useCallback(
    (id: string, rawUrl: string) => {
      const analyzed = analyzeSocialUrl(rawUrl, true)
      if (!analyzed.isValid) return
      updateBioLinkSettings({
        links: bioLinkSettings.links.map((item) =>
          item.id === id
            ? {
                ...item,
                platform: analyzed.platform.id,
                url: analyzed.cleanUrl,
              }
            : item
        ),
      })
    },
    [bioLinkSettings.links, updateBioLinkSettings]
  )

  const handleMoveLink = useCallback(
    (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= bioLinkSettings.links.length) return
      const next = [...bioLinkSettings.links]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      updateBioLinkSettings({ links: next })
    },
    [bioLinkSettings.links, updateBioLinkSettings]
  )

  const handleRemoveLink = useCallback(
    (id: string) => {
      updateBioLinkSettings({
        links: bioLinkSettings.links.filter((item) => item.id !== id),
      })
    },
    [bioLinkSettings.links, updateBioLinkSettings]
  )

  const handleCopyBioLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      triggerHaptic(8)
      setCopiedBioLink(true)
      toast.success(t(language, "socialQr.bioLinkCopied"))
      window.setTimeout(() => setCopiedBioLink(false), 1800)
    } catch {
      toast.error(t(language, "socialQr.copyFailed"))
    }
  }, [language, shareUrl])

  const handlePreviewPublicPage = useCallback(() => {
    window.open(localPreviewUrl, "_blank", "noopener,noreferrer")
  }, [localPreviewUrl])

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      try {
        const dataUrl = await downscaleLogoFile(file, 256)
        updateBioLinkSettings({
          customLogoDataUrl: dataUrl,
          showCenterLogo: true,
        })
        toast.success(t(language, "socialQr.logoUploaded"))
      } catch {
        toast.error(t(language, "socialQr.logoUploadFailed"))
      }
    },
    [language, updateBioLinkSettings]
  )

  const eccInfo = useMemo(
    () => selectQrErrorCorrection(shareUrl.length, Boolean(badgedLogoUrl)),
    [shareUrl.length, badgedLogoUrl]
  )

  const handleDownloadMasterCard = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width < 1000) {
      toast.error(t(language, "socialQr.exportFailed"))
      return
    }
    setExportingCard(true)
    try {
      triggerHaptic(10)
      const ratio =
        bioLinkSettings.aspectRatio === "portrait" ? "1080x1350" : "1080x1080"
      await downloadCardCanvasPng(
        canvas,
        `bio-master-qr-${ratio}-${Date.now()}.png`
      )
      toast.success(t(language, "socialQr.cardDownloaded"))
    } catch {
      toast.error(t(language, "socialQr.exportFailed"))
    } finally {
      setExportingCard(false)
    }
  }, [bioLinkSettings.aspectRatio, language])

  const handleDownloadTransparentQr = useCallback(async () => {
    setExportingQrOnly(true)
    try {
      triggerHaptic(10)
      const qrBlob = await generateQrImageBlob({
        url: shareUrl,
        size: 1024,
        qrColor: palette.qrColor,
        badgedLogoDataUrl: badgedLogoUrl,
      })
      if (!qrBlob) {
        toast.error(t(language, "socialQr.exportFailed"))
        return
      }
      triggerBlobDownload(qrBlob, `bio-master-qr-only-${Date.now()}.png`)
      toast.success(t(language, "socialQr.qrOnlyDownloaded"))
    } catch {
      toast.error(t(language, "socialQr.exportFailed"))
    } finally {
      setExportingQrOnly(false)
    }
  }, [badgedLogoUrl, language, palette.qrColor, shareUrl])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: Builder Controls */}
      <div className="lg:col-span-7 min-w-0 space-y-4">
        {/* 1. Shop Bio Header & Theme */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t(language, "socialQr.bioProfileSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bio-shop-title" className="text-xs font-medium">
                  {t(language, "socialQr.bioShopTitleLabel")}
                </Label>
                <Input
                  id="bio-shop-title"
                  value={bioLinkSettings.shopTitle}
                  onChange={(e) =>
                    updateBioLinkSettings({ shopTitle: e.target.value })
                  }
                  placeholder={shopProfile?.name?.trim() || "THE BOYS MOBILE"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bio-tagline" className="text-xs font-medium">
                  {t(language, "socialQr.bioTaglineLabel")}
                </Label>
                <Input
                  id="bio-tagline"
                  value={bioLinkSettings.tagline}
                  onChange={(e) =>
                    updateBioLinkSettings({ tagline: e.target.value })
                  }
                  placeholder={t(language, "socialQr.bioTaglinePlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {t(language, "socialQr.themeLabel")}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {BIO_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => updateBioLinkSettings({ themeId: theme.id })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all cursor-pointer",
                      bioLinkSettings.themeId === theme.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn("h-3.5 w-3.5 rounded-full shrink-0", theme.swatch)}
                    />
                    <span className="truncate">{t(language, theme.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Social & Contact Links Manager */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                {t(language, "socialQr.bioLinksSectionTitle")}
              </CardTitle>
              <Badge variant="secondary" className="text-[11px]">
                {bioPayload.links.length} {t(language, "socialQr.bioActiveCount")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {/* Smart URL Add Bar */}
            <div className="flex gap-2">
              <Input
                value={newUrlInput}
                onChange={(e) => setNewUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddUrlFromInput()
                  }
                }}
                placeholder={t(language, "socialQr.bioAddUrlPlaceholder")}
                className="min-w-0 flex-1 font-mono text-xs sm:text-sm"
              />
              <Button
                type="button"
                onClick={handleAddUrlFromInput}
                disabled={!newUrlInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <Plus className="h-4 w-4" />
                {t(language, "socialQr.bioAddButton")}
              </Button>
            </div>

            {/* Quick-Add Platform Pills */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PLATFORMS.map((platformId) => {
                const theme = PLATFORM_THEMES[platformId]
                return (
                  <button
                    key={platformId}
                    type="button"
                    onClick={() => handleQuickAddPlatform(platformId)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3 opacity-60" />
                    <PlatformIcon platform={platformId} className="h-3 w-3" />
                    <span>{isMy ? theme.labelMy : theme.labelEn}</span>
                  </button>
                )
              })}
            </div>

            {/* Links List */}
            <div className="space-y-2.5">
              {bioLinkSettings.links.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                  {t(language, "socialQr.bioEmptyLinks")}
                </div>
              ) : (
                bioLinkSettings.links.map((item, idx) => {
                  const platformTheme =
                    PLATFORM_THEMES[item.platform] ?? PLATFORM_THEMES.website
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-xl border p-3 space-y-2 transition-colors",
                        item.enabled
                          ? "border-border bg-background"
                          : "border-border/50 bg-muted/30 opacity-65"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${platformTheme.gradientStart}, ${platformTheme.gradientEnd})`,
                            }}
                          >
                            <PlatformIcon platform={item.platform} className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-xs font-semibold truncate">
                            {isMy ? platformTheme.labelMy : platformTheme.labelEn}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === 0}
                            onClick={() => handleMoveLink(idx, -1)}
                            title={t(language, "socialQr.bioMoveUp")}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === bioLinkSettings.links.length - 1}
                            onClick={() => handleMoveLink(idx, 1)}
                            title={t(language, "socialQr.bioMoveDown")}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              handleUpdateLink(item.id, { enabled: !item.enabled })
                            }
                            title={t(language, "socialQr.bioToggleLink")}
                          >
                            {item.enabled ? (
                              <Eye className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveLink(item.id)}
                            title={t(language, "socialQr.bioRemoveLink")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <Input
                            value={item.label}
                            onChange={(e) =>
                              handleUpdateLink(item.id, { label: e.target.value })
                            }
                            placeholder={
                              isMy ? platformTheme.labelMy : platformTheme.labelEn
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-8">
                          <Input
                            value={item.url}
                            onChange={(e) =>
                              handleUpdateLink(item.id, { url: e.target.value })
                            }
                            onBlur={(e) =>
                              handleCleanAndAutoDetectLink(item.id, e.target.value)
                            }
                            placeholder={
                              item.platform === "phone"
                                ? "tel:09123456789"
                                : "https://..."
                            }
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Master QR Card Options */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              {t(language, "socialQr.bioMasterQrOptionsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t(language, "socialQr.aspectRatioLabel")}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "portrait", label: t(language, "socialQr.ratioPortrait") },
                      { id: "square", label: t(language, "socialQr.ratioSquare") },
                    ] as { id: QrCardAspectRatio; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        updateBioLinkSettings({ aspectRatio: opt.id })
                      }
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all cursor-pointer",
                        bioLinkSettings.aspectRatio === opt.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bio-cta-text" className="text-xs font-medium">
                  {t(language, "socialQr.ctaLabel")}
                </Label>
                <Input
                  id="bio-cta-text"
                  value={bioLinkSettings.ctaText}
                  onChange={(e) =>
                    updateBioLinkSettings({ ctaText: e.target.value })
                  }
                  placeholder={t(language, "socialQr.bioMasterDefaultCta")}
                />
              </div>
            </div>

            {/* Center Shop Logo Controls */}
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">
                    {t(language, "socialQr.centerLogoTitle")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t(language, "socialQr.centerLogoHint")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBioLinkSettings({
                      showCenterLogo: !bioLinkSettings.showCenterLogo,
                    })
                  }
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    bioLinkSettings.showCenterLogo
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {bioLinkSettings.showCenterLogo
                    ? t(language, "socialQr.on")
                    : t(language, "socialQr.off")}
                </button>
              </div>

              {bioLinkSettings.showCenterLogo && (
                <div className="flex items-center gap-2.5 flex-wrap pt-1">
                  {activeLogoSrc ? (
                    <img
                      src={activeLogoSrc}
                      alt="Master QR Center Logo"
                      className="h-10 w-10 rounded-full object-cover border border-border bg-white"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground">
                      <QrCode className="h-4 w-4" />
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5 text-xs"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {t(language, "socialQr.uploadLogo")}
                  </Button>

                  {bioLinkSettings.customLogoDataUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateBioLinkSettings({ customLogoDataUrl: null })
                      }
                      className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t(language, "socialQr.resetToShopLogo")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Live Mobile Preview + Master QR Card + Actions */}
      <div className="lg:col-span-5 min-w-0 lg:sticky lg:top-4 space-y-3">
        <Card className="border-border/70 overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="grid grid-cols-2 sm:inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 max-w-full w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setPreviewMode("phone")}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer min-w-0",
                  previewMode === "phone"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(language, "socialQr.bioPhonePreviewTab")}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("qr")}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer min-w-0",
                  previewMode === "qr"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <QrCode className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(language, "socialQr.bioMasterQrTab")}</span>
              </button>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-mono",
                shareUrl.length > 1150
                  ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
                  : ""
              )}
            >
              {shareUrl.length} chars · ECC-{eccInfo.level}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-3">
            {shareUrl.length > 750 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                {isMy
                  ? `QR ဒေတာရှည်နေပါသည် (${shareUrl.length} chars) — စာသားတိုတိုထားပါက ဖုန်းကင်မရာဖြင့် ပိုမြန်စွာ Scan ဖတ်နိုင်ပါမည်။`
                  : `QR payload is dense (${shareUrl.length} chars). Keep labels/URLs concise for faster camera scanning.`}
              </div>
            )}
            {/* Mobile Phone Frame Preview */}
            {previewMode === "phone" && (
              <div className="flex justify-center py-1">
                <div className="w-full max-w-[310px] rounded-[2rem] border-[6px] border-zinc-800 bg-zinc-900 shadow-xl overflow-hidden">
                  <div className="h-4 bg-zinc-900 flex items-center justify-center">
                    <div className="h-1.5 w-14 rounded-full bg-zinc-700" />
                  </div>
                  <div className="h-[470px] overflow-y-auto">
                    <PublicBioPage
                      payload={bioPayload}
                      logoDataUrl={activeLogoSrc}
                      shareUrl={shareUrl}
                      embeddedPreview
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Master QR Card Canvas (kept mounted for instant export) */}
            <div
              className={cn(
                "relative w-full rounded-xl overflow-hidden bg-muted/40 border border-border/60 items-center justify-center p-2",
                previewMode === "qr" ? "flex" : "hidden"
              )}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-auto max-h-[500px] object-contain rounded-lg shadow-sm"
              />
              {renderingQr && (
                <div className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {t(language, "socialQr.rendering")}
                </div>
              )}
            </div>

            {/* Share & Preview Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopyBioLink}
                className="gap-1.5 w-full text-xs"
              >
                {copiedBioLink ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {t(language, "socialQr.copyBioLink")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewPublicPage}
                className="gap-1.5 w-full text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t(language, "socialQr.previewPublicPage")}
              </Button>
            </div>

            {/* Download Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={handleDownloadMasterCard}
                disabled={exportingCard || renderingQr}
                className="gap-2 w-full h-auto min-h-9 py-2 whitespace-normal text-center"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>{t(language, "socialQr.downloadMasterCardPng")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadTransparentQr}
                disabled={exportingQrOnly}
                className="gap-2 w-full h-auto min-h-9 py-2 whitespace-normal text-center"
              >
                <QrCode className="h-4 w-4 shrink-0" />
                <span>{t(language, "socialQr.downloadQrOnlyPng")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
