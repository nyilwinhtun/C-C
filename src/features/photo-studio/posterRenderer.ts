import { BRAND_THEMES, type BrandThemeConfig, type PosterState } from "./types"

const FONT_STACK =
  '"Pyidaungsu", "Padauk", "Noto Sans Myanmar", "Inter", system-ui, -apple-system, sans-serif'
const FONT_STACK_BOLD =
  '"Pyidaungsu", "Padauk", "Noto Sans Myanmar", "Arial Black", "Montserrat", "Inter", system-ui, sans-serif'

function getTitleFont(state: PosterState, baseSize: number): string {
  if (state.fontStyle === "bold_promo") {
    return `900 ${baseSize + 4}px ${FONT_STACK_BOLD}`
  }
  return `700 ${baseSize}px ${FONT_STACK}`
}

function getBodyFont(state: PosterState, baseWeight: number, baseSize: number): string {
  if (state.fontStyle === "bold_promo") {
    return `${Math.min(900, baseWeight + 100)} ${baseSize}px ${FONT_STACK_BOLD}`
  }
  return `${baseWeight} ${baseSize}px ${FONT_STACK}`
}

function roundRectPath(
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

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()

  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight)
  const boxRatio = w / Math.max(1, h)

  let drawW = w
  let drawH = h
  let drawX = x
  let drawY = y

  if (imgRatio > boxRatio) {
    drawH = h
    drawW = h * imgRatio
    drawX = x - (drawW - w) / 2
  } else {
    drawW = w
    drawH = w / imgRatio
    drawY = y - (drawH - h) / 2
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH)
  ctx.restore()
}

function drawPlaceholderBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  theme: BrandThemeConfig,
  label: string
) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.fillStyle = theme.bgSecondary
  ctx.fill()
  ctx.lineWidth = 3
  ctx.setLineDash([12, 10])
  ctx.strokeStyle = theme.border
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = theme.mutedText
  ctx.font = `600 28px ${FONT_STACK}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, x + w / 2, y + h / 2)
  ctx.restore()
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const cleaned = text.trim()
  if (!cleaned) return []

  const words = cleaned.split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) {
        lines.push(current)
        if (lines.length >= maxLines) return lines
        current = ""
      }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word
      } else {
        // Fallback character wrap for long unbroken strings / Burmese text
        let chunk = ""
        for (const ch of Array.from(word)) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch
          } else {
            if (chunk) {
              lines.push(chunk)
              if (lines.length >= maxLines) return lines
            }
            chunk = ch
          }
        }
        current = chunk
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current)
  }

  return lines.slice(0, maxLines)
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg: string,
  fontSize = 24,
  padX = 22,
  padY = 11,
  alignRight = false
): { width: number; height: number } {
  ctx.save()
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`
  const metrics = ctx.measureText(text)
  const pillW = Math.ceil(metrics.width + padX * 2)
  const pillH = Math.ceil(fontSize + padY * 2)
  const drawX = alignRight ? x - pillW : x

  ctx.shadowColor = "rgba(0,0,0,0.16)"
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4

  roundRectPath(ctx, drawX, y, pillW, pillH, pillH / 2)
  ctx.fillStyle = bg
  ctx.fill()

  ctx.shadowColor = "transparent"
  ctx.fillStyle = fg
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, drawX + pillW / 2, y + pillH / 2 + 1)
  ctx.restore()

  return { width: pillW, height: pillH }
}

function drawCodBadge(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  canvasWidth: number,
  margin: number
) {
  if (!state.showCodBadge) return
  const label = state.codBadgeText.trim() || "COD Available"
  drawPill(
    ctx,
    `✓ ${label}`,
    canvasWidth - margin,
    margin,
    theme.surface,
    theme.text,
    22,
    20,
    10,
    true
  )
}

function drawShopFooter(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  canvasWidth: number,
  canvasHeight: number,
  hasLogo = false
): number {
  if (!state.showShopFooter) return 0
  const footerText = state.shopFooterText.trim()
  if (!footerText) return 0

  const footerH = 88
  const y = canvasHeight - footerH

  ctx.save()
  ctx.fillStyle = theme.footerBg
  ctx.fillRect(0, y, canvasWidth, footerH)

  ctx.fillStyle = theme.footerText
  ctx.font = getBodyFont(state, 600, 25)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const lines = wrapTextLines(ctx, footerText, canvasWidth - (hasLogo ? 220 : 80), 1)
  ctx.fillText(lines[0] || footerText, canvasWidth / 2, y + footerH / 2)
  ctx.restore()

  return footerH
}

function drawShopLogoWatermark(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  footerH: number
) {
  const padding = 6
  ctx.save()

  if (footerH > 0) {
    const size = 56
    const x = 36
    const y = canvasHeight - footerH + (footerH - size) / 2
    roundRectPath(ctx, x, y, size, size, 12)
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.fill()
    drawImageContain(ctx, logoImg, x + padding, y + padding, size - padding * 2, size - padding * 2)
  } else {
    const size = 76
    const margin = 36
    const x = canvasWidth - margin - size
    const y = canvasHeight - margin - size
    ctx.shadowColor = "rgba(0,0,0,0.18)"
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    roundRectPath(ctx, x, y, size, size, 16)
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.fill()
    ctx.shadowColor = "transparent"
    drawImageContain(ctx, logoImg, x + padding, y + padding, size - padding * 2, size - padding * 2)
  }

  ctx.restore()
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight)
  const boxRatio = w / Math.max(1, h)
  let drawW = w
  let drawH = h
  let drawX = x
  let drawY = y
  if (imgRatio > boxRatio) {
    drawW = w
    drawH = w / imgRatio
    drawY = y + (h - drawH) / 2
  } else {
    drawH = h
    drawW = h * imgRatio
    drawX = x + (w - drawW) / 2
  }
  ctx.drawImage(img, drawX, drawY, drawW, drawH)
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: BrandThemeConfig,
  w: number,
  h: number
) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, theme.bg)
  grad.addColorStop(1, theme.bgSecondary)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function renderSpotlight(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  primaryImg: HTMLImageElement | null,
  w: number,
  h: number,
  footerH: number
) {
  const pad = 44
  const contentBottom = h - footerH - pad
  const infoH = 215
  const imgH = contentBottom - pad - infoH - 24
  const imgW = w - pad * 2

  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.12)"
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  roundRectPath(ctx, pad, pad, imgW, imgH, 28)
  ctx.fillStyle = theme.surface
  ctx.fill()
  ctx.restore()

  if (primaryImg) {
    drawImageCover(ctx, primaryImg, pad, pad, imgW, imgH, 28)
  } else {
    drawPlaceholderBox(
      ctx,
      pad,
      pad,
      imgW,
      imgH,
      28,
      theme,
      "Upload Cover / Feature Photo"
    )
  }

  if (state.showNewArrivalPill) {
    drawPill(
      ctx,
      state.pillBadgeText.trim() || "FEATURED",
      pad + 22,
      pad + 22,
      theme.accent,
      theme.accentText,
      22,
      20,
      10
    )
  }
  drawCodBadge(ctx, state, theme, w, pad + 22)

  // Bottom Spotlight Info Card
  const hasPrice = Boolean(state.showPriceBadge && state.priceTag.trim())
  const cardY = pad + imgH + 24
  ctx.save()
  roundRectPath(ctx, pad, cardY, imgW, infoH, 24)
  ctx.fillStyle = theme.surface
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = theme.border
  ctx.stroke()

  const textMaxW = hasPrice ? imgW - 310 : imgW - 64
  ctx.fillStyle = theme.text
  ctx.font = getTitleFont(state, 42)
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  const titleLines = wrapTextLines(
    ctx,
    state.title || "Your Headline / Topic",
    textMaxW,
    2
  )
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, pad + 32, cardY + 30 + idx * 50)
  })

  if (state.subtitle.trim()) {
    ctx.fillStyle = theme.mutedText
    ctx.font = getBodyFont(state, 500, 26)
    const subY = cardY + 30 + Math.max(1, titleLines.length) * 50 + 8
    const subLines = wrapTextLines(ctx, state.subtitle, textMaxW, 1)
    if (subLines[0]) {
      ctx.fillText(subLines[0], pad + 32, subY)
    }
  }
  ctx.restore()

  if (hasPrice) {
    drawPill(
      ctx,
      state.priceTag.trim(),
      pad + imgW - 28,
      cardY + infoH / 2 - 32,
      theme.accent,
      theme.accentText,
      32,
      28,
      16,
      true
    )
  }
}

function renderFlashSale(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  primaryImg: HTMLImageElement | null,
  w: number,
  h: number,
  footerH: number
) {
  const pad = 44
  const contentBottom = h - footerH - pad
  const promoBarH = 220
  const imgH = contentBottom - pad - promoBarH - 22
  const imgW = w - pad * 2

  if (primaryImg) {
    drawImageCover(ctx, primaryImg, pad, pad, imgW, imgH, 28)
  } else {
    drawPlaceholderBox(
      ctx,
      pad,
      pad,
      imgW,
      imgH,
      28,
      theme,
      "Upload Promo Product Photo"
    )
  }

  const badgeText = state.promoBadgeText.trim() || "FLASH SALE"
  drawPill(
    ctx,
    `⚡ ${badgeText}`,
    pad + 22,
    pad + 22,
    theme.badgeBg,
    theme.badgeText,
    25,
    24,
    12
  )
  drawCodBadge(ctx, state, theme, w, pad + 22)

  // High-contrast Promo Card
  const cardY = pad + imgH + 22
  ctx.save()
  roundRectPath(ctx, pad, cardY, imgW, promoBarH, 24)
  ctx.fillStyle = theme.surface
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = theme.badgeBg
  ctx.stroke()

  ctx.fillStyle = theme.text
  ctx.font = getTitleFont(state, 40)
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  const titleLines = wrapTextLines(
    ctx,
    state.title || "Limited Time Offer",
    imgW - 64,
    1
  )
  ctx.fillText(titleLines[0] || "", pad + 32, cardY + 26)

  // Original price with strikethrough
  let priceRowX = pad + 32
  const priceRowY = cardY + 104
  if (state.originalPrice.trim()) {
    ctx.font = `600 34px ${FONT_STACK}`
    ctx.fillStyle = theme.mutedText
    const origText = state.originalPrice.trim()
    const origWidth = ctx.measureText(origText).width
    ctx.textBaseline = "middle"
    ctx.fillText(origText, priceRowX, priceRowY + 34)

    ctx.strokeStyle = theme.badgeBg
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(priceRowX - 4, priceRowY + 34)
    ctx.lineTo(priceRowX + origWidth + 4, priceRowY + 34)
    ctx.stroke()

    priceRowX += origWidth + 28
  }
  ctx.restore()

  const promoPrice = state.priceTag.trim() || "29,900 Ks"
  drawPill(
    ctx,
    promoPrice,
    priceRowX,
    cardY + 104,
    theme.badgeBg,
    theme.badgeText,
    36,
    30,
    14
  )
}

function renderBeforeAfter(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  primaryImg: HTMLImageElement | null,
  secondaryImg: HTMLImageElement | null,
  w: number,
  h: number,
  footerH: number
) {
  const pad = 40
  const headerH = 96
  const contentTop = pad + headerH
  const contentH = h - footerH - pad - contentTop
  const contentW = w - pad * 2
  const gap = 18

  ctx.save()
  ctx.fillStyle = theme.text
  ctx.font = `800 38px ${FONT_STACK}`
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  const titleMaxW = state.showCodBadge ? contentW - 280 : contentW
  const titleLines = wrapTextLines(
    ctx,
    state.title || "Real Results Comparison",
    titleMaxW,
    1
  )
  ctx.fillText(titleLines[0] || "", pad, pad + 38)
  ctx.restore()

  drawCodBadge(ctx, state, theme, w, pad)

  const beforeText = state.beforeLabel.trim() || "BEFORE"
  const afterText = state.afterLabel.trim() || "AFTER"

  if (state.splitDirection === "side-by-side") {
    const halfW = (contentW - gap) / 2
    if (primaryImg) {
      drawImageCover(ctx, primaryImg, pad, contentTop, halfW, contentH, 22)
    } else {
      drawPlaceholderBox(
        ctx,
        pad,
        contentTop,
        halfW,
        contentH,
        22,
        theme,
        "Upload BEFORE"
      )
    }

    const rightX = pad + halfW + gap
    if (secondaryImg) {
      drawImageCover(ctx, secondaryImg, rightX, contentTop, halfW, contentH, 22)
    } else {
      drawPlaceholderBox(
        ctx,
        rightX,
        contentTop,
        halfW,
        contentH,
        22,
        theme,
        "Upload AFTER"
      )
    }

    drawPill(
      ctx,
      beforeText,
      pad + 18,
      contentTop + 18,
      "#0F172A",
      "#FFFFFF",
      22,
      18,
      9
    )
    drawPill(
      ctx,
      afterText,
      rightX + 18,
      contentTop + 18,
      theme.accent,
      theme.accentText,
      22,
      18,
      9
    )
  } else {
    const halfH = (contentH - gap) / 2
    if (primaryImg) {
      drawImageCover(ctx, primaryImg, pad, contentTop, contentW, halfH, 22)
    } else {
      drawPlaceholderBox(
        ctx,
        pad,
        contentTop,
        contentW,
        halfH,
        22,
        theme,
        "Upload BEFORE"
      )
    }

    const bottomY = contentTop + halfH + gap
    if (secondaryImg) {
      drawImageCover(ctx, secondaryImg, pad, bottomY, contentW, halfH, 22)
    } else {
      drawPlaceholderBox(
        ctx,
        pad,
        bottomY,
        contentW,
        halfH,
        22,
        theme,
        "Upload AFTER"
      )
    }

    drawPill(
      ctx,
      beforeText,
      pad + 18,
      contentTop + 18,
      "#0F172A",
      "#FFFFFF",
      22,
      18,
      9
    )
    drawPill(
      ctx,
      afterText,
      pad + 18,
      bottomY + 18,
      theme.accent,
      theme.accentText,
      22,
      18,
      9
    )
  }
}

function renderReviewCard(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  theme: BrandThemeConfig,
  primaryImg: HTMLImageElement | null,
  w: number,
  h: number,
  footerH: number
) {
  const pad = 44
  const contentBottom = h - footerH - pad
  const cardH = 340
  const imgH = contentBottom - pad - cardH - 24
  const imgW = w - pad * 2

  if (primaryImg) {
    drawImageCover(ctx, primaryImg, pad, pad, imgW, imgH, 28)
  } else {
    drawPlaceholderBox(
      ctx,
      pad,
      pad,
      imgW,
      imgH,
      28,
      theme,
      "Upload Customer / Product Photo"
    )
  }

  if (state.showStarRating) {
    drawPill(
      ctx,
      "★★★★★  5.0",
      pad + 22,
      pad + 22,
      "#FEF3C7",
      "#B45309",
      24,
      20,
      10
    )
  } else {
    drawPill(
      ctx,
      state.pillBadgeText.trim() || "KEY TIP / QUOTE",
      pad + 22,
      pad + 22,
      theme.accent,
      theme.accentText,
      22,
      20,
      10
    )
  }
  drawCodBadge(ctx, state, theme, w, pad + 22)

  // Review / Quote Testimonial Card
  const cardY = pad + imgH + 24
  ctx.save()
  roundRectPath(ctx, pad, cardY, imgW, cardH, 24)
  ctx.fillStyle = theme.surface
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = theme.border
  ctx.stroke()

  if (state.showStarRating) {
    ctx.fillStyle = "#F59E0B"
    ctx.font = `700 30px ${FONT_STACK}`
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText("★★★★★", pad + 32, cardY + 26)
  } else {
    ctx.fillStyle = theme.accent
    ctx.font = `800 36px ${FONT_STACK}`
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText("“", pad + 32, cardY + 22)
  }

  // Quote
  ctx.fillStyle = theme.text
  ctx.font = `600 32px ${FONT_STACK}`
  const quoteText =
    state.reviewQuote.trim() ||
    '"Consistency beats intensity. Focus on one small step every single day."'
  const quoteLines = wrapTextLines(ctx, quoteText, imgW - 64, 3)
  quoteLines.forEach((line, idx) => {
    ctx.fillText(line, pad + 32, cardY + 78 + idx * 44)
  })

  // Reviewer / Author name + optional price tag
  ctx.fillStyle = theme.mutedText
  ctx.font = `600 26px ${FONT_STACK}`
  const reviewer = state.reviewerName.trim() || "Creator Note"
  ctx.fillText(`— ${reviewer}`, pad + 32, cardY + cardH - 64)
  ctx.restore()

  if (state.showPriceBadge && state.priceTag.trim()) {
    drawPill(
      ctx,
      state.priceTag.trim(),
      pad + imgW - 28,
      cardY + cardH - 76,
      theme.accent,
      theme.accentText,
      24,
      22,
      10,
      true
    )
  }
}

export function renderPosterCanvas(
  canvas: HTMLCanvasElement,
  state: PosterState,
  primaryImg: HTMLImageElement | null,
  secondaryImg: HTMLImageElement | null,
  logoImg: HTMLImageElement | null = null
) {
  const width = 1080
  const height = state.aspectRatio === "4:5" ? 1350 : 1080

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const theme = BRAND_THEMES[state.theme]
  drawBackground(ctx, theme, width, height)

  const shouldDrawLogo = Boolean(state.showShopLogo && logoImg)
  const footerH = drawShopFooter(ctx, state, theme, width, height, shouldDrawLogo)

  switch (state.template) {
    case "spotlight":
      renderSpotlight(ctx, state, theme, primaryImg, width, height, footerH)
      break
    case "flash_sale":
      renderFlashSale(ctx, state, theme, primaryImg, width, height, footerH)
      break
    case "before_after":
      renderBeforeAfter(
        ctx,
        state,
        theme,
        primaryImg,
        secondaryImg,
        width,
        height,
        footerH
      )
      break
    case "review":
      renderReviewCard(ctx, state, theme, primaryImg, width, height, footerH)
      break
  }

  if (shouldDrawLogo && logoImg) {
    drawShopLogoWatermark(ctx, logoImg, width, height, footerH)
  }
}

