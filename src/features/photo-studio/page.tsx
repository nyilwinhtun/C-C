"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Tag,
  Type,
  Upload,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"
import { suggestFromPhoto } from "@/api/aiService"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"

type AspectRatioKey = "1:1" | "4:5" | "9:16"
type BadgeKey = "none" | "new" | "discount" | "limited"
type TextColorKey = "white" | "yellow" | "black"
type TextPositionKey = "bottom" | "top"

const ASPECT_RATIOS: Record<
  AspectRatioKey,
  { width: number; height: number; labelKey: string }
> = {
  "1:1": { width: 1080, height: 1080, labelKey: "photoStudio.ratioSquare" },
  "4:5": { width: 1080, height: 1350, labelKey: "photoStudio.ratioPortrait" },
  "9:16": { width: 1080, height: 1920, labelKey: "photoStudio.ratioStory" },
}

const TEXT_COLORS: Record<TextColorKey, { hex: string; labelKey: string }> = {
  white: { hex: "#FFFFFF", labelKey: "photoStudio.colorWhite" },
  yellow: { hex: "#FACC15", labelKey: "photoStudio.colorYellow" },
  black: { hex: "#111827", labelKey: "photoStudio.colorBlack" },
}

const BADGE_STYLES: Record<
  Exclude<BadgeKey, "none">,
  { bg: string; fg: string; labelKey: string }
> = {
  new: { bg: "#10B981", fg: "#FFFFFF", labelKey: "photoStudio.badgeNew" },
  discount: { bg: "#EF4444", fg: "#FFFFFF", labelKey: "photoStudio.badgeDiscount" },
  limited: { bg: "#F59E0B", fg: "#111827", labelKey: "photoStudio.badgeLimited" },
}

const MYANMAR_FONT_STACK =
  '"Pyidaungsu", "Noto Sans Myanmar", "Padauk", system-ui, -apple-system, sans-serif'

function segmentGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("my", { granularity: "grapheme" })
    return Array.from(segmenter.segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split("\n")
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("")
      continue
    }
    const words = paragraph.split(/(\s+)/)
    let currentLine = ""

    for (const token of words) {
      const candidate = currentLine + token
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate
      } else if (ctx.measureText(token).width > maxWidth) {
        // Long unspaced token (common in Burmese script) -> wrap by grapheme clusters
        if (currentLine.trim()) {
          lines.push(currentLine.trimEnd())
          currentLine = ""
        }
        const graphemes = segmentGraphemes(token)
        for (const g of graphemes) {
          if (ctx.measureText(currentLine + g).width <= maxWidth) {
            currentLine += g
          } else {
            if (currentLine) lines.push(currentLine)
            currentLine = g
          }
        }
      } else {
        if (currentLine.trim()) {
          lines.push(currentLine.trimEnd())
        }
        currentLine = token.trimStart()
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd())
    }
  }

  return lines
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function PhotoStudioPage() {
  const language = useUIStore(useShallow((state) => state.language))

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg")
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>("1:1")
  const [headline, setHeadline] = useState("")
  const [fontSize, setFontSize] = useState(64)
  const [textColor, setTextColor] = useState<TextColorKey>("white")
  const [textPosition, setTextPosition] = useState<TextPositionKey>("bottom")
  const [badge, setBadge] = useState<BadgeKey>("none")
  const [priceTag, setPriceTag] = useState("")
  const [shopFooter, setShopFooter] = useState("")

  const [caption, setCaption] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      const validTypes = ["image/jpeg", "image/png", "image/webp"]
      if (!validTypes.includes(file.type)) {
        toast.error(t(language, "photoStudio.invalidFile"))
        return
      }
      setImageMimeType(file.type)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImageDataUrl(reader.result)
        }
      }
      reader.readAsDataURL(file)
    },
    [language]
  )

  useEffect(() => {
    if (!imageDataUrl) {
      setLoadedImage(null)
      return
    }
    const img = new Image()
    img.onload = () => setLoadedImage(img)
    img.src = imageDataUrl
  }, [imageDataUrl])

  // Render high-resolution HTML5 Canvas poster
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loadedImage) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = ASPECT_RATIOS[aspectRatio]
    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)

    // 1. Draw photo with object-cover fit
    const imgRatio = loadedImage.naturalWidth / loadedImage.naturalHeight
    const canvasRatio = width / height
    let drawW = width
    let drawH = height
    let offsetX = 0
    let offsetY = 0

    if (imgRatio > canvasRatio) {
      drawH = height
      drawW = height * imgRatio
      offsetX = (width - drawW) / 2
    } else {
      drawW = width
      drawH = width / imgRatio
      offsetY = (height - drawH) / 2
    }
    ctx.drawImage(loadedImage, offsetX, offsetY, drawW, drawH)

    // 2. Draw subtle dark gradient backdrop for readability
    if (headline.trim() || shopFooter.trim()) {
      if (textPosition === "bottom") {
        const grad = ctx.createLinearGradient(0, height * 0.48, 0, height)
        grad.addColorStop(0, "rgba(0, 0, 0, 0)")
        grad.addColorStop(0.55, "rgba(0, 0, 0, 0.45)")
        grad.addColorStop(1, "rgba(0, 0, 0, 0.82)")
        ctx.fillStyle = grad
        ctx.fillRect(0, height * 0.48, width, height * 0.52)
      } else {
        const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.48)
        topGrad.addColorStop(0, "rgba(0, 0, 0, 0.82)")
        topGrad.addColorStop(0.55, "rgba(0, 0, 0, 0.42)")
        topGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = topGrad
        ctx.fillRect(0, 0, width, height * 0.48)

        if (shopFooter.trim()) {
          const footerGrad = ctx.createLinearGradient(0, height * 0.82, 0, height)
          footerGrad.addColorStop(0, "rgba(0, 0, 0, 0)")
          footerGrad.addColorStop(1, "rgba(0, 0, 0, 0.72)")
          ctx.fillStyle = footerGrad
          ctx.fillRect(0, height * 0.82, width, height * 0.18)
        }
      }
    }

    const padding = 54

    // 3. Draw Marketing Badge (top-left)
    if (badge !== "none") {
      const style = BADGE_STYLES[badge]
      const labelText = t(language, style.labelKey).toUpperCase()
      ctx.save()
      ctx.font = `700 28px ${MYANMAR_FONT_STACK}`
      const textMetrics = ctx.measureText(labelText)
      const pillW = textMetrics.width + 44
      const pillH = 56
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)"
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 4
      ctx.fillStyle = style.bg
      drawRoundedRect(ctx, padding, padding, pillW, pillH, 28)
      ctx.fill()
      ctx.shadowColor = "transparent"
      ctx.fillStyle = style.fg
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      ctx.fillText(labelText, padding + 22, padding + pillH / 2 + 1)
      ctx.restore()
    }

    // 4. Draw Price / Promo Tag (top-right)
    if (priceTag.trim()) {
      const tagText = priceTag.trim()
      ctx.save()
      ctx.font = `700 32px ${MYANMAR_FONT_STACK}`
      const textMetrics = ctx.measureText(tagText)
      const pillW = textMetrics.width + 48
      const pillH = 60
      const pillX = width - padding - pillW
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)"
      ctx.shadowBlur = 16
      ctx.shadowOffsetY = 4
      ctx.fillStyle = "#111827"
      drawRoundedRect(ctx, pillX, padding, pillW, pillH, 18)
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = "#FACC15"
      ctx.stroke()
      ctx.shadowColor = "transparent"
      ctx.fillStyle = "#FACC15"
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(tagText, pillX + pillW / 2, padding + pillH / 2 + 1)
      ctx.restore()
    }

    // 5. Draw Headline Text
    if (headline.trim()) {
      ctx.save()
      ctx.font = `700 ${fontSize}px ${MYANMAR_FONT_STACK}`
      const lineHeight = Math.round(fontSize * 1.45)
      const maxWidth = Math.floor(width * 0.85)
      const lines = wrapCanvasText(ctx, headline.trim(), maxWidth)

      ctx.textAlign = "center"
      ctx.textBaseline = "alphabetic"
      const chosenHex = TEXT_COLORS[textColor].hex
      ctx.fillStyle = chosenHex

      if (textColor === "black") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)"
        ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.1))
        ctx.lineJoin = "round"
      } else {
        ctx.shadowColor = "rgba(0, 0, 0, 0.65)"
        ctx.shadowBlur = 14
        ctx.shadowOffsetY = 3
      }

      const hasTopBadgeOrPrice = badge !== "none" || Boolean(priceTag.trim())
      const startY =
        textPosition === "bottom"
          ? (shopFooter.trim() ? height - 120 : height - 72) -
            (lines.length - 1) * lineHeight
          : (hasTopBadgeOrPrice ? 185 : 96) + fontSize * 0.8

      lines.forEach((line, index) => {
        const y = startY + index * lineHeight
        if (textColor === "black") {
          ctx.strokeText(line, width / 2, y)
        }
        ctx.fillText(line, width / 2, y)
      })
      ctx.restore()
    }

    // 6. Draw Shop Footer / Watermark
    if (shopFooter.trim()) {
      ctx.save()
      ctx.font = `600 28px ${MYANMAR_FONT_STACK}`
      ctx.textAlign = "center"
      ctx.textBaseline = "alphabetic"
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)"
      ctx.shadowBlur = 8
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)"
      ctx.fillText(shopFooter.trim(), width / 2, height - 42, Math.floor(width * 0.85))
      ctx.restore()
    }
  }, [
    loadedImage,
    aspectRatio,
    headline,
    fontSize,
    textColor,
    textPosition,
    badge,
    priceTag,
    shopFooter,
    language,
  ])

  const handleAISuggest = async () => {
    if (!imageDataUrl) return
    setIsAnalyzing(true)
    try {
      const suggestion = await suggestFromPhoto({
        imageBase64: imageDataUrl,
        mimeType: imageMimeType,
        language,
      })
      if (suggestion.headline) {
        setHeadline(suggestion.headline)
      }
      if (suggestion.caption) {
        setCaption(suggestion.caption)
      }
      toast.success(t(language, "photoStudio.aiSuggestSuccess"))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "")
      toast.error(
        msg
          ? `${t(language, "photoStudio.aiSuggestError")}: ${msg}`
          : t(language, "photoStudio.aiSuggestError")
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas || !loadedImage) return
    const dataUrl = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    link.download = `poster-${aspectRatio.replace(":", "x")}-${Date.now()}.png`
    link.href = dataUrl
    link.click()
    toast.success(t(language, "photoStudio.downloadSuccess"))
  }

  const handleCopyCaption = async () => {
    if (!caption.trim()) return
    try {
      await navigator.clipboard.writeText(caption)
      toast.success(t(language, "generator.copySuccess"))
    } catch {
      toast.error(t(language, "generator.copyError"))
    }
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6 leading-[1.85]">
        {t(language, "photoStudio.desc")}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Controls Column */}
        <div className="lg:col-span-6 space-y-5">
          {/* Upload & Aspect Ratio Card */}
          <Card>
            <CardHeader className="pb-4 space-y-1.5">
              <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t(language, "photoStudio.uploadTitle")}
              </CardTitle>
              <CardDescription className="leading-[1.85]">{t(language, "photoStudio.uploadDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                  e.target.value = ""
                }}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/60 hover:bg-accent/40"
                )}
              >
                <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <Button type="button" variant="secondary" size="sm">
                  {imageDataUrl
                    ? t(language, "photoStudio.changePhoto")
                    : t(language, "photoStudio.uploadBtn")}
                </Button>
              </div>

              {/* Aspect Ratio Presets */}
              <div className="space-y-2.5">
                <Label className="leading-[1.85]">{t(language, "photoStudio.aspectRatio")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map((key) => (
                    <Button
                      key={key}
                      type="button"
                      variant={aspectRatio === key ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-auto py-2 px-2 text-xs leading-[1.6] whitespace-normal",
                        aspectRatio === key && "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                      )}
                      onClick={() => setAspectRatio(key)}
                    >
                      {t(language, ASPECT_RATIOS[key].labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* AI Vision Auto-Suggest */}
              <Button
                type="button"
                variant="default"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white leading-[1.85]"
                disabled={!imageDataUrl || isAnalyzing}
                onClick={handleAISuggest}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    {t(language, "photoStudio.aiSuggesting")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t(language, "photoStudio.aiSuggestBtn")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Overlay & Typography Controls */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                <Type className="h-4 w-4" aria-hidden="true" />
                {t(language, "photoStudio.headlineLabel")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2.5">
                <Label htmlFor="poster-headline" className="leading-[1.85]">
                  {t(language, "photoStudio.headlineLabel")}
                </Label>
                <Textarea
                  id="poster-headline"
                  rows={2}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={t(language, "photoStudio.headlinePlaceholder")}
                  className="font-myanmar leading-[1.85]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="poster-font-size" className="leading-[1.85]">
                      {t(language, "photoStudio.fontSize")}
                    </Label>
                    <span className="text-xs text-muted-foreground">{fontSize}px</span>
                  </div>
                  <input
                    id="poster-font-size"
                    type="range"
                    min={36}
                    max={96}
                    step={2}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label className="leading-[1.85]">{t(language, "photoStudio.positionLabel")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["bottom", "top"] as TextPositionKey[]).map((pos) => (
                      <Button
                        key={pos}
                        type="button"
                        size="sm"
                        variant={textPosition === pos ? "default" : "outline"}
                        className={cn(
                          "leading-[1.85]",
                          textPosition === pos && "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                        )}
                        onClick={() => setTextPosition(pos)}
                      >
                        {t(
                          language,
                          pos === "bottom"
                            ? "photoStudio.positionBottom"
                            : "photoStudio.positionTop"
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Text Color */}
              <div className="space-y-2.5">
                <Label className="leading-[1.85]">{t(language, "photoStudio.textColor")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TEXT_COLORS) as TextColorKey[]).map((c) => (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant={textColor === c ? "default" : "outline"}
                      onClick={() => setTextColor(c)}
                      className={cn(
                        "flex items-center gap-2 leading-[1.85]",
                        textColor === c && "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: TEXT_COLORS[c].hex }}
                      />
                      <span>{t(language, TEXT_COLORS[c].labelKey)}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Marketing Badge & Price Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <Label htmlFor="poster-badge" className="flex items-center gap-1.5 leading-[1.85]">
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(language, "photoStudio.badgeLabel")}
                  </Label>
                  <Select
                    id="poster-badge"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value as BadgeKey)}
                    className="leading-[1.85]"
                  >
                    <option value="none">{t(language, "photoStudio.badgeNone")}</option>
                    <option value="new">{t(language, "photoStudio.badgeNew")}</option>
                    <option value="discount">
                      {t(language, "photoStudio.badgeDiscount")}
                    </option>
                    <option value="limited">
                      {t(language, "photoStudio.badgeLimited")}
                    </option>
                  </Select>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="poster-price" className="leading-[1.85]">
                    {t(language, "photoStudio.priceTagLabel")}
                  </Label>
                  <Input
                    id="poster-price"
                    value={priceTag}
                    onChange={(e) => setPriceTag(e.target.value)}
                    placeholder={t(language, "photoStudio.priceTagPlaceholder")}
                    className="font-myanmar leading-[1.85]"
                  />
                </div>
              </div>

              {/* Shop Footer / Watermark */}
              <div className="space-y-2.5">
                <Label htmlFor="poster-footer" className="leading-[1.85]">
                  {t(language, "photoStudio.footerLabel")}
                </Label>
                <Input
                  id="poster-footer"
                  value={shopFooter}
                  onChange={(e) => setShopFooter(e.target.value)}
                  placeholder={t(language, "photoStudio.footerPlaceholder")}
                  className="font-myanmar leading-[1.85]"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Live Preview & Caption Column */}
        <div className="lg:col-span-6 space-y-5">
          <Card>
            <CardHeader className="pb-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base leading-[1.85]">
                {t(language, "photoStudio.previewTitle")}
              </CardTitle>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!loadedImage}
                onClick={handleDownload}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {t(language, "photoStudio.downloadPoster")}
              </Button>
            </CardHeader>
            <CardContent>
              {!loadedImage ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 min-h-[320px] p-6 text-center text-muted-foreground">
                  <ImagePlus className="h-10 w-10 mb-2 opacity-50" aria-hidden="true" />
                  <p className="text-sm leading-[1.85]">{t(language, "photoStudio.emptyPreview")}</p>
                </div>
              ) : (
                <div className="flex justify-center bg-muted/20 rounded-xl p-2 sm:p-4 border">
                  <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-[540px] w-auto h-auto rounded-lg shadow-md object-contain"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Social Media Caption Box */}
          <Card>
            <CardHeader className="pb-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base leading-[1.85]">
                {t(language, "photoStudio.captionTitle")}
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!caption.trim()}
                onClick={handleCopyCaption}
              >
                <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {t(language, "photoStudio.copyCaption")}
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t(language, "photoStudio.captionPlaceholder")}
                className="font-myanmar leading-[1.85]"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

