"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Copy,
  Download,
  Flame,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tag,
  Type,
  Upload,
  Utensils,
  Shirt,
  PackagePlus,
  RotateCcw,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"
import { suggestFromPhoto, type PhotoCategoryKey } from "@/api/aiService"
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
type LayoutTemplateKey = "gradient" | "split" | "glass" | "frame"
type BadgeKey = "none" | "new" | "discount" | "limited" | "delivery"
type TextColorKey = "white" | "yellow" | "black"
type TextPositionKey = "bottom" | "top"

interface CategoryTheme {
  labelKey: string
  accent: string
  accentSecondary: string
  frameBgStart: string
  frameBgEnd: string
  defaultBadge: BadgeKey
  icon: typeof Smartphone
}

const CATEGORY_THEMES: Record<PhotoCategoryKey, CategoryTheme> = {
  tech: {
    labelKey: "photoStudio.catTech",
    accent: "#3B82F6",
    accentSecondary: "#0EA5E9",
    frameBgStart: "#0F172A",
    frameBgEnd: "#1E3A8A",
    defaultBadge: "none",
    icon: Smartphone,
  },
  flash_sale: {
    labelKey: "photoStudio.catFlashSale",
    accent: "#EF4444",
    accentSecondary: "#F97316",
    frameBgStart: "#450A0A",
    frameBgEnd: "#9A3412",
    defaultBadge: "discount",
    icon: Flame,
  },
  new_arrival: {
    labelKey: "photoStudio.catNewArrival",
    accent: "#10B981",
    accentSecondary: "#14B8A6",
    frameBgStart: "#064E3B",
    frameBgEnd: "#0F172A",
    defaultBadge: "new",
    icon: PackagePlus,
  },
  fashion: {
    labelKey: "photoStudio.catFashion",
    accent: "#E11D48",
    accentSecondary: "#F59E0B",
    frameBgStart: "#4C0519",
    frameBgEnd: "#78350F",
    defaultBadge: "none",
    icon: Shirt,
  },
  food: {
    labelKey: "photoStudio.catFood",
    accent: "#D97706",
    accentSecondary: "#F59E0B",
    frameBgStart: "#451A03",
    frameBgEnd: "#78350F",
    defaultBadge: "delivery",
    icon: Utensils,
  },
}

const LAYOUT_TEMPLATES: { key: LayoutTemplateKey; labelKey: string }[] = [
  { key: "gradient", labelKey: "photoStudio.layoutGradient" },
  { key: "split", labelKey: "photoStudio.layoutSplit" },
  { key: "glass", labelKey: "photoStudio.layoutGlass" },
  { key: "frame", labelKey: "photoStudio.layoutFrame" },
]

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
  delivery: { bg: "#D97706", fg: "#FFFFFF", labelKey: "photoStudio.badgeDelivery" },
}

const MYANMAR_FONT_STACK =
  '"Noto Sans Myanmar", "Pyidaungsu", "Padauk", system-ui, -apple-system, sans-serif'

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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  brightness: number,
  contrast: number,
  extraBlurPx = 0
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  const filterParts = [`brightness(${brightness}%)`, `contrast(${contrast}%)`]
  if (extraBlurPx > 0) {
    filterParts.push(`blur(${extraBlurPx}px)`)
  }
  ctx.filter = filterParts.join(" ")

  const imgRatio = img.naturalWidth / img.naturalHeight
  const boxRatio = w / h
  let drawW = w
  let drawH = h
  let offsetX = x
  let offsetY = y

  if (imgRatio > boxRatio) {
    drawH = h
    drawW = h * imgRatio
    offsetX = x + (w - drawW) / 2
  } else {
    drawW = w
    drawH = w / imgRatio
    offsetY = y + (h - drawH) / 2
  }

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH)
  ctx.filter = "none"
  ctx.restore()
}

function drawMarketingBadge(
  ctx: CanvasRenderingContext2D,
  badge: BadgeKey,
  language: "en" | "my",
  x: number,
  y: number
) {
  if (badge === "none") return
  const style = BADGE_STYLES[badge]
  const labelText = t(language, style.labelKey).toUpperCase()
  ctx.save()
  ctx.font = `700 26px ${MYANMAR_FONT_STACK}`
  const textMetrics = ctx.measureText(labelText)
  const pillW = textMetrics.width + 44
  const pillH = 54
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)"
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 4
  ctx.fillStyle = style.bg
  drawRoundedRect(ctx, x, y, pillW, pillH, 27)
  ctx.fill()
  ctx.shadowColor = "transparent"
  ctx.fillStyle = style.fg
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.fillText(labelText, x + 22, y + pillH / 2 + 1)
  ctx.restore()
}

function drawPriceComparisonBadge(
  ctx: CanvasRenderingContext2D,
  priceTag: string,
  originalPrice: string,
  rightX: number,
  y: number,
  accentColor: string
) {
  const promo = priceTag.trim()
  const orig = originalPrice.trim()
  if (!promo && !orig) return

  ctx.save()
  const pillH = 60

  if (orig && promo) {
    ctx.font = `600 24px ${MYANMAR_FONT_STACK}`
    const origW = ctx.measureText(orig).width
    ctx.font = `700 30px ${MYANMAR_FONT_STACK}`
    const promoW = ctx.measureText(promo).width

    const gap = 18
    const padX = 24
    const pillW = padX * 2 + origW + gap + promoW
    const pillX = rightX - pillW

    ctx.shadowColor = "rgba(0, 0, 0, 0.42)"
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 4
    ctx.fillStyle = "#111827"
    drawRoundedRect(ctx, pillX, y, pillW, pillH, 18)
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = accentColor
    ctx.stroke()
    ctx.shadowColor = "transparent"

    // Original strikethrough price
    const origX = pillX + padX
    const centerY = y + pillH / 2 + 1
    ctx.font = `600 24px ${MYANMAR_FONT_STACK}`
    ctx.fillStyle = "#9CA3AF"
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    ctx.fillText(orig, origX, centerY)

    ctx.strokeStyle = "#EF4444"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(origX - 3, centerY)
    ctx.lineTo(origX + origW + 3, centerY)
    ctx.stroke()

    // Promo sale price
    ctx.font = `700 30px ${MYANMAR_FONT_STACK}`
    ctx.fillStyle = "#FACC15"
    ctx.fillText(promo, origX + origW + gap, centerY)
  } else {
    const tagText = promo || orig
    ctx.font = `700 30px ${MYANMAR_FONT_STACK}`
    const textMetrics = ctx.measureText(tagText)
    const pillW = textMetrics.width + 48
    const pillX = rightX - pillW

    ctx.shadowColor = "rgba(0, 0, 0, 0.4)"
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 4
    ctx.fillStyle = "#111827"
    drawRoundedRect(ctx, pillX, y, pillW, pillH, 18)
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = accentColor
    ctx.stroke()
    ctx.shadowColor = "transparent"

    ctx.fillStyle = "#FACC15"
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    ctx.fillText(tagText, pillX + pillW / 2, y + pillH / 2 + 1)
  }
  ctx.restore()
}

function layoutSpecPillRows(
  ctx: CanvasRenderingContext2D,
  specs: string[],
  maxWidth: number
): { rows: { text: string; width: number }[][]; totalHeight: number } {
  const cleanSpecs = specs.map((s) => s.trim()).filter(Boolean)
  if (cleanSpecs.length === 0) return { rows: [], totalHeight: 0 }

  ctx.save()
  ctx.font = `600 24px ${MYANMAR_FONT_STACK}`
  const padX = 28
  const gap = 14
  const pillH = 46

  const rows: { text: string; width: number }[][] = []
  let currentRow: { text: string; width: number }[] = []
  let currentRowW = 0

  for (const text of cleanSpecs) {
    const w = Math.min(ctx.measureText(text).width + padX, maxWidth)
    const nextW = currentRow.length === 0 ? w : currentRowW + gap + w
    if (nextW <= maxWidth || currentRow.length === 0) {
      currentRow.push({ text, width: w })
      currentRowW = nextW
    } else {
      rows.push(currentRow)
      currentRow = [{ text, width: w }]
      currentRowW = w
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)
  ctx.restore()

  const totalHeight = rows.length * pillH + (rows.length - 1) * 12
  return { rows, totalHeight }
}

function drawSpecPillRows(
  ctx: CanvasRenderingContext2D,
  rows: { text: string; width: number }[][],
  centerX: number,
  startY: number,
  bgColor: string,
  borderColor: string,
  textColor: string
) {
  if (rows.length === 0) return
  ctx.save()
  ctx.font = `600 24px ${MYANMAR_FONT_STACK}`
  const pillH = 46
  const gap = 14
  const rowGap = 12

  rows.forEach((row, rIdx) => {
    const rowWidth =
      row.reduce((sum, p) => sum + p.width, 0) + Math.max(0, row.length - 1) * gap
    let cursorX = centerX - rowWidth / 2
    const y = startY + rIdx * (pillH + rowGap)

    for (const pill of row) {
      ctx.fillStyle = bgColor
      drawRoundedRect(ctx, cursorX, y, pill.width, pillH, 23)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = borderColor
      ctx.stroke()

      ctx.fillStyle = textColor
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(pill.text, cursorX + pill.width / 2, y + pillH / 2 + 1, pill.width - 16)
      cursorX += pill.width + gap
    }
  })

  ctx.restore()
}

export function PhotoStudioPage() {
  const language = useUIStore(useShallow((state) => state.language))

  const [category, setCategory] = useState<PhotoCategoryKey>("tech")
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateKey>("gradient")

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg")
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>("1:1")
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)

  const [headline, setHeadline] = useState("")
  const [fontSize, setFontSize] = useState(60)
  const [textColor, setTextColor] = useState<TextColorKey>("white")
  const [textPosition, setTextPosition] = useState<TextPositionKey>("bottom")
  const [badge, setBadge] = useState<BadgeKey>("none")

  const [spec1, setSpec1] = useState("")
  const [spec2, setSpec2] = useState("")
  const [spec3, setSpec3] = useState("")

  const [originalPrice, setOriginalPrice] = useState("")
  const [priceTag, setPriceTag] = useState("")
  const [shopFooter, setShopFooter] = useState("")

  const [caption, setCaption] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const handleCategoryChange = (nextCat: PhotoCategoryKey) => {
    setCategory(nextCat)
    setBadge(CATEGORY_THEMES[nextCat].defaultBadge)
  }

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

  // Render high-resolution HTML5 Canvas poster across all 4 layouts
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loadedImage) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = ASPECT_RATIOS[aspectRatio]
    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)

    const theme = CATEGORY_THEMES[category]
    const padding = 52
    const maxTextWidth = Math.floor(width * 0.85)
    const specs = [spec1, spec2, spec3]
    const chosenHex = TEXT_COLORS[textColor].hex

    if (layoutTemplate === "gradient") {
      // 1. Full-bleed photo with brightness/contrast filter
      drawCoverImage(ctx, loadedImage, 0, 0, width, height, brightness, contrast)

      // 2. Category-aware smooth gradient overlay
      const hasContent =
        headline.trim() || specs.some((s) => s.trim()) || shopFooter.trim()
      if (hasContent) {
        if (textPosition === "bottom") {
          const grad = ctx.createLinearGradient(0, height * 0.42, 0, height)
          grad.addColorStop(0, "rgba(0, 0, 0, 0)")
          grad.addColorStop(0.55, "rgba(0, 0, 0, 0.52)")
          grad.addColorStop(1, "rgba(0, 0, 0, 0.88)")
          ctx.fillStyle = grad
          ctx.fillRect(0, height * 0.42, width, height * 0.58)
        } else {
          const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.52)
          topGrad.addColorStop(0, "rgba(0, 0, 0, 0.86)")
          topGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.48)")
          topGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
          ctx.fillStyle = topGrad
          ctx.fillRect(0, 0, width, height * 0.52)

          if (shopFooter.trim()) {
            const footerGrad = ctx.createLinearGradient(0, height * 0.84, 0, height)
            footerGrad.addColorStop(0, "rgba(0, 0, 0, 0)")
            footerGrad.addColorStop(1, "rgba(0, 0, 0, 0.78)")
            ctx.fillStyle = footerGrad
            ctx.fillRect(0, height * 0.84, width, height * 0.16)
          }
        }
      }

      drawMarketingBadge(ctx, badge, language, padding, padding)
      drawPriceComparisonBadge(
        ctx,
        priceTag,
        category === "flash_sale" ? originalPrice : "",
        width - padding,
        padding,
        theme.accent
      )

      const specLayout = layoutSpecPillRows(ctx, specs, maxTextWidth)
      const specBlockH = specLayout.totalHeight > 0 ? specLayout.totalHeight + 26 : 0

      if (headline.trim()) {
        ctx.save()
        ctx.font = `700 ${fontSize}px ${MYANMAR_FONT_STACK}`
        const lineHeight = Math.round(fontSize * 1.48)
        const lines = wrapCanvasText(ctx, headline.trim(), maxTextWidth)

        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
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

        const hasTopBadgeOrPrice =
          badge !== "none" ||
          Boolean(priceTag.trim()) ||
          (category === "flash_sale" && Boolean(originalPrice.trim()))
        const footerOffset = shopFooter.trim() ? 116 : 68
        const startY =
          textPosition === "bottom"
            ? height - footerOffset - specBlockH - (lines.length - 1) * lineHeight
            : (hasTopBadgeOrPrice ? 180 : 96) + fontSize * 0.8

        lines.forEach((line, index) => {
          const y = startY + index * lineHeight
          if (textColor === "black") ctx.strokeText(line, width / 2, y)
          ctx.fillText(line, width / 2, y)
        })
        ctx.restore()

        if (specLayout.rows.length > 0) {
          const lastLineY = startY + (lines.length - 1) * lineHeight
          drawSpecPillRows(
            ctx,
            specLayout.rows,
            width / 2,
            lastLineY + 28,
            "rgba(15, 23, 42, 0.72)",
            theme.accent,
            "#FFFFFF"
          )
        }
      } else if (specLayout.rows.length > 0) {
        const footerOffset = shopFooter.trim() ? 105 : 64
        const pillsY =
          textPosition === "bottom"
            ? height - footerOffset - specLayout.totalHeight
            : 165
        drawSpecPillRows(
          ctx,
          specLayout.rows,
          width / 2,
          pillsY,
          "rgba(15, 23, 42, 0.72)",
          theme.accent,
          "#FFFFFF"
        )
      }

      if (shopFooter.trim()) {
        ctx.save()
        ctx.font = `600 28px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.shadowColor = "rgba(0, 0, 0, 0.75)"
        ctx.shadowBlur = 8
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
        ctx.fillText(shopFooter.trim(), width / 2, height - 40, maxTextWidth)
        ctx.restore()
      }
    } else if (layoutTemplate === "split") {
      // Split Card: Top 65% clean unobstructed product photo + bottom 35% solid card
      const photoH = Math.round(height * 0.65)
      const cardY = photoH
      const cardH = height - photoH

      drawCoverImage(ctx, loadedImage, 0, 0, width, photoH, brightness, contrast)

      drawMarketingBadge(ctx, badge, language, padding, padding)
      drawPriceComparisonBadge(
        ctx,
        priceTag,
        category === "flash_sale" ? originalPrice : "",
        width - padding,
        padding,
        theme.accent
      )

      // Solid bottom card (light if black text, deep slate if white/yellow text)
      const isLightCard = textColor === "black"
      ctx.fillStyle = isLightCard ? "#F8FAFC" : "#0F172A"
      ctx.fillRect(0, cardY, width, cardH)

      // Category accent divider bar
      const barGrad = ctx.createLinearGradient(0, cardY, width, cardY)
      barGrad.addColorStop(0, theme.accent)
      barGrad.addColorStop(1, theme.accentSecondary)
      ctx.fillStyle = barGrad
      ctx.fillRect(0, cardY, width, 8)

      const specLayout = layoutSpecPillRows(ctx, specs, maxTextWidth)
      const effectiveFontSize = Math.min(fontSize, 56)
      ctx.save()
      ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
      const lines = headline.trim()
        ? wrapCanvasText(ctx, headline.trim(), maxTextWidth)
        : []
      const lineHeight = Math.round(effectiveFontSize * 1.44)
      ctx.restore()

      const headlineH = lines.length > 0 ? lines.length * lineHeight : 0
      const specH = specLayout.totalHeight > 0 ? specLayout.totalHeight + 22 : 0
      const footerH = shopFooter.trim() ? 48 : 0
      const totalBlockH = headlineH + specH + footerH
      let cursorY = cardY + Math.max(44, (cardH - totalBlockH) / 2)

      if (lines.length > 0) {
        ctx.save()
        ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = isLightCard ? "#0F172A" : chosenHex
        const firstBaseline = cursorY + effectiveFontSize * 0.85
        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, firstBaseline + idx * lineHeight)
        })
        ctx.restore()
        cursorY += headlineH + 14
      }

      if (specLayout.rows.length > 0) {
        drawSpecPillRows(
          ctx,
          specLayout.rows,
          width / 2,
          cursorY,
          isLightCard ? "#E2E8F0" : "rgba(30, 41, 59, 0.95)",
          theme.accent,
          isLightCard ? "#0F172A" : "#FFFFFF"
        )
        cursorY += specLayout.totalHeight + 20
      }

      if (shopFooter.trim()) {
        ctx.save()
        ctx.font = `600 26px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = isLightCard ? "#475569" : "rgba(226, 232, 240, 0.88)"
        ctx.fillText(
          shopFooter.trim(),
          width / 2,
          Math.min(height - 28, cursorY + 28),
          maxTextWidth
        )
        ctx.restore()
      }
    } else if (layoutTemplate === "glass") {
      // Glass Card: Full-bleed photo + centered frosted-glass floating card at bottom
      drawCoverImage(ctx, loadedImage, 0, 0, width, height, brightness, contrast)

      drawMarketingBadge(ctx, badge, language, padding, padding)
      drawPriceComparisonBadge(
        ctx,
        priceTag,
        category === "flash_sale" ? originalPrice : "",
        width - padding,
        padding,
        theme.accent
      )

      const cardW = Math.round(width * 0.88)
      const cardX = (width - cardW) / 2
      const innerMaxW = Math.floor(cardW * 0.88)

      const effectiveFontSize = Math.min(fontSize, 58)
      ctx.save()
      ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
      const lines = headline.trim()
        ? wrapCanvasText(ctx, headline.trim(), innerMaxW)
        : []
      const lineHeight = Math.round(effectiveFontSize * 1.46)
      ctx.restore()

      const specLayout = layoutSpecPillRows(ctx, specs, innerMaxW)
      const headlineBlockH = lines.length > 0 ? lines.length * lineHeight : 0
      const specBlockH = specLayout.totalHeight > 0 ? specLayout.totalHeight + 24 : 0
      const footerBlockH = shopFooter.trim() ? 52 : 0
      const cardPadY = 38
      const cardH = Math.max(
        140,
        cardPadY * 2 + headlineBlockH + specBlockH + footerBlockH
      )
      const cardY = height - 44 - cardH

      const isLightGlass = textColor === "black"

      // Draw frosted glass backdrop by re-drawing blurred image inside clipped rounded rect
      ctx.save()
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32)
      ctx.clip()
      drawCoverImage(ctx, loadedImage, 0, 0, width, height, brightness, contrast, 20)
      ctx.fillStyle = isLightGlass
        ? "rgba(255, 255, 255, 0.72)"
        : "rgba(15, 23, 42, 0.62)"
      ctx.fillRect(cardX, cardY, cardW, cardH)
      ctx.restore()

      // Glass border
      ctx.save()
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32)
      ctx.lineWidth = 2
      ctx.strokeStyle = isLightGlass
        ? "rgba(255, 255, 255, 0.85)"
        : "rgba(255, 255, 255, 0.28)"
      ctx.stroke()
      ctx.restore()

      let cursorY = cardY + cardPadY
      if (lines.length > 0) {
        ctx.save()
        ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = chosenHex
        const firstBaseline = cursorY + effectiveFontSize * 0.85
        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, firstBaseline + idx * lineHeight)
        })
        ctx.restore()
        cursorY += headlineBlockH + 16
      }

      if (specLayout.rows.length > 0) {
        drawSpecPillRows(
          ctx,
          specLayout.rows,
          width / 2,
          cursorY,
          isLightGlass ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.14)",
          theme.accent,
          isLightGlass ? "#0F172A" : "#FFFFFF"
        )
        cursorY += specLayout.totalHeight + 22
      }

      if (shopFooter.trim()) {
        ctx.save()
        ctx.font = `600 26px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = isLightGlass ? "#334155" : "rgba(255, 255, 255, 0.9)"
        ctx.fillText(shopFooter.trim(), width / 2, cardY + cardH - 28, innerMaxW)
        ctx.restore()
      }
    } else {
      // Poster Frame: Branded border frame + inset rounded photo + top badge & bottom info bar
      const bgGrad = ctx.createLinearGradient(0, 0, width, height)
      bgGrad.addColorStop(0, theme.frameBgStart)
      bgGrad.addColorStop(1, theme.frameBgEnd)
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // Subtle inner frame border
      ctx.save()
      drawRoundedRect(ctx, 22, 22, width - 44, height - 44, 34)
      ctx.lineWidth = 2
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
      ctx.stroke()
      ctx.restore()

      const frameMargin = 54
      const topBarH = 128
      const bottomBarH = Math.round(height * 0.27)
      const photoX = frameMargin
      const photoY = topBarH
      const photoW = width - frameMargin * 2
      const photoH = height - topBarH - bottomBarH

      // Shadow behind inset photo
      ctx.save()
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)"
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 10
      ctx.fillStyle = "#000000"
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 28)
      ctx.fill()
      ctx.restore()

      // Inset rounded photo
      ctx.save()
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 28)
      ctx.clip()
      drawCoverImage(ctx, loadedImage, photoX, photoY, photoW, photoH, brightness, contrast)
      ctx.restore()

      // Crisp border around inset photo
      ctx.save()
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 28)
      ctx.lineWidth = 3
      ctx.strokeStyle = theme.accent
      ctx.stroke()
      ctx.restore()

      // Top badge & price in top bar
      drawMarketingBadge(ctx, badge, language, frameMargin, 38)
      drawPriceComparisonBadge(
        ctx,
        priceTag,
        category === "flash_sale" ? originalPrice : "",
        width - frameMargin,
        36,
        theme.accent
      )

      // Bottom info bar
      const infoTop = photoY + photoH + 26
      const specLayout = layoutSpecPillRows(ctx, specs, maxTextWidth)
      const effectiveFontSize = Math.min(fontSize, 52)
      ctx.save()
      ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
      const lines = headline.trim()
        ? wrapCanvasText(ctx, headline.trim(), maxTextWidth)
        : []
      const lineHeight = Math.round(effectiveFontSize * 1.44)
      ctx.restore()

      let cursorY = infoTop
      if (lines.length > 0) {
        ctx.save()
        ctx.font = `700 ${effectiveFontSize}px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = textColor === "black" ? "#FFFFFF" : chosenHex
        const firstBaseline = cursorY + effectiveFontSize * 0.85
        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, firstBaseline + idx * lineHeight)
        })
        ctx.restore()
        cursorY += lines.length * lineHeight + 14
      }

      if (specLayout.rows.length > 0) {
        drawSpecPillRows(
          ctx,
          specLayout.rows,
          width / 2,
          cursorY,
          "rgba(255, 255, 255, 0.12)",
          theme.accent,
          "#FFFFFF"
        )
      }

      if (shopFooter.trim()) {
        ctx.save()
        ctx.font = `600 26px ${MYANMAR_FONT_STACK}`
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillStyle = "rgba(255, 255, 255, 0.88)"
        ctx.fillText(shopFooter.trim(), width / 2, height - 42, maxTextWidth)
        ctx.restore()
      }
    }
  }, [
    loadedImage,
    category,
    layoutTemplate,
    aspectRatio,
    brightness,
    contrast,
    headline,
    fontSize,
    textColor,
    textPosition,
    badge,
    spec1,
    spec2,
    spec3,
    originalPrice,
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
        category,
      })
      if (suggestion.headline) setHeadline(suggestion.headline)
      if (suggestion.spec1) setSpec1(suggestion.spec1)
      if (suggestion.spec2) setSpec2(suggestion.spec2)
      if (suggestion.spec3) setSpec3(suggestion.spec3)
      if (suggestion.suggestedPrice) setPriceTag(suggestion.suggestedPrice)
      if (suggestion.caption) setCaption(suggestion.caption)
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
    link.download = `poster-${category}-${layoutTemplate}-${aspectRatio.replace(":", "x")}-${Date.now()}.png`
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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground leading-[1.85]">
        {t(language, "photoStudio.desc")}
      </p>

      {/* Top Business Design Category Selector (5 Presets) */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="space-y-3">
            <Label className="text-sm font-semibold leading-[1.85]">
              {t(language, "photoStudio.categoryLabel")}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {(Object.keys(CATEGORY_THEMES) as PhotoCategoryKey[]).map((key) => {
                const theme = CATEGORY_THEMES[key]
                const Icon = theme.icon
                const active = category === key
                return (
                  <Button
                    key={key}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => handleCategoryChange(key)}
                    className={cn(
                      "h-auto py-2.5 px-3 flex items-center justify-start gap-2 text-left text-xs leading-[1.6] whitespace-normal",
                      active && "bg-blue-600 hover:bg-blue-700 text-white border-transparent shadow-sm"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="font-myanmar">{t(language, theme.labelKey)}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Controls Column */}
        <div className="lg:col-span-6 space-y-5">
          {/* Upload, Aspect Ratio & Zero-Quota Photo Enhancer Card */}
          <Card>
            <CardHeader className="pb-4 space-y-1.5">
              <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t(language, "photoStudio.uploadTitle")}
              </CardTitle>
              <CardDescription className="leading-[1.85]">
                {t(language, "photoStudio.uploadDesc")}
              </CardDescription>
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
                        aspectRatio === key &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                      )}
                      onClick={() => setAspectRatio(key)}
                    >
                      {t(language, ASPECT_RATIOS[key].labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Zero-Quota Photo Enhancer Sliders */}
              <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground leading-[1.6]">
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(language, "photoStudio.enhancerTitle")}
                  </span>
                  {(brightness !== 100 || contrast !== 100) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setBrightness(100)
                        setContrast(100)
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                      {t(language, "photoStudio.resetEnhancer")}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="photo-brightness" className="text-xs">
                        {t(language, "photoStudio.brightness")}
                      </Label>
                      <span className="text-muted-foreground tabular-nums">{brightness}%</span>
                    </div>
                    <input
                      id="photo-brightness"
                      type="range"
                      min={70}
                      max={130}
                      step={2}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Label htmlFor="photo-contrast" className="text-xs">
                        {t(language, "photoStudio.contrast")}
                      </Label>
                      <span className="text-muted-foreground tabular-nums">{contrast}%</span>
                    </div>
                    <input
                      id="photo-contrast"
                      type="range"
                      min={80}
                      max={130}
                      step={2}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
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

          {/* Layout Template, Typography & Category Fields Card */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                {t(language, "photoStudio.layoutLabel")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 4 Selectable Poster Layout Templates */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LAYOUT_TEMPLATES.map((tpl) => {
                  const active = layoutTemplate === tpl.key
                  return (
                    <Button
                      key={tpl.key}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => setLayoutTemplate(tpl.key)}
                      className={cn(
                        "h-auto py-2 px-2 text-xs leading-[1.6] whitespace-normal",
                        active &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                      )}
                    >
                      {t(language, tpl.labelKey)}
                    </Button>
                  )
                })}
              </div>

              {/* Headline */}
              <div className="space-y-2.5">
                <Label htmlFor="poster-headline" className="flex items-center gap-1.5 leading-[1.85]">
                  <Type className="h-3.5 w-3.5" aria-hidden="true" />
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

              {/* Spec Pills (3 inputs - always available, highlighted for Tech & Gadgets) */}
              <div className="space-y-2">
                <Label className="leading-[1.85]">{t(language, "photoStudio.specsLabel")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    value={spec1}
                    onChange={(e) => setSpec1(e.target.value)}
                    placeholder={t(language, "photoStudio.spec1Placeholder")}
                    className="font-myanmar text-xs leading-[1.85]"
                  />
                  <Input
                    value={spec2}
                    onChange={(e) => setSpec2(e.target.value)}
                    placeholder={t(language, "photoStudio.spec2Placeholder")}
                    className="font-myanmar text-xs leading-[1.85]"
                  />
                  <Input
                    value={spec3}
                    onChange={(e) => setSpec3(e.target.value)}
                    placeholder={t(language, "photoStudio.spec3Placeholder")}
                    className="font-myanmar text-xs leading-[1.85]"
                  />
                </div>
              </div>

              {/* Font Size & Position */}
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
                        disabled={layoutTemplate !== "gradient"}
                        variant={textPosition === pos ? "default" : "outline"}
                        className={cn(
                          "leading-[1.85]",
                          textPosition === pos &&
                            layoutTemplate === "gradient" &&
                            "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
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
                        textColor === c &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
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

              {/* Marketing Badge & Price Tag (plus Original Price for Flash Sale) */}
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
                    <option value="discount">{t(language, "photoStudio.badgeDiscount")}</option>
                    <option value="limited">{t(language, "photoStudio.badgeLimited")}</option>
                    <option value="delivery">{t(language, "photoStudio.badgeDelivery")}</option>
                  </Select>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="poster-price" className="leading-[1.85]">
                    {category === "flash_sale"
                      ? t(language, "photoStudio.promoPriceLabel")
                      : t(language, "photoStudio.priceTagLabel")}
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

              {category === "flash_sale" && (
                <div className="space-y-2.5">
                  <Label htmlFor="poster-original-price" className="leading-[1.85]">
                    {t(language, "photoStudio.originalPriceLabel")}
                  </Label>
                  <Input
                    id="poster-original-price"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder={t(language, "photoStudio.originalPricePlaceholder")}
                    className="font-myanmar leading-[1.85]"
                  />
                </div>
              )}

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
