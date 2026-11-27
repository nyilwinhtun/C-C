import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Link2,
  QrCode,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn, triggerHaptic } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { analyzeSocialUrl } from "./urlDetector"
import { PlatformIcon } from "./platformIcons"
import {
  createBadgedLogoDataUrl,
  downloadCardCanvasPng,
  generateQrImageBlob,
  getCardThemePalette,
  renderQrCardCanvas,
  selectQrErrorCorrection,
  triggerBlobDownload,
} from "./qrRenderer"
import type { QrCardAspectRatio, QrCardThemeId } from "./types"

const CARD_THEMES: { id: QrCardThemeId; labelKey: string; swatch: string }[] = [
  { id: "platform", labelKey: "socialQr.theme.platform", swatch: "bg-gradient-to-br from-blue-500 to-indigo-600" },
  { id: "midnight_gold", labelKey: "socialQr.theme.midnightGold", swatch: "bg-gradient-to-br from-zinc-900 to-amber-500" },
  { id: "studio_white", labelKey: "socialQr.theme.studioWhite", swatch: "bg-gradient-to-br from-stone-50 to-stone-300 border border-stone-300" },
  { id: "soft_coral", labelKey: "socialQr.theme.softCoral", swatch: "bg-gradient-to-br from-rose-400 to-orange-400" },
]

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

export function SingleQrStudio() {
  const language = useUIStore((s) => s.language)
  const isMy = language === "my"

  const {
    socialQrSettings,
    updateSocialQrSettings,
    shopProfile,
    shopLogoDataUrl,
    presenterLogoDataUrl,
  } = useContentStore(
    useShallow((s) => ({
      socialQrSettings: s.socialQrSettings,
      updateSocialQrSettings: s.updateSocialQrSettings,
      shopProfile: s.shopProfile,
      shopLogoDataUrl: s.shopLogoDataUrl,
      presenterLogoDataUrl: s.presenterLogoDataUrl,
    }))
  )

  const [copiedClean, setCopiedClean] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [exportingCard, setExportingCard] = useState(false)
  const [exportingQrOnly, setExportingQrOnly] = useState(false)
  const [badgedLogoUrl, setBadgedLogoUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const storeLogoUrl = presenterLogoDataUrl || shopLogoDataUrl
  const activeLogoSrc = socialQrSettings.showCenterLogo
    ? socialQrSettings.customLogoDataUrl || (socialQrSettings.useShopLogo ? storeLogoUrl : null)
    : null

  const detected = useMemo(
    () => analyzeSocialUrl(socialQrSettings.url, socialQrSettings.cleanTrackingParams),
    [socialQrSettings.url, socialQrSettings.cleanTrackingParams]
  )

  const defaultHeadline = shopProfile?.name?.trim() || "THE BOYS MOBILE"
  const effectiveHeadline = socialQrSettings.headline || defaultHeadline
  const effectiveHandle = socialQrSettings.handleText || detected.extractedHandle || "@myshop"
  const effectiveHeader =
    socialQrSettings.headerText ||
    (isMy ? detected.platform.headerTextMy : detected.platform.headerTextEn)
  const effectiveCta =
    socialQrSettings.ctaText ||
    (isMy ? detected.platform.ctaDefaultMy : detected.platform.ctaDefaultEn)

  const palette = useMemo(
    () => getCardThemePalette(socialQrSettings.themeId, detected.platform),
    [socialQrSettings.themeId, detected.platform]
  )

  // Prepare white-badged center logo whenever activeLogoSrc changes
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

  // Render high-res preview card onto canvas
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    const timer = window.setTimeout(async () => {
      setRendering(true)
      try {
        const qrTargetUrl = detected.finalUrl || "https://example.com"
        const qrSize = socialQrSettings.aspectRatio === "portrait" ? 574 : 476
        const qrBlob = await generateQrImageBlob({
          url: qrTargetUrl,
          size: qrSize,
          qrColor: palette.qrColor,
          badgedLogoDataUrl: badgedLogoUrl,
        })
        if (cancelled) return

        await renderQrCardCanvas(canvas, {
          aspectRatio: socialQrSettings.aspectRatio,
          themeId: socialQrSettings.themeId,
          platform: detected.platform,
          headerText: effectiveHeader,
          headline: effectiveHeadline,
          handleText: effectiveHandle,
          ctaText: effectiveCta,
          qrBlob,
        })
      } catch (err) {
        console.error("Failed to render QR card", err)
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, 90)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    detected.finalUrl,
    detected.platform,
    socialQrSettings.aspectRatio,
    socialQrSettings.themeId,
    palette.qrColor,
    badgedLogoUrl,
    effectiveHeader,
    effectiveHeadline,
    effectiveHandle,
    effectiveCta,
  ])

  const handleCopyCleanLink = useCallback(async () => {
    const linkToCopy = detected.cleanUrl || detected.finalUrl
    if (!linkToCopy) return
    try {
      await navigator.clipboard.writeText(linkToCopy)
      triggerHaptic(8)
      setCopiedClean(true)
      toast.success(t(language, "socialQr.copiedClean"))
      window.setTimeout(() => setCopiedClean(false), 1800)
    } catch {
      toast.error(t(language, "socialQr.copyFailed"))
    }
  }, [detected.cleanUrl, detected.finalUrl, language])

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      try {
        const dataUrl = await downscaleLogoFile(file, 256)
        updateSocialQrSettings({
          customLogoDataUrl: dataUrl,
          showCenterLogo: true,
        })
        toast.success(t(language, "socialQr.logoUploaded"))
      } catch {
        toast.error(t(language, "socialQr.logoUploadFailed"))
      }
    },
    [language, updateSocialQrSettings]
  )

  const eccInfo = useMemo(
    () =>
      selectQrErrorCorrection(
        (detected.finalUrl || "https://example.com").length,
        Boolean(badgedLogoUrl)
      ),
    [detected.finalUrl, badgedLogoUrl]
  )

  const handleDownloadCard = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width < 1000) {
      toast.error(t(language, "socialQr.exportFailed"))
      return
    }
    setExportingCard(true)
    try {
      triggerHaptic(10)
      const slug = detected.platform.id
      const ratio = socialQrSettings.aspectRatio === "portrait" ? "1080x1350" : "1080x1080"
      await downloadCardCanvasPng(canvas, `qr-card-${slug}-${ratio}-${Date.now()}.png`)
      toast.success(t(language, "socialQr.cardDownloaded"))
    } catch {
      toast.error(t(language, "socialQr.exportFailed"))
    } finally {
      setExportingCard(false)
    }
  }, [detected.platform.id, language, socialQrSettings.aspectRatio])

  const handleDownloadTransparentQr = useCallback(async () => {
    setExportingQrOnly(true)
    try {
      triggerHaptic(10)
      const qrBlob = await generateQrImageBlob({
        url: detected.finalUrl || "https://example.com",
        size: 1024,
        qrColor: palette.qrColor,
        badgedLogoDataUrl: badgedLogoUrl,
      })
      if (!qrBlob) {
        toast.error(t(language, "socialQr.exportFailed"))
        return
      }
      triggerBlobDownload(qrBlob, `qr-only-${detected.platform.id}-${Date.now()}.png`)
      toast.success(t(language, "socialQr.qrOnlyDownloaded"))
    } catch {
      toast.error(t(language, "socialQr.exportFailed"))
    } finally {
      setExportingQrOnly(false)
    }
  }, [badgedLogoUrl, detected.finalUrl, detected.platform.id, language, palette.qrColor])

  const ctaPresets = [
    t(language, "socialQr.ctaPreset.scanOpen"),
    t(language, "socialQr.ctaPreset.orderChat"),
    t(language, "socialQr.ctaPreset.dailyDeals"),
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: Controls */}
      <div className="lg:col-span-7 min-w-0 space-y-4">
        {/* 1. Smart URL & Link Cleaner */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                {t(language, "socialQr.urlSectionTitle")}
              </CardTitle>
              <Badge
                variant="secondary"
                className="gap-1.5 px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: detected.platform.badgeBg,
                  color: detected.platform.badgeText,
                }}
              >
                <PlatformIcon platform={detected.platform.id} className="h-3.5 w-3.5" />
                {isMy ? detected.platform.labelMy : detected.platform.labelEn}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="social-qr-url" className="text-xs font-medium">
                {t(language, "socialQr.urlLabel")}
              </Label>
              <Input
                id="social-qr-url"
                value={socialQrSettings.url}
                onChange={(e) => updateSocialQrSettings({ url: e.target.value })}
                placeholder={t(language, "socialQr.urlPlaceholder")}
                className="font-mono text-xs sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  updateSocialQrSettings({
                    cleanTrackingParams: !socialQrSettings.cleanTrackingParams,
                  })
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  socialQrSettings.cleanTrackingParams
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>{t(language, "socialQr.cleanTrackingToggle")}</span>
                <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                  {socialQrSettings.cleanTrackingParams
                    ? t(language, "socialQr.on")
                    : t(language, "socialQr.off")}
                </span>
              </button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyCleanLink}
                disabled={!detected.isValid}
                className="gap-1.5 text-xs"
              >
                {copiedClean ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {t(language, "socialQr.copyCleanLink")}
              </Button>
            </div>

            {detected.isValid && detected.strippedParamsCount > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                <div className="font-medium text-emerald-600 dark:text-emerald-400">
                  {t(language, "socialQr.strippedNotice", {
                    count: String(detected.strippedParamsCount),
                  })}
                </div>
                <div className="truncate font-mono opacity-85">{detected.finalUrl}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Card Designer Controls */}
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t(language, "socialQr.designSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aspect Ratio & Theme */}
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
                      onClick={() => updateSocialQrSettings({ aspectRatio: opt.id })}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all cursor-pointer",
                        socialQrSettings.aspectRatio === opt.id
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
                <Label className="text-xs font-medium">
                  {t(language, "socialQr.themeLabel")}
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CARD_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateSocialQrSettings({ themeId: theme.id })}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer",
                        socialQrSettings.themeId === theme.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("h-3.5 w-3.5 rounded-full shrink-0", theme.swatch)} />
                      <span className="truncate">{t(language, theme.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Editable Text Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qr-headline" className="text-xs font-medium">
                  {t(language, "socialQr.headlineLabel")}
                </Label>
                <Input
                  id="qr-headline"
                  value={socialQrSettings.headline}
                  onChange={(e) => updateSocialQrSettings({ headline: e.target.value })}
                  placeholder={defaultHeadline}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qr-handle" className="text-xs font-medium">
                  {t(language, "socialQr.handleLabel")}
                </Label>
                <Input
                  id="qr-handle"
                  value={socialQrSettings.handleText}
                  onChange={(e) => updateSocialQrSettings({ handleText: e.target.value })}
                  placeholder={detected.extractedHandle || "@theboysmobile"}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-header-pill" className="text-xs font-medium">
                {t(language, "socialQr.headerPillLabel")}
              </Label>
              <Input
                id="qr-header-pill"
                value={socialQrSettings.headerText}
                onChange={(e) => updateSocialQrSettings({ headerText: e.target.value })}
                placeholder={isMy ? detected.platform.headerTextMy : detected.platform.headerTextEn}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-cta-pill" className="text-xs font-medium">
                {t(language, "socialQr.ctaLabel")}
              </Label>
              <Input
                id="qr-cta-pill"
                value={socialQrSettings.ctaText}
                onChange={(e) => updateSocialQrSettings({ ctaText: e.target.value })}
                placeholder={isMy ? detected.platform.ctaDefaultMy : detected.platform.ctaDefaultEn}
              />
              <div className="flex flex-wrap gap-1.5">
                {ctaPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateSocialQrSettings({ ctaText: preset })}
                    className="rounded-full border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
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
                    updateSocialQrSettings({
                      showCenterLogo: !socialQrSettings.showCenterLogo,
                    })
                  }
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    socialQrSettings.showCenterLogo
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {socialQrSettings.showCenterLogo
                    ? t(language, "socialQr.on")
                    : t(language, "socialQr.off")}
                </button>
              </div>

              {socialQrSettings.showCenterLogo && (
                <div className="flex items-center gap-2.5 flex-wrap pt-1">
                  {activeLogoSrc ? (
                    <img
                      src={activeLogoSrc}
                      alt="QR Center Logo"
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

                  {socialQrSettings.customLogoDataUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateSocialQrSettings({ customLogoDataUrl: null })}
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

      {/* Right Column: Live High-Res Preview & Export */}
      <div className="lg:col-span-5 min-w-0 lg:sticky lg:top-4 space-y-3">
        <Card className="border-border/70 overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">
              {t(language, "socialQr.previewTitle")}
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {socialQrSettings.aspectRatio === "portrait" ? "1080×1350" : "1080×1080"} · ECC-{eccInfo.level}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative w-full rounded-xl overflow-hidden bg-muted/40 border border-border/60 flex items-center justify-center p-2">
              <canvas
                ref={canvasRef}
                className="w-full h-auto max-h-[520px] object-contain rounded-lg shadow-sm"
              />
              {rendering && (
                <div className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {t(language, "socialQr.rendering")}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={handleDownloadCard}
                disabled={exportingCard || rendering}
                className="gap-2 w-full h-auto min-h-9 py-2 whitespace-normal text-center"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>{t(language, "socialQr.downloadCardPng")}</span>
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
