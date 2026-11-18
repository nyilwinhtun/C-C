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
  Stamp,
  Wand2,
  Trash2,
  Eye,
  EyeOff,
  Scissors,
  Layers,
  AlertCircle,
} from "lucide-react"
import { removeBackground } from "@imgly/background-removal"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { t } from "@/locales/translations"
import {
  suggestFromPhoto,
  type PhotoCategoryKey,
} from "@/api/aiService"
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
import { Skeleton } from "@/components/ui/skeleton"
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

const BRAND_LOGO_STORAGE_KEY = "content-creator-brand-logo"
const BRAND_LOGO_ENABLED_KEY = "content-creator-brand-logo-enabled"
const BRAND_LOGO_POSITION_KEY = "content-creator-brand-logo-position"

type LogoPositionKey = "top-left" | "top-right"

const PROMO_STAMPS = [
  "COD ရသည်",
  "Instock ရှိသည်",
  "အာမခံ ၁ နှစ်ပါသည်",
  "Free Delivery",
] as const

const SCENE_PRESETS = [
  {
    id: "white",
    labelKey: "photoStudio.scenePresetWhite",
    prompt:
      "Clean, seamless pure white photography studio cyclorama backdrop with soft diffused overhead lighting and subtle natural contact shadow under the product",
  },
  {
    id: "desk",
    labelKey: "photoStudio.scenePresetDesk",
    prompt:
      "Modern minimalist dark oak tech desk setup with soft ambient LED rim light, sleek matte desk mat, and subtle shallow depth-of-field background",
  },
  {
    id: "marble",
    labelKey: "photoStudio.scenePresetMarble",
    prompt:
      "Luxury white and gold-veined Carrara marble tabletop with warm natural window sunlight and soft editorial shadows",
  },
  {
    id: "cafe",
    labelKey: "photoStudio.scenePresetCafe",
    prompt:
      "Warm rustic wooden cafe table with cozy golden hour ambient light and softly blurred warm cafe interior background",
  },
] as const

type StudioBackdropKey =
  | "white"
  | "slate"
  | "indigo"
  | "sunset"
  | "emerald"
  | "black"
  | "desk"
  | "marble"
  | "cafe"
  | "pastel"

type ScenePresetId = "white" | "desk" | "marble" | "cafe"

function resolveSceneFromPrompt(prompt: string): StudioBackdropKey {
  const lower = prompt.toLowerCase()
  if (/(desk|tech|cyber|gaming|monitor|keyboard|neon|navy|dark)/.test(lower)) {
    return "desk"
  }
  if (/(marble|luxury|carrara|stone|travertine|granite)/.test(lower)) {
    return "marble"
  }
  if (/(cafe|coffee|wood|oak|walnut|rustic|table|bakery)/.test(lower)) {
    return "cafe"
  }
  if (/(pastel|pink|rose|peach|morning|podium|blush|cream|lavender)/.test(lower)) {
    return "pastel"
  }
  if (/(emerald|forest|mint|nature|leaf|green)/.test(lower)) {
    return "emerald"
  }
  if (/(sunset|gold|golden|amber|orange)/.test(lower)) {
    return "sunset"
  }
  if (/(indigo|royal|purple|violet|galaxy)/.test(lower)) {
    return "indigo"
  }
  if (/(black|obsidian|midnight|pitch)/.test(lower)) {
    return "black"
  }
  if (/(slate|gray|grey|concrete|cement)/.test(lower)) {
    return "slate"
  }
  return "white"
}

function isDarkStudioBackdrop(backdrop: StudioBackdropKey): boolean {
  return (
    backdrop === "indigo" ||
    backdrop === "emerald" ||
    backdrop === "black" ||
    backdrop === "desk" ||
    backdrop === "cafe"
  )
}

interface StudioBackdropOption {
  id: StudioBackdropKey
  labelKey: string
  swatchStyle: string
  isDark: boolean
}

const STUDIO_BACKDROPS: StudioBackdropOption[] = [
  {
    id: "white",
    labelKey: "photoStudio.backdropWhite",
    swatchStyle: "linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)",
    isDark: false,
  },
  {
    id: "slate",
    labelKey: "photoStudio.backdropSlate",
    swatchStyle: "linear-gradient(145deg, #f8fafc 0%, #cbd5e1 100%)",
    isDark: false,
  },
  {
    id: "indigo",
    labelKey: "photoStudio.backdropIndigo",
    swatchStyle: "linear-gradient(145deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)",
    isDark: true,
  },
  {
    id: "sunset",
    labelKey: "photoStudio.backdropSunset",
    swatchStyle: "linear-gradient(145deg, #fef3c7 0%, #f59e0b 55%, #ea580c 100%)",
    isDark: false,
  },
  {
    id: "emerald",
    labelKey: "photoStudio.backdropEmerald",
    swatchStyle: "radial-gradient(circle at 50% 42%, #10b981 0%, #065f46 48%, #022c22 100%)",
    isDark: true,
  },
  {
    id: "black",
    labelKey: "photoStudio.backdropBlack",
    swatchStyle: "radial-gradient(circle at 50% 42%, #1e293b 0%, #090d16 55%, #030712 100%)",
    isDark: true,
  },
]

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read cutout image"))
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("Invalid cutout image data"))
      }
    }
    reader.readAsDataURL(blob)
  })
}

function drawStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: StudioBackdropKey,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const cx = x + w / 2
  const cy = y + h * 0.42
  const radius = Math.max(w, h) * 0.72
  const floorY = y + h * 0.7

  if (backdrop === "white") {
    // Clean Studio White: Soft radial studio spotlight + subtle studio floor horizon
    const wallGrad = ctx.createRadialGradient(cx, y + h * 0.34, w * 0.06, cx, cy, radius)
    wallGrad.addColorStop(0, "#FFFFFF")
    wallGrad.addColorStop(0.65, "#F8FAFC")
    wallGrad.addColorStop(1, "#E6ECF4")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, w, h)

    const floorGrad = ctx.createLinearGradient(0, floorY, 0, y + h)
    floorGrad.addColorStop(0, "rgba(241, 245, 249, 0.9)")
    floorGrad.addColorStop(0.4, "rgba(226, 232, 240, 0.85)")
    floorGrad.addColorStop(1, "rgba(203, 213, 225, 0.95)")
    ctx.fillStyle = floorGrad
    ctx.fillRect(x, floorY, w, y + h - floorY)

    const horizonGrad = ctx.createLinearGradient(0, floorY - 8, 0, floorY + 12)
    horizonGrad.addColorStop(0, "rgba(203, 213, 225, 0)")
    horizonGrad.addColorStop(0.5, "rgba(148, 163, 184, 0.22)")
    horizonGrad.addColorStop(1, "rgba(203, 213, 225, 0)")
    ctx.fillStyle = horizonGrad
    ctx.fillRect(x, floorY - 8, w, 20)
    return
  }

  if (backdrop === "desk") {
    // Modern Tech Desk: Dark slate/navy surface + cyan/indigo rim lighting glow
    const wallGrad = ctx.createLinearGradient(x, y, x, floorY)
    wallGrad.addColorStop(0, "#050814")
    wallGrad.addColorStop(0.6, "#0B1222")
    wallGrad.addColorStop(1, "#131C31")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, w, floorY - y)

    const indigoGlow = ctx.createRadialGradient(
      x + w * 0.32,
      y + h * 0.36,
      w * 0.04,
      x + w * 0.32,
      y + h * 0.36,
      w * 0.52
    )
    indigoGlow.addColorStop(0, "rgba(99, 102, 241, 0.32)")
    indigoGlow.addColorStop(0.55, "rgba(79, 70, 229, 0.1)")
    indigoGlow.addColorStop(1, "rgba(15, 23, 42, 0)")
    ctx.fillStyle = indigoGlow
    ctx.fillRect(x, y, w, h)

    const cyanGlow = ctx.createRadialGradient(
      x + w * 0.72,
      y + h * 0.44,
      w * 0.04,
      x + w * 0.72,
      y + h * 0.44,
      w * 0.5
    )
    cyanGlow.addColorStop(0, "rgba(6, 182, 212, 0.26)")
    cyanGlow.addColorStop(0.55, "rgba(14, 165, 233, 0.08)")
    cyanGlow.addColorStop(1, "rgba(15, 23, 42, 0)")
    ctx.fillStyle = cyanGlow
    ctx.fillRect(x, y, w, h)

    const deskGrad = ctx.createLinearGradient(0, floorY, 0, y + h)
    deskGrad.addColorStop(0, "#111A2E")
    deskGrad.addColorStop(0.25, "#0B1120")
    deskGrad.addColorStop(1, "#030712")
    ctx.fillStyle = deskGrad
    ctx.fillRect(x, floorY, w, y + h - floorY)

    const rimGrad = ctx.createLinearGradient(x, floorY, x + w, floorY)
    rimGrad.addColorStop(0, "rgba(99, 102, 241, 0.05)")
    rimGrad.addColorStop(0.3, "rgba(99, 102, 241, 0.45)")
    rimGrad.addColorStop(0.7, "rgba(34, 211, 238, 0.45)")
    rimGrad.addColorStop(1, "rgba(34, 211, 238, 0.05)")
    ctx.fillStyle = rimGrad
    ctx.fillRect(x, floorY - 1, w, 3)
    return
  }

  if (backdrop === "marble") {
    // Luxury Marble Table: Warm studio wall + procedural white/gray veined marble surface
    const wallGrad = ctx.createRadialGradient(
      x + w * 0.28,
      y + h * 0.22,
      w * 0.05,
      cx,
      cy,
      radius
    )
    wallGrad.addColorStop(0, "#FFFDF9")
    wallGrad.addColorStop(0.55, "#F5F1EB")
    wallGrad.addColorStop(1, "#E5DFD5")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, w, floorY - y)

    const tableGrad = ctx.createLinearGradient(0, floorY, 0, y + h)
    tableGrad.addColorStop(0, "#FAF8F5")
    tableGrad.addColorStop(0.5, "#EFECE6")
    tableGrad.addColorStop(1, "#DDD7CE")
    ctx.fillStyle = tableGrad
    ctx.fillRect(x, floorY, w, y + h - floorY)

    // Procedural Carrara marble veins clipped to tabletop
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, floorY, w, y + h - floorY)
    ctx.clip()

    const tableH = y + h - floorY
    const veins: Array<{
      pts: [number, number, number, number, number, number, number, number]
      color: string
      width: number
    }> = [
      {
        pts: [0.02, 0.18, 0.25, 0.35, 0.48, 0.12, 0.78, 0.42],
        color: "rgba(148, 163, 184, 0.24)",
        width: 2.6,
      },
      {
        pts: [0.18, 0.75, 0.38, 0.48, 0.62, 0.68, 0.96, 0.22],
        color: "rgba(100, 116, 139, 0.18)",
        width: 1.8,
      },
      {
        pts: [-0.04, 0.55, 0.22, 0.62, 0.52, 0.38, 0.85, 0.82],
        color: "rgba(148, 163, 184, 0.2)",
        width: 2.2,
      },
      {
        pts: [0.35, 0.08, 0.55, 0.28, 0.72, 0.18, 1.02, 0.58],
        color: "rgba(180, 145, 90, 0.16)",
        width: 1.4,
      },
      {
        pts: [0.08, 0.88, 0.34, 0.72, 0.66, 0.9, 0.94, 0.65],
        color: "rgba(100, 116, 139, 0.14)",
        width: 1.5,
      },
    ]

    for (const vein of veins) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = vein.pts
      ctx.beginPath()
      ctx.moveTo(x + w * x0, floorY + tableH * y0)
      ctx.bezierCurveTo(
        x + w * x1,
        floorY + tableH * y1,
        x + w * x2,
        floorY + tableH * y2,
        x + w * x3,
        floorY + tableH * y3
      )
      ctx.strokeStyle = vein.color
      ctx.lineWidth = vein.width
      ctx.stroke()
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.45)"
    ctx.fillRect(x, floorY, w, 2)
    ctx.restore()
    return
  }

  if (backdrop === "cafe") {
    // Warm Cafe Wood: Golden ambient studio light + oak/walnut woodgrain tabletop
    const wallGrad = ctx.createRadialGradient(
      x + w * 0.5,
      y + h * 0.28,
      w * 0.05,
      cx,
      cy,
      radius
    )
    wallGrad.addColorStop(0, "#5C3A21")
    wallGrad.addColorStop(0.55, "#3B2314")
    wallGrad.addColorStop(1, "#1D1008")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, w, floorY - y)

    const warmBokeh = ctx.createRadialGradient(
      x + w * 0.24,
      y + h * 0.24,
      w * 0.02,
      x + w * 0.24,
      y + h * 0.24,
      w * 0.36
    )
    warmBokeh.addColorStop(0, "rgba(251, 191, 36, 0.2)")
    warmBokeh.addColorStop(1, "rgba(251, 191, 36, 0)")
    ctx.fillStyle = warmBokeh
    ctx.fillRect(x, y, w, floorY - y)

    const woodGrad = ctx.createLinearGradient(0, floorY, 0, y + h)
    woodGrad.addColorStop(0, "#8B5A2B")
    woodGrad.addColorStop(0.45, "#6E441E")
    woodGrad.addColorStop(1, "#45270D")
    ctx.fillStyle = woodGrad
    ctx.fillRect(x, floorY, w, y + h - floorY)

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, floorY, w, y + h - floorY)
    ctx.clip()
    const tableH = y + h - floorY
    const grainRows = 16
    for (let i = 0; i < grainRows; i++) {
      const gy = floorY + (tableH * (i + 0.5)) / grainRows
      const wave = ((i % 3) - 1) * 6
      ctx.beginPath()
      ctx.moveTo(x, gy)
      ctx.bezierCurveTo(
        x + w * 0.33,
        gy + wave,
        x + w * 0.66,
        gy - wave,
        x + w,
        gy + (i % 2 === 0 ? 2 : -2)
      )
      ctx.strokeStyle =
        i % 4 === 0 ? "rgba(224, 163, 84, 0.16)" : "rgba(32, 16, 5, 0.24)"
      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1.4
      ctx.stroke()
    }
    ctx.fillStyle = "rgba(251, 191, 36, 0.22)"
    ctx.fillRect(x, floorY, w, 2)
    ctx.restore()
    return
  }

  if (backdrop === "pastel") {
    const wallGrad = ctx.createRadialGradient(
      x + w * 0.72,
      y + h * 0.25,
      w * 0.05,
      cx,
      cy,
      radius
    )
    wallGrad.addColorStop(0, "#FFF9F2")
    wallGrad.addColorStop(0.55, "#FDECE4")
    wallGrad.addColorStop(1, "#F5D7CE")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, w, h)

    const floorGrad = ctx.createLinearGradient(0, floorY, 0, y + h)
    floorGrad.addColorStop(0, "rgba(253, 232, 224, 0.9)")
    floorGrad.addColorStop(1, "rgba(241, 205, 194, 0.95)")
    ctx.fillStyle = floorGrad
    ctx.fillRect(x, floorY, w, y + h - floorY)
    return
  }

  if (backdrop === "slate") {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h)
    grad.addColorStop(0, "#F1F5F9")
    grad.addColorStop(0.55, "#CBD5E1")
    grad.addColorStop(1, "#94A3B8")
    ctx.fillStyle = grad
  } else if (backdrop === "indigo") {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h)
    grad.addColorStop(0, "#1E1B4B")
    grad.addColorStop(0.52, "#3730A3")
    grad.addColorStop(1, "#6366F1")
    ctx.fillStyle = grad
  } else if (backdrop === "sunset") {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h)
    grad.addColorStop(0, "#FEF3C7")
    grad.addColorStop(0.5, "#F59E0B")
    grad.addColorStop(1, "#EA580C")
    ctx.fillStyle = grad
  } else if (backdrop === "emerald") {
    const grad = ctx.createRadialGradient(cx, cy, w * 0.05, cx, cy, radius)
    grad.addColorStop(0, "#10B981")
    grad.addColorStop(0.45, "#065F46")
    grad.addColorStop(1, "#022C22")
    ctx.fillStyle = grad
  } else {
    const grad = ctx.createRadialGradient(cx, cy, w * 0.05, cx, cy, radius)
    grad.addColorStop(0, "#1E293B")
    grad.addColorStop(0.5, "#090D16")
    grad.addColorStop(1, "#030712")
    ctx.fillStyle = grad
  }

  ctx.fillRect(x, y, w, h)
}

function resizeLogoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read logo file"))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        reject(new Error("Empty logo file"))
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error("Invalid logo image"))
      img.onload = () => {
        const maxDim = 360
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
        const targetW = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale))
        const targetH = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale))
        const offscreen = document.createElement("canvas")
        offscreen.width = targetW
        offscreen.height = targetH
        const oCtx = offscreen.getContext("2d")
        if (!oCtx) {
          resolve(result)
          return
        }
        oCtx.drawImage(img, 0, 0, targetW, targetH)
        resolve(offscreen.toDataURL("image/png"))
      }
      img.src = result
    }
    reader.readAsDataURL(file)
  })
}

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
  extraBlurPx = 0,
  studioBackdrop?: StudioBackdropKey | null
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  if (studioBackdrop) {
    if (extraBlurPx > 0) {
      ctx.filter = `blur(${extraBlurPx}px)`
    }
    drawStudioBackdrop(ctx, studioBackdrop, x, y, w, h)
    ctx.filter = "none"

    const filterParts = [`brightness(${brightness}%)`, `contrast(${contrast}%)`]
    if (extraBlurPx > 0) {
      filterParts.push(`blur(${extraBlurPx}px)`)
    }
    ctx.filter = filterParts.join(" ")

    const natW = img.naturalWidth || w
    const natH = img.naturalHeight || h
    const padScale = 0.8
    const scale = Math.min((w * padScale) / natW, (h * padScale) / natH)
    const drawW = Math.max(1, Math.round(natW * scale))
    const drawH = Math.max(1, Math.round(natH * scale))
    const offsetX = x + (w - drawW) / 2
    const offsetY = y + (h - drawH) * 0.46

    const isDark = isDarkStudioBackdrop(studioBackdrop)

    // Sleek surface reflection for Modern Tech Desk
    if (studioBackdrop === "desk" && extraBlurPx === 0) {
      ctx.save()
      const reflTop = offsetY + drawH - 2
      ctx.beginPath()
      ctx.rect(x, reflTop, w, Math.max(0, y + h - reflTop))
      ctx.clip()
      ctx.globalAlpha = 0.14
      ctx.translate(0, reflTop * 2)
      ctx.scale(1, -1)
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH)
      ctx.restore()
    }

    // Grounded elliptical contact shadow beneath the product
    ctx.save()
    const shadowCenterX = offsetX + drawW / 2
    const shadowCenterY = offsetY + drawH - Math.min(8, drawH * 0.02)
    const shadowRx = Math.max(24, drawW * 0.42)
    const shadowRy = Math.max(10, drawH * 0.05)
    ctx.translate(shadowCenterX, shadowCenterY)
    ctx.scale(1, shadowRy / shadowRx)
    const contactGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRx)
    contactGrad.addColorStop(
      0,
      isDark ? "rgba(0, 0, 0, 0.72)" : "rgba(15, 23, 42, 0.28)"
    )
    contactGrad.addColorStop(
      0.55,
      isDark ? "rgba(0, 0, 0, 0.32)" : "rgba(15, 23, 42, 0.12)"
    )
    contactGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
    ctx.fillStyle = contactGrad
    ctx.beginPath()
    ctx.arc(0, 0, shadowRx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.shadowColor = isDark
      ? "rgba(0, 0, 0, 0.65)"
      : "rgba(15, 23, 42, 0.26)"
    ctx.shadowBlur = 32
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 16

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH)
    ctx.filter = "none"
    ctx.restore()
    return
  }

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

function drawBrandLogo(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  position: LogoPositionKey,
  canvasWidth: number,
  padding: number,
  topOffset: number
) {
  const maxW = 140
  const maxH = 88
  const natW = logoImg.naturalWidth || maxW
  const natH = logoImg.naturalHeight || maxH
  const scale = Math.min(maxW / natW, maxH / natH)
  const drawW = Math.max(1, Math.round(natW * scale))
  const drawH = Math.max(1, Math.round(natH * scale))

  const boxPad = 10
  const boxW = drawW + boxPad * 2
  const boxH = drawH + boxPad * 2
  const x = position === "top-left" ? padding : canvasWidth - padding - boxW
  const y = padding + topOffset

  ctx.save()
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)"
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 4
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)"
  drawRoundedRect(ctx, x, y, boxW, boxH, 16)
  ctx.fill()
  ctx.shadowColor = "transparent"
  ctx.drawImage(logoImg, x + boxPad, y + boxPad, drawW, drawH)
  ctx.restore()
}

function drawPromoStamp(
  ctx: CanvasRenderingContext2D,
  stampText: string,
  anchorX: number,
  anchorY: number,
  alignRight: boolean,
  accentColor: string
) {
  if (!stampText.trim()) return
  const label = `✓ ${stampText.trim()}`
  ctx.save()
  ctx.font = `700 25px ${MYANMAR_FONT_STACK}`
  const textW = ctx.measureText(label).width
  const pillW = textW + 44
  const pillH = 54

  const drawX = alignRight ? anchorX - pillW : anchorX
  const drawY = anchorY - pillH
  const cx = drawX + pillW / 2
  const cy = drawY + pillH / 2

  ctx.translate(cx, cy)
  ctx.rotate((-3 * Math.PI) / 180)
  ctx.translate(-cx, -cy)

  ctx.shadowColor = "rgba(0, 0, 0, 0.38)"
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 5

  ctx.fillStyle = accentColor
  drawRoundedRect(ctx, drawX, drawY, pillW, pillH, 14)
  ctx.fill()

  ctx.shadowColor = "transparent"
  ctx.lineWidth = 2.5
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)"
  drawRoundedRect(ctx, drawX + 4, drawY + 4, pillW - 8, pillH - 8, 10)
  ctx.stroke()

  ctx.fillStyle = "#FFFFFF"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, cx, cy + 1)
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
  const { posterDraft, setPosterDraft } = useContentStore(
    useShallow((state) => ({
      posterDraft: state.posterDraft,
      setPosterDraft: state.setPosterDraft,
    }))
  )

  const [category, setCategory] = useState<PhotoCategoryKey>("tech")
  const [layoutTemplate, setLayoutTemplate] = useState<LayoutTemplateKey>("gradient")

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg")
  const [originalImageDataUrl, setOriginalImageDataUrl] = useState<string | null>(null)
  const [originalImageMimeType, setOriginalImageMimeType] = useState<string>("image/jpeg")
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
  const [promoStamp, setPromoStamp] = useState<string | null>(null)

  const [spec1, setSpec1] = useState("")
  const [spec2, setSpec2] = useState("")
  const [spec3, setSpec3] = useState("")

  const [originalPrice, setOriginalPrice] = useState("")
  const [priceTag, setPriceTag] = useState("")
  const [shopFooter, setShopFooter] = useState("")

  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BRAND_LOGO_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [showBrandLogo, setShowBrandLogo] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BRAND_LOGO_ENABLED_KEY) !== "false"
    } catch {
      return true
    }
  })
  const [logoPosition, setLogoPosition] = useState<LogoPositionKey>(() => {
    try {
      const saved = localStorage.getItem(BRAND_LOGO_POSITION_KEY)
      return saved === "top-right" ? "top-right" : "top-left"
    } catch {
      return "top-left"
    }
  })
  const [loadedLogo, setLoadedLogo] = useState<HTMLImageElement | null>(null)

  const [scenePrompt, setScenePrompt] = useState("")
  const [isGeneratingScene, setIsGeneratingScene] = useState(false)
  const [hasAiScene, setHasAiScene] = useState(false)

  const [cutoutImageDataUrl, setCutoutImageDataUrl] = useState<string | null>(null)
  const [isCutoutActive, setIsCutoutActive] = useState(false)
  const [isRemovingBg, setIsRemovingBg] = useState(false)
  const [bgRemovalProgress, setBgRemovalProgress] = useState<number | null>(null)
  const [bgRemovalStage, setBgRemovalStage] = useState<string>("")
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null)
  const [studioBackdrop, setStudioBackdrop] = useState<StudioBackdropKey>("white")

  const [caption, setCaption] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Consume shared posterDraft from Text Generator
  useEffect(() => {
    if (!posterDraft) return
    setHeadline(posterDraft.headline)
    setSpec1(posterDraft.spec1)
    setSpec2(posterDraft.spec2)
    setSpec3(posterDraft.spec3)
    setCaption(posterDraft.caption)
    setPosterDraft(null)
    toast.success(t(language, "photoStudio.draftLoaded"))
  }, [posterDraft, setPosterDraft, language])

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
      setOriginalImageMimeType(file.type)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImageDataUrl(reader.result)
          setOriginalImageDataUrl(reader.result)
          setHasAiScene(false)
          setCutoutImageDataUrl(null)
          setIsCutoutActive(false)
          setBgRemovalError(null)
          setBgRemovalProgress(null)
        }
      }
      reader.readAsDataURL(file)
    },
    [language]
  )

  const handleLogoUpload = useCallback(
    async (file: File) => {
      const validTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
      if (!validTypes.includes(file.type)) {
        toast.error(t(language, "photoStudio.brandLogoInvalid"))
        return
      }
      try {
        const dataUrl = await resizeLogoToDataUrl(file)
        setBrandLogoDataUrl(dataUrl)
        setShowBrandLogo(true)
        try {
          localStorage.setItem(BRAND_LOGO_STORAGE_KEY, dataUrl)
          localStorage.setItem(BRAND_LOGO_ENABLED_KEY, "true")
        } catch {
          // Ignore storage quota errors
        }
      } catch {
        toast.error(t(language, "photoStudio.brandLogoInvalid"))
      }
    },
    [language]
  )

  const handleRemoveLogo = () => {
    setBrandLogoDataUrl(null)
    setLoadedLogo(null)
    try {
      localStorage.removeItem(BRAND_LOGO_STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  const handleToggleShowLogo = () => {
    setShowBrandLogo((prev) => {
      const next = !prev
      try {
        localStorage.setItem(BRAND_LOGO_ENABLED_KEY, String(next))
      } catch {
        // Ignore
      }
      return next
    })
  }

  const handleChangeLogoPosition = (pos: LogoPositionKey) => {
    setLogoPosition(pos)
    try {
      localStorage.setItem(BRAND_LOGO_POSITION_KEY, pos)
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    if (!brandLogoDataUrl) {
      setLoadedLogo(null)
      return
    }
    const img = new Image()
    img.onload = () => setLoadedLogo(img)
    img.src = brandLogoDataUrl
  }, [brandLogoDataUrl])

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

    const activeStudioBackdrop = isCutoutActive ? studioBackdrop : null

    if (layoutTemplate === "gradient") {
      // 1. Full-bleed photo with brightness/contrast filter
      drawCoverImage(
        ctx,
        loadedImage,
        0,
        0,
        width,
        height,
        brightness,
        contrast,
        0,
        activeStudioBackdrop
      )

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

      drawCoverImage(
        ctx,
        loadedImage,
        0,
        0,
        width,
        photoH,
        brightness,
        contrast,
        0,
        activeStudioBackdrop
      )

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
      drawCoverImage(
        ctx,
        loadedImage,
        0,
        0,
        width,
        height,
        brightness,
        contrast,
        0,
        activeStudioBackdrop
      )

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
      drawCoverImage(
        ctx,
        loadedImage,
        0,
        0,
        width,
        height,
        brightness,
        contrast,
        20,
        activeStudioBackdrop
      )
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
      drawCoverImage(
        ctx,
        loadedImage,
        photoX,
        photoY,
        photoW,
        photoH,
        brightness,
        contrast,
        0,
        activeStudioBackdrop
      )
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

    // Draw Brand Logo Watermark (top-left or top-right corner)
    if (showBrandLogo && loadedLogo) {
      const hasTopLeftBadge = badge !== "none"
      const hasTopRightPrice =
        Boolean(priceTag.trim()) ||
        (category === "flash_sale" && Boolean(originalPrice.trim()))
      const basePad = layoutTemplate === "frame" ? 54 : padding
      const logoOffset =
        logoPosition === "top-left"
          ? hasTopLeftBadge
            ? 68
            : 0
          : hasTopRightPrice
            ? category === "flash_sale" && originalPrice.trim()
              ? 104
              : 74
            : 0
      drawBrandLogo(ctx, loadedLogo, logoPosition, width, basePad, logoOffset)
    }

    // Draw Burmese / English Promo Stamp
    if (promoStamp) {
      if (layoutTemplate === "split") {
        drawPromoStamp(
          ctx,
          promoStamp,
          width - padding,
          Math.round(height * 0.65) - 24,
          true,
          theme.accent
        )
      } else if (layoutTemplate === "frame") {
        const photoBottom = height - Math.round(height * 0.27)
        drawPromoStamp(
          ctx,
          promoStamp,
          width - 54 - 22,
          photoBottom - 22,
          true,
          theme.accent
        )
      } else if (layoutTemplate === "gradient" && textPosition === "top") {
        drawPromoStamp(
          ctx,
          promoStamp,
          width - padding,
          height - (shopFooter.trim() ? 96 : 42),
          true,
          theme.accent
        )
      } else {
        const badgeOffset = badge !== "none" ? 72 : 0
        const logoOffset =
          showBrandLogo && loadedLogo && logoPosition === "top-left" ? 116 : 0
        drawPromoStamp(
          ctx,
          promoStamp,
          padding,
          padding + badgeOffset + logoOffset + 54,
          false,
          theme.accent
        )
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
    promoStamp,
    spec1,
    spec2,
    spec3,
    originalPrice,
    priceTag,
    shopFooter,
    language,
    showBrandLogo,
    loadedLogo,
    logoPosition,
    isCutoutActive,
    studioBackdrop,
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

  const runLocalCutout = async (sourceImage: string): Promise<string> => {
    setIsRemovingBg(true)
    setBgRemovalError(null)
    setBgRemovalProgress(0)
    setBgRemovalStage("")

    try {
      const resultBlob = await removeBackground(sourceImage, {
        output: { format: "image/png" },
        progress: (key, current, total) => {
          setBgRemovalStage(key)
          if (total > 0) {
            const pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)))
            setBgRemovalProgress(pct)
          }
        },
      })

      const cutoutDataUrl = await blobToDataUrl(resultBlob)
      setCutoutImageDataUrl(cutoutDataUrl)
      return cutoutDataUrl
    } finally {
      setIsRemovingBg(false)
      setBgRemovalProgress(null)
      setBgRemovalStage("")
    }
  }

  const handleApplyScene = async (
    presetId: ScenePresetId | null,
    overridePrompt?: string
  ) => {
    const sourceImage = originalImageDataUrl || imageDataUrl
    const activePrompt = (overridePrompt ?? scenePrompt).trim()
    if (!sourceImage || (!presetId && !activePrompt) || isGeneratingScene || isRemovingBg) {
      return
    }

    const targetScene: StudioBackdropKey =
      presetId ?? resolveSceneFromPrompt(activePrompt)

    if (overridePrompt !== undefined) {
      setScenePrompt(overridePrompt)
    }
    setIsGeneratingScene(true)

    try {
      const cutoutUrl = cutoutImageDataUrl ?? (await runLocalCutout(sourceImage))
      setIsCutoutActive(true)
      setImageDataUrl(cutoutUrl)
      setImageMimeType("image/png")
      setStudioBackdrop(targetScene)
      setHasAiScene(true)
      toast.success(t(language, "photoStudio.sceneGenerateSuccess"))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "")
      const friendly = msg
        ? `${t(language, "photoStudio.cutoutError")} (${msg})`
        : t(language, "photoStudio.cutoutError")
      setBgRemovalError(friendly)
      toast.error(
        msg
          ? `${t(language, "photoStudio.sceneGenerateError")}: ${msg}`
          : t(language, "photoStudio.sceneGenerateError")
      )
    } finally {
      setIsGeneratingScene(false)
    }
  }

  const handleResetOriginalPhoto = () => {
    if (!originalImageDataUrl) return
    setImageDataUrl(originalImageDataUrl)
    setImageMimeType(originalImageMimeType)
    setHasAiScene(false)
    setIsCutoutActive(false)
  }

  const handleRemoveBackground = async () => {
    const sourceImage = originalImageDataUrl || imageDataUrl
    if (!sourceImage || isRemovingBg || isGeneratingScene) return

    try {
      const cutoutDataUrl = await runLocalCutout(sourceImage)
      setIsCutoutActive(true)
      setImageDataUrl(cutoutDataUrl)
      setImageMimeType("image/png")
      setHasAiScene(false)
      toast.success(t(language, "photoStudio.cutoutSuccess"))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "")
      const friendly = msg
        ? `${t(language, "photoStudio.cutoutError")} (${msg})`
        : t(language, "photoStudio.cutoutError")
      setBgRemovalError(friendly)
      toast.error(t(language, "photoStudio.cutoutError"))
    }
  }

  const handleToggleCutout = () => {
    if (!cutoutImageDataUrl || !originalImageDataUrl) return
    if (isCutoutActive) {
      setIsCutoutActive(false)
      setImageDataUrl(originalImageDataUrl)
      setImageMimeType(originalImageMimeType)
    } else {
      setIsCutoutActive(true)
      setImageDataUrl(cutoutImageDataUrl)
      setImageMimeType("image/png")
      setHasAiScene(false)
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

  const handleApplyStarterPreset = (presetKey: "flash_sale" | "new_arrival" | "customer_review") => {
    const isMy = language === "my"
    const presets = {
      flash_sale: {
        category: "flash_sale" as PhotoCategoryKey,
        badge: "discount" as BadgeKey,
        headline: isMy ? "ဒီနေ့တစ်ရက်တည်း 30% Off!" : "Weekend Flash Sale — 30% Off",
        originalPrice: "65,000 Ks",
        priceTag: "45,500 Ks",
        spec1: isMy ? "အကန့်အသတ်ရှိသည်" : "24 Hours Only",
        spec2: isMy ? "အိမ်အရောက်ပို့" : "Fast Delivery",
        spec3: isMy ? "Warranty ပါ" : "1 Yr Warranty",
        caption: isMy
          ? "⚡ ဒီနေ့တစ်ရက်တည်း 30% Off Flash Sale!\nမူလဈေး 65,000 Ks မှ 45,500 Ks ဖြင့် မှာယူနိုင်ပါပြီ။\nInbox မှတစ်ဆင့် အမြန်ဆုံး မှာယူလိုက်ပါ! 🛍️"
          : "⚡ 24-Hour Flash Sale! Get 30% off today only — now 45,500 Ks (was 65,000 Ks). DM us now before stock runs out! 🛍️",
        bgFrom: "#1e3a8a",
        bgTo: "#4f46e5",
      },
      new_arrival: {
        category: "new_arrival" as PhotoCategoryKey,
        badge: "new" as BadgeKey,
        headline: isMy ? "ပစ္စည်းသစ် ရောက်ရှိပါပြီ ✨" : "New Arrival Collection ✨",
        originalPrice: "",
        priceTag: "55,000 Ks",
        spec1: "Premium Quality",
        spec2: isMy ? "In Stock" : "Ready to Ship",
        spec3: isMy ? "Free Gift ပါ" : "Free Gift",
        caption: isMy
          ? "✨ ပစ္စည်းသစ်လေးတွေ ရောက်ရှိပါပြီ!\nအရည်အသွေးကောင်းပြီး ဒီဇိုင်းလှပတဲ့ Collection အသစ်ကို 55,000 Ks ဖြင့် ရရှိနိုင်ပါပြီ။"
          : "✨ Just landed! Meet our brand-new collection crafted for everyday style. Now available for 55,000 Ks — tap to order!",
        bgFrom: "#0f766e",
        bgTo: "#2563eb",
      },
      customer_review: {
        category: "fashion" as PhotoCategoryKey,
        badge: "delivery" as BadgeKey,
        headline: isMy ? "Customer များ 100% ကြိုက်နှစ်သက်မှု ⭐" : "5-Star Customer Favorite ⭐",
        originalPrice: "",
        priceTag: "38,000 Ks",
        spec1: "4.9/5 Rating",
        spec2: "100% Authentic",
        spec3: isMy ? "COD ရရှိနိုင်" : "COD Available",
        caption: isMy
          ? "⭐ ဝယ်ယူအားပေးသူတိုင်း စိတ်ကျေနပ်မှု အပြည့်အဝ ရရှိထားတဲ့ Best Seller!\nယုံကြည်စိတ်ချစွာ မှာယူနိုင်ပါပြီ။"
          : "⭐ Rated 4.9/5 by our happy customers! See why this best-seller keeps selling out every week.",
        bgFrom: "#6d28d9",
        bgTo: "#db2777",
      },
    } as const

    const p = presets[presetKey]
    setCategory(p.category)
    setBadge(p.badge)
    setHeadline(p.headline)
    setOriginalPrice(p.originalPrice)
    setPriceTag(p.priceTag)
    setSpec1(p.spec1)
    setSpec2(p.spec2)
    setSpec3(p.spec3)
    setCaption(p.caption)

    if (!imageDataUrl) {
      const offscreen = document.createElement("canvas")
      offscreen.width = 900
      offscreen.height = 900
      const ctx = offscreen.getContext("2d")
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 900, 900)
        grad.addColorStop(0, p.bgFrom)
        grad.addColorStop(1, p.bgTo)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 900, 900)

        ctx.fillStyle = "rgba(255,255,255,0.10)"
        ctx.beginPath()
        ctx.arc(450, 380, 210, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.font = "600 32px Inter, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("PRODUCT SHOWCASE", 450, 390)

        const dataUrl = offscreen.toDataURL("image/png")
        setOriginalImageDataUrl(dataUrl)
        setImageDataUrl(dataUrl)
      }
    }
    toast.success(t(language, "photoStudio.draftLoaded"))
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

          {/* Standalone 0-Quota Local Browser Background Remover & Studio Backdrop */}
          <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.04] via-card to-teal-500/[0.04]">
            <CardHeader className="pb-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                  <Scissors className="h-4 w-4 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                  <span className="font-myanmar">{t(language, "photoStudio.cutoutTitle")}</span>
                </CardTitle>
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  {t(language, "photoStudio.cutoutBadge")}
                </span>
              </div>
              <CardDescription className="text-xs leading-[1.85] font-myanmar">
                {t(language, "photoStudio.cutoutDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  disabled={!imageDataUrl || isRemovingBg || isGeneratingScene}
                  onClick={handleRemoveBackground}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 shadow-xs leading-[1.85] font-myanmar"
                >
                  {isRemovingBg ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                      {t(language, "photoStudio.cutoutProcessing")}
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" aria-hidden="true" />
                      {t(language, "photoStudio.cutoutBtn")}
                    </>
                  )}
                </Button>

                {cutoutImageDataUrl && originalImageDataUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isRemovingBg}
                    onClick={handleToggleCutout}
                    className="border-emerald-500/30 hover:bg-emerald-500/10 leading-[1.85] font-myanmar"
                  >
                    <Layers className="h-4 w-4 mr-1.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    {isCutoutActive
                      ? t(language, "photoStudio.cutoutShowOriginal")
                      : t(language, "photoStudio.cutoutShowCutout")}
                  </Button>
                )}
              </div>

              {isRemovingBg && (
                <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-myanmar">
                    <span>
                      {bgRemovalStage.startsWith("fetch:")
                        ? t(language, "photoStudio.cutoutLoadingModel")
                        : t(language, "photoStudio.cutoutProcessing")}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {bgRemovalProgress !== null ? `${bgRemovalProgress}%` : "..."}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-500/20">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-200"
                      style={{ width: `${bgRemovalProgress ?? 15}%` }}
                    />
                  </div>
                </div>
              )}

              {bgRemovalError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive font-myanmar leading-[1.7]"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{bgRemovalError}</span>
                </div>
              )}

              {isCutoutActive && cutoutImageDataUrl && (
                <div className="space-y-2 pt-1 border-t border-border/60">
                  <Label className="text-xs font-medium flex items-center gap-1.5 leading-[1.85] font-myanmar">
                    <Layers className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    {t(language, "photoStudio.backdropPickerLabel")}
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {STUDIO_BACKDROPS.map((opt) => {
                      const active = studioBackdrop === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStudioBackdrop(opt.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-all cursor-pointer",
                            active
                              ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40 font-semibold"
                              : "border-border/70 bg-background/60 hover:border-emerald-500/40"
                          )}
                        >
                          <span
                            className="h-5 w-5 shrink-0 rounded-full border border-black/15 dark:border-white/20 shadow-xs"
                            style={{ background: opt.swatchStyle }}
                            aria-hidden="true"
                          />
                          <span className="truncate font-myanmar leading-[1.5]">
                            {t(language, opt.labelKey)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dedicated Hybrid Studio Scene Composer (0-Quota Local Cutout + Canvas Studio) */}
          <Card className="border-indigo-500/25 bg-gradient-to-br from-indigo-500/[0.04] via-card to-blue-500/[0.04]">
            <CardHeader className="pb-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2 leading-[1.85]">
                  <Wand2 className="h-4 w-4 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                  <span className="font-myanmar">{t(language, "photoStudio.sceneStudioTitle")}</span>
                  <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {t(language, "photoStudio.cutoutBadge")}
                  </span>
                </CardTitle>
                {hasAiScene && originalImageDataUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetOriginalPhoto}
                    disabled={isGeneratingScene || isRemovingBg}
                    className="h-7 px-2.5 text-xs border-border/70"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                    {t(language, "photoStudio.sceneResetOriginal")}
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs leading-[1.85] font-myanmar">
                {t(language, "photoStudio.sceneStudioDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {/* 1-Click Scene Presets */}
              <div className="grid grid-cols-2 gap-2.5">
                {SCENE_PRESETS.map((preset) => {
                  const isActive =
                    hasAiScene && isCutoutActive && studioBackdrop === preset.id
                  return (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      disabled={!imageDataUrl || isGeneratingScene || isRemovingBg}
                      onClick={() => handleApplyScene(preset.id, preset.prompt)}
                      className={cn(
                        "h-auto py-2 px-2.5 text-xs justify-start text-left leading-[1.6] whitespace-normal font-myanmar",
                        isActive &&
                          "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-xs"
                      )}
                    >
                      {t(language, preset.labelKey)}
                    </Button>
                  )
                })}
              </div>

              {(isGeneratingScene || isRemovingBg) && (
                <div className="space-y-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-2.5">
                  <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-myanmar">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      {isRemovingBg
                        ? bgRemovalStage.includes("fetch")
                          ? t(language, "photoStudio.cutoutLoadingModel")
                          : t(language, "photoStudio.cutoutProcessing")
                        : t(language, "photoStudio.sceneGenerating")}
                    </span>
                    {bgRemovalProgress !== null && (
                      <span className="font-mono font-medium">{bgRemovalProgress}%</span>
                    )}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-500/15">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                      style={{ width: `${bgRemovalProgress ?? 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Custom Scene Prompt Input */}
              <div className="space-y-1.5">
                <Label htmlFor="ai-scene-prompt" className="text-xs leading-[1.85] font-myanmar">
                  {t(language, "photoStudio.sceneCustomLabel")}
                </Label>
                <Input
                  id="ai-scene-prompt"
                  value={scenePrompt}
                  onChange={(e) => {
                    setScenePrompt(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && scenePrompt.trim() && imageDataUrl) {
                      e.preventDefault()
                      handleApplyScene(null)
                    }
                  }}
                  placeholder={t(language, "photoStudio.sceneCustomPlaceholder")}
                  disabled={!imageDataUrl || isGeneratingScene || isRemovingBg}
                  className="text-xs font-myanmar leading-[1.85]"
                />
              </div>

              <Button
                type="button"
                variant="default"
                disabled={
                  !imageDataUrl ||
                  !scenePrompt.trim() ||
                  isGeneratingScene ||
                  isRemovingBg
                }
                onClick={() => handleApplyScene(null)}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border-0 shadow-xs leading-[1.85] font-myanmar"
              >
                {isGeneratingScene || isRemovingBg ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    {t(language, "photoStudio.sceneGenerating")}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t(language, "photoStudio.sceneGenerateBtn")}
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

              {/* 1-Click Burmese & English Promo Stamps */}
              <div className="space-y-2.5">
                <Label className="flex items-center gap-1.5 leading-[1.85] font-myanmar">
                  <Stamp className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(language, "photoStudio.promoStampsLabel")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PROMO_STAMPS.map((stamp) => {
                    const active = promoStamp === stamp
                    return (
                      <Button
                        key={stamp}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setPromoStamp(active ? null : stamp)}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs font-myanmar leading-[1.6]",
                          active &&
                            "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-xs"
                        )}
                      >
                        {stamp}
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* Shop Brand Logo Watermark (Persisted in localStorage) */}
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold leading-[1.6] font-myanmar">
                    {t(language, "photoStudio.brandLogoTitle")}
                  </Label>
                  {brandLogoDataUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant={showBrandLogo ? "default" : "outline"}
                      onClick={handleToggleShowLogo}
                      className={cn(
                        "h-7 px-2.5 text-xs",
                        showBrandLogo &&
                          "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                      )}
                    >
                      {showBrandLogo ? (
                        <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-3 w-3 mr-1" aria-hidden="true" />
                      )}
                      {t(language, "photoStudio.brandLogoToggle")}
                    </Button>
                  )}
                </div>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleLogoUpload(file)
                    e.target.value = ""
                  }}
                />

                <div className="flex flex-wrap items-center gap-2">
                  {brandLogoDataUrl && (
                    <div className="h-9 w-9 rounded-lg border border-border bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src={brandLogoDataUrl}
                        alt="Brand Logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    className="h-8 text-xs font-myanmar"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    {brandLogoDataUrl
                      ? t(language, "photoStudio.brandLogoChange")
                      : t(language, "photoStudio.brandLogoUpload")}
                  </Button>
                  {brandLogoDataUrl && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleRemoveLogo}
                        className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        {t(language, "photoStudio.brandLogoRemove")}
                      </Button>
                      <div className="flex items-center gap-1 ml-auto">
                        {(["top-left", "top-right"] as LogoPositionKey[]).map((pos) => (
                          <Button
                            key={pos}
                            type="button"
                            size="sm"
                            variant={logoPosition === pos ? "default" : "outline"}
                            onClick={() => handleChangeLogoPosition(pos)}
                            className={cn(
                              "h-7 px-2 text-[11px] font-myanmar",
                              logoPosition === pos &&
                                "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                            )}
                          >
                            {t(
                              language,
                              pos === "top-left"
                                ? "photoStudio.brandLogoTopLeft"
                                : "photoStudio.brandLogoTopRight"
                            )}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
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
              {isGeneratingScene || isRemovingBg ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/20 min-h-[340px] p-6 gap-4" aria-busy="true">
                  <Skeleton className="w-full max-w-[320px] aspect-square rounded-2xl" />
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span>
                      {isRemovingBg
                        ? t(language, "photoStudio.cutoutProcessing")
                        : t(language, "photoStudio.sceneGenerating")}
                    </span>
                  </div>
                </div>
              ) : !loadedImage ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 min-h-[340px] p-6 text-center gap-4">
                  <div className="h-14 w-14 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 max-w-xs">
                    <p className="text-sm font-semibold text-foreground leading-relaxed">
                      {t(language, "photoStudio.emptyPreview")}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(language, "photoStudio.emptyDesc")}
                    </p>
                  </div>
                  <div className="w-full max-w-sm space-y-2 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(language, "presets.title")}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { key: "flash_sale" as const, label: t(language, "presets.flashSale") },
                        { key: "new_arrival" as const, label: t(language, "presets.newArrival") },
                        { key: "customer_review" as const, label: t(language, "presets.customerReview") },
                      ].map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => handleApplyStarterPreset(preset.key)}
                          className="flex items-center justify-between gap-2 w-full rounded-xl border border-border/60 bg-background/80 hover:bg-accent/60 hover:border-blue-500/30 px-3 py-2 text-left text-xs font-medium transition-all cursor-pointer"
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
              ) : (
                <div className="flex justify-center bg-muted/20 rounded-xl p-2 sm:p-4 border">
                  <canvas
                    ref={canvasRef}
                    className="w-full max-w-[420px] mx-auto h-auto rounded-xl shadow-md object-contain"
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
              {isAnalyzing ? (
                <div className="space-y-2.5 py-2" aria-busy="true">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-[90%]" />
                  <Skeleton className="h-3.5 w-[82%]" />
                  <Skeleton className="h-3.5 w-[65%]" />
                </div>
              ) : (
                <Textarea
                  rows={5}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={t(language, "photoStudio.captionPlaceholder")}
                  className="font-myanmar leading-[1.85]"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
