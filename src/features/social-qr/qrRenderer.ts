import QRCodeStyling, { type Options as QrOptions } from "qr-code-styling"
import type {
  PlatformBrandTheme,
  QrCardAspectRatio,
  QrCardThemeId,
  SocialPlatformId,
} from "./types"

export interface CardThemePalette {
  id: QrCardThemeId
  bgStart: string
  bgEnd: string
  cardBg: string
  cardBorder: string
  headlineColor: string
  handleColor: string
  headerPillBg: string
  headerPillText: string
  ctaPillBg: string
  ctaPillText: string
  qrColor: string
  accentGlow: string
  isLightBg: boolean
}

export function getCardThemePalette(
  themeId: QrCardThemeId,
  platform: PlatformBrandTheme
): CardThemePalette {
  switch (themeId) {
    case "midnight_gold":
      return {
        id: "midnight_gold",
        bgStart: "#0B0F19",
        bgEnd: "#18181B",
        cardBg: "#FFFFFF",
        cardBorder: "rgba(212, 175, 55, 0.35)",
        headlineColor: "#F8FAFC",
        handleColor: "#E2C275",
        headerPillBg: "rgba(212, 175, 55, 0.16)",
        headerPillText: "#F5D061",
        ctaPillBg: "#D4AF37",
        ctaPillText: "#111827",
        qrColor: "#111827",
        accentGlow: "rgba(212, 175, 55, 0.22)",
        isLightBg: false,
      }
    case "studio_white":
      return {
        id: "studio_white",
        bgStart: "#FAF8F5",
        bgEnd: "#EFECE6",
        cardBg: "#FFFFFF",
        cardBorder: "rgba(28, 25, 23, 0.08)",
        headlineColor: "#1C1917",
        handleColor: "#57534E",
        headerPillBg: platform.badgeBg,
        headerPillText: platform.badgeText,
        ctaPillBg: "#1C1917",
        ctaPillText: "#FAF8F5",
        qrColor: "#1C1917",
        accentGlow: "rgba(28, 25, 23, 0.06)",
        isLightBg: true,
      }
    case "soft_coral":
      return {
        id: "soft_coral",
        bgStart: "#FB7185",
        bgEnd: "#F97316",
        cardBg: "#FFFFFF",
        cardBorder: "rgba(255, 255, 255, 0.45)",
        headlineColor: "#FFFFFF",
        handleColor: "rgba(255, 255, 255, 0.92)",
        headerPillBg: "rgba(255, 255, 255, 0.22)",
        headerPillText: "#FFFFFF",
        ctaPillBg: "#FFFFFF",
        ctaPillText: "#BE123C",
        qrColor: "#4C0519",
        accentGlow: "rgba(255, 255, 255, 0.24)",
        isLightBg: false,
      }
    case "platform":
    default:
      return {
        id: "platform",
        bgStart: platform.gradientStart,
        bgEnd: platform.gradientEnd,
        cardBg: "#FFFFFF",
        cardBorder: "rgba(255, 255, 255, 0.3)",
        headlineColor: "#FFFFFF",
        handleColor: "rgba(255, 255, 255, 0.9)",
        headerPillBg: "rgba(255, 255, 255, 0.2)",
        headerPillText: "#FFFFFF",
        ctaPillBg: "#FFFFFF",
        ctaPillText: platform.qrColor,
        qrColor: platform.qrColor,
        accentGlow: "rgba(255, 255, 255, 0.2)",
        isLightBg: false,
      }
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous"
    }
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

/**
 * Wraps any shop logo into a clean white circular/squircle badge data URL
 * so it sits cleanly inside the QR center without hurting scannability.
 */
export async function createBadgedLogoDataUrl(logoSrc: string): Promise<string | null> {
  try {
    const img = await loadImage(logoSrc)
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    // Clean white circular badge
    ctx.fillStyle = "#FFFFFF"
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
    ctx.fill()

    // Subtle crisp inner border
    ctx.strokeStyle = "rgba(15, 23, 42, 0.08)"
    ctx.lineWidth = 4
    ctx.stroke()

    // Clip to inner circle for logo
    const pad = 26
    const innerRadius = size / 2 - pad
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, innerRadius, 0, Math.PI * 2)
    ctx.clip()

    const scale = Math.min(
      (innerRadius * 2) / img.width,
      (innerRadius * 2) / img.height
    )
    const drawW = img.width * scale
    const drawH = img.height * scale
    ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH)
    ctx.restore()

    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}

export type QrEccLevel = "L" | "M" | "Q" | "H"

export function selectQrErrorCorrection(
  dataLength: number,
  hasLogo: boolean
): { level: QrEccLevel; allowLogo: boolean; imageSize: number } {
  if (dataLength > 2150) {
    return { level: "L", allowLogo: false, imageSize: 0 }
  }
  if (dataLength > 1150) {
    return { level: "M", allowLogo: false, imageSize: 0 }
  }
  if (dataLength > 650) {
    return hasLogo
      ? { level: "Q", allowLogo: true, imageSize: 0.26 }
      : { level: "M", allowLogo: false, imageSize: 0 }
  }
  return hasLogo
    ? { level: "H", allowLogo: true, imageSize: 0.34 }
    : { level: "M", allowLogo: false, imageSize: 0 }
}

export function buildQrStylingOptions(params: {
  url: string
  size: number
  qrColor: string
  badgedLogoDataUrl?: string | null
}): QrOptions {
  const { url, size, qrColor, badgedLogoDataUrl } = params
  const data = url || "https://example.com"
  const ecc = selectQrErrorCorrection(data.length, Boolean(badgedLogoDataUrl))
  return {
    type: "canvas",
    width: size,
    height: size,
    margin: Math.round(size * 0.03),
    data,
    image: ecc.allowLogo && badgedLogoDataUrl ? badgedLogoDataUrl : undefined,
    qrOptions: {
      errorCorrectionLevel: ecc.level,
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: ecc.imageSize || 0.34,
      margin: 6,
      crossOrigin: "anonymous",
    },
    dotsOptions: {
      type: "rounded",
      color: qrColor,
    },
    cornersSquareOptions: {
      type: "extra-rounded",
      color: qrColor,
    },
    cornersDotOptions: {
      type: "dot",
      color: qrColor,
    },
    backgroundOptions: {
      color: "transparent",
    },
  }
}

export async function generateQrImageBlob(params: {
  url: string
  size: number
  qrColor: string
  badgedLogoDataUrl?: string | null
}): Promise<Blob | null> {
  const qr = new QRCodeStyling(buildQrStylingOptions(params))
  const raw = await qr.getRawData("png")
  if (!raw) return null
  if (raw instanceof Blob) return raw
  return new Blob([new Uint8Array(raw)], { type: "image/png" })
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

function drawPlatformGlyphOnCanvas(
  ctx: CanvasRenderingContext2D,
  platform: SocialPlatformId,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.save()
  ctx.translate(cx - size / 2, cy - size / 2)
  const scale = size / 24
  ctx.scale(scale, scale)
  ctx.fillStyle = color
  ctx.strokeStyle = color

  if (platform === "facebook") {
    const p = new Path2D(
      "M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.6V4.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V11H7.6v3h2.7v8h3.2z"
    )
    ctx.fill(p)
  } else if (platform === "tiktok") {
    const p = new Path2D(
      "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"
    )
    ctx.fill(p)
  } else if (platform === "instagram") {
    ctx.lineWidth = 2.2
    drawRoundedRect(ctx, 2, 2, 20, 20, 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(12, 12, 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(17.5, 6.5, 1.3, 0, Math.PI * 2)
    ctx.fill()
  } else if (platform === "telegram") {
    const p = new Path2D(
      "M21.94 4.66a1.5 1.5 0 0 0-1.63-.26L3.1 11.46a1.2 1.2 0 0 0 .08 2.25l4.38 1.47 1.72 5.26a.9.9 0 0 0 1.53.34l2.44-2.53 4.38 3.22a1.3 1.3 0 0 0 2.04-.78l2.58-14.43a1.5 1.5 0 0 0-.31-1.6z"
    )
    ctx.fill(p)
  } else if (platform === "viber") {
    const p = new Path2D(
      "M11.7 2C6.4 2 2.5 5.6 2.5 10.6c0 2.8 1.2 5.2 3.3 6.8v3.1c0 .5.6.8 1 .5l2.8-2.1c.7.1 1.4.2 2.1.2 5.3 0 9.8-3.6 9.8-8.5S17 2 11.7 2z"
    )
    ctx.fill(p)
  } else if (platform === "whatsapp") {
    const p = new Path2D(
      "M12.04 2a9.93 9.93 0 0 0-8.46 15.16L2.5 21.5l4.47-1.05A9.93 9.93 0 1 0 12.04 2z"
    )
    ctx.fill(p)
  } else if (platform === "youtube") {
    const p = new Path2D(
      "M21.58 7.19a2.75 2.75 0 0 0-1.94-1.95C17.93 4.78 12 4.78 12 4.78s-5.93 0-7.64.46a2.75 2.75 0 0 0-1.94 1.95A28.8 28.8 0 0 0 2 12a28.8 28.8 0 0 0 .42 4.81 2.75 2.75 0 0 0 1.94 1.95c1.71.46 7.64.46 7.64.46s5.93 0 7.64-.46a2.75 2.75 0 0 0 1.94-1.95A28.8 28.8 0 0 0 22 12a28.8 28.8 0 0 0-.42-4.81zM10 15.11V8.89L15.4 12 10 15.11z"
    )
    ctx.fill(p, "evenodd")
  } else if (platform === "maps") {
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(12, 10, 6.5, Math.PI * 0.85, Math.PI * 0.15)
    ctx.lineTo(12, 21)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(12, 10, 2.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (platform === "phone") {
    const p = new Path2D(
      "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
    )
    ctx.lineWidth = 2
    ctx.stroke(p)
  } else {
    ctx.lineWidth = 2.1
    ctx.beginPath()
    ctx.arc(12, 12, 9.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(12, 12, 4.2, 9.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(2.5, 12)
    ctx.lineTo(21.5, 12)
    ctx.stroke()
  }

  ctx.restore()
}

export interface RenderQrCardParams {
  aspectRatio: QrCardAspectRatio
  themeId: QrCardThemeId
  platform: PlatformBrandTheme
  headerText: string
  headline: string
  handleText: string
  ctaText: string
  qrBlob: Blob | null
}

export async function renderQrCardCanvas(
  canvas: HTMLCanvasElement,
  params: RenderQrCardParams
): Promise<void> {
  // Pre-decode QR image before clearing/drawing canvas so the canvas is never half-drawn
  let preloadedQrImg: HTMLImageElement | null = null
  if (params.qrBlob) {
    const objUrl = URL.createObjectURL(params.qrBlob)
    try {
      preloadedQrImg = await loadImage(objUrl)
    } finally {
      URL.revokeObjectURL(objUrl)
    }
  }

  const width = 1080
  const height = params.aspectRatio === "portrait" ? 1350 : 1080
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const palette = getCardThemePalette(params.themeId, params.platform)
  const isPortrait = params.aspectRatio === "portrait"

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height)
  bgGrad.addColorStop(0, palette.bgStart)
  bgGrad.addColorStop(1, palette.bgEnd)
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  // Subtle ambient radial glow
  const glowGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    40,
    width * 0.5,
    height * 0.48,
    width * 0.62
  )
  glowGrad.addColorStop(0, palette.accentGlow)
  glowGrad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, 0, width, height)

  const fontStack =
    '"Pyidaungsu", "Noto Sans Myanmar", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  // 2. Header Platform Pill
  const headerText = params.headerText.trim() || params.platform.headerTextEn
  ctx.font = `700 30px ${fontStack}`
  const headerTextWidth = ctx.measureText(headerText).width
  const pillIconSize = 32
  const pillPadX = 34
  const pillGap = 14
  const headerPillW = Math.min(width - 120, headerTextWidth + pillPadX * 2 + pillIconSize + pillGap)
  const headerPillH = 68
  const headerPillX = (width - headerPillW) / 2
  const headerPillY = isPortrait ? 92 : 56

  ctx.save()
  drawRoundedRect(ctx, headerPillX, headerPillY, headerPillW, headerPillH, headerPillH / 2)
  ctx.fillStyle = palette.headerPillBg
  ctx.fill()
  ctx.restore()

  const iconCx = headerPillX + pillPadX + pillIconSize / 2
  const iconCy = headerPillY + headerPillH / 2
  drawPlatformGlyphOnCanvas(
    ctx,
    params.platform.id,
    iconCx,
    iconCy,
    pillIconSize,
    palette.headerPillText
  )

  ctx.fillStyle = palette.headerPillText
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.font = `700 30px ${fontStack}`
  ctx.fillText(
    headerText,
    headerPillX + pillPadX + pillIconSize + pillGap,
    headerPillY + headerPillH / 2 + 1,
    headerPillW - pillPadX * 2 - pillIconSize - pillGap
  )

  // 3. Headline & Handle
  const headlineY = isPortrait ? 228 : 168
  const headline = params.headline.trim() || "MY SHOP"
  ctx.fillStyle = palette.headlineColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `800 ${isPortrait ? 58 : 50}px ${fontStack}`
  ctx.fillText(headline, width / 2, headlineY, width - 120)

  const handle = params.handleText.trim()
  if (handle) {
    ctx.fillStyle = palette.handleColor
    ctx.font = `600 ${isPortrait ? 32 : 28}px ${fontStack}`
    ctx.fillText(handle, width / 2, headlineY + (isPortrait ? 58 : 48), width - 140)
  }

  // 4. White QR Container Card
  const qrBoxSize = isPortrait ? 650 : 540
  const qrBoxX = (width - qrBoxSize) / 2
  const qrBoxY = isPortrait ? 356 : 268

  ctx.save()
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)"
  ctx.shadowBlur = 48
  ctx.shadowOffsetY = 18
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 44)
  ctx.fillStyle = palette.cardBg
  ctx.fill()
  ctx.restore()

  ctx.save()
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 44)
  ctx.strokeStyle = palette.cardBorder
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()

  // Draw QR image inside container
  if (preloadedQrImg) {
    const innerPad = isPortrait ? 38 : 32
    ctx.drawImage(
      preloadedQrImg,
      qrBoxX + innerPad,
      qrBoxY + innerPad,
      qrBoxSize - innerPad * 2,
      qrBoxSize - innerPad * 2
    )
  }

  // 5. Call-to-Action Footer Pill
  const ctaText = params.ctaText.trim() || params.platform.ctaDefaultEn
  ctx.font = `700 ${isPortrait ? 32 : 28}px ${fontStack}`
  const ctaTextWidth = ctx.measureText(ctaText).width
  const ctaPillW = Math.min(width - 120, Math.max(420, ctaTextWidth + 110))
  const ctaPillH = isPortrait ? 82 : 72
  const ctaPillX = (width - ctaPillW) / 2
  const ctaPillY = isPortrait ? 1102 : 876

  ctx.save()
  ctx.shadowColor = "rgba(0, 0, 0, 0.14)"
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  drawRoundedRect(ctx, ctaPillX, ctaPillY, ctaPillW, ctaPillH, ctaPillH / 2)
  ctx.fillStyle = palette.ctaPillBg
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = palette.ctaPillText
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 ${isPortrait ? 32 : 28}px ${fontStack}`
  ctx.fillText(
    ctaText,
    width / 2,
    ctaPillY + ctaPillH / 2 + 1,
    ctaPillW - 64
  )

  // Subtle footer watermark
  ctx.fillStyle = palette.isLightBg
    ? "rgba(28, 25, 23, 0.35)"
    : "rgba(255, 255, 255, 0.45)"
  ctx.font = `500 22px ${fontStack}`
  ctx.fillText(
    "Scan with Phone Camera",
    width / 2,
    height - (isPortrait ? 64 : 46)
  )
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.download = filename
  link.href = url
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadCardCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<boolean> {
  const blob = await new Promise<Blob | null>((resolve) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((b) => resolve(b), "image/png", 1.0)
    } else {
      resolve(null)
    }
  })

  if (blob) {
    triggerBlobDownload(blob, filename)
    return true
  }

  const dataUrl = canvas.toDataURL("image/png")
  const link = document.createElement("a")
  link.download = filename
  link.href = dataUrl
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}
