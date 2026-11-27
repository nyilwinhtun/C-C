/**
 * Lightweight, zero-network HTML5 Canvas sample asset generator.
 * Produces crisp transparent PNG data URLs on demand for instant 1-tap onboarding
 * in Photo & Poster Studio and 2D Mascot Presenter Studio.
 */

let cachedProductDataUrl: string | null = null
let cachedMascotDataUrl: string | null = null

function drawRoundedRectPath(
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

/**
 * Renders a sleek studio smartphone illustration with a clean transparent background,
 * subtle metallic rim highlight, vibrant OLED display, and soft contact shadow.
 */
export function createSampleProductCutoutDataUrl(): string {
  if (cachedProductDataUrl) return cachedProductDataUrl

  const width = 760
  const height = 920
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.clearRect(0, 0, width, height)

  // Soft studio contact shadow underneath the phone
  ctx.save()
  const shadowGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.9,
    24,
    width * 0.5,
    height * 0.9,
    220
  )
  shadowGrad.addColorStop(0, "rgba(15, 23, 42, 0.34)")
  shadowGrad.addColorStop(0.6, "rgba(15, 23, 42, 0.12)")
  shadowGrad.addColorStop(1, "rgba(15, 23, 42, 0)")
  ctx.fillStyle = shadowGrad
  ctx.beginPath()
  ctx.ellipse(width * 0.5, height * 0.9, 215, 34, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Slight editorial tilt for studio depth
  ctx.save()
  ctx.translate(width * 0.5, height * 0.47)
  ctx.rotate(-0.045)

  const bodyW = 376
  const bodyH = 748
  const bx = -bodyW / 2
  const by = -bodyH / 2

  // Side hardware buttons (left & right titanium edges)
  ctx.fillStyle = "#52525B"
  drawRoundedRectPath(ctx, bx - 7, by + 130, 8, 44, 4)
  ctx.fill()
  drawRoundedRectPath(ctx, bx - 7, by + 195, 8, 72, 4)
  ctx.fill()
  drawRoundedRectPath(ctx, bx - 7, by + 282, 8, 72, 4)
  ctx.fill()
  drawRoundedRectPath(ctx, bx + bodyW - 1, by + 210, 8, 96, 4)
  ctx.fill()

  // Outer titanium frame with metallic gradient
  const frameGrad = ctx.createLinearGradient(bx, by, bx + bodyW, by + bodyH)
  frameGrad.addColorStop(0, "#71717A")
  frameGrad.addColorStop(0.22, "#27272A")
  frameGrad.addColorStop(0.5, "#52525B")
  frameGrad.addColorStop(0.8, "#18181B")
  frameGrad.addColorStop(1, "#3F3F46")
  drawRoundedRectPath(ctx, bx, by, bodyW, bodyH, 60)
  ctx.fillStyle = frameGrad
  ctx.fill()

  // Inner matte black bezel
  const bezelInset = 9
  drawRoundedRectPath(
    ctx,
    bx + bezelInset,
    by + bezelInset,
    bodyW - bezelInset * 2,
    bodyH - bezelInset * 2,
    52
  )
  ctx.fillStyle = "#09090B"
  ctx.fill()

  // OLED Screen clipped area
  const scrInset = 21
  const sx = bx + scrInset
  const sy = by + scrInset
  const sw = bodyW - scrInset * 2
  const sh = bodyH - scrInset * 2

  ctx.save()
  drawRoundedRectPath(ctx, sx, sy, sw, sh, 42)
  ctx.clip()

  // Vibrant studio wallpaper gradient
  const wpGrad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh)
  wpGrad.addColorStop(0, "#1E1B4B")
  wpGrad.addColorStop(0.45, "#4338CA")
  wpGrad.addColorStop(0.78, "#DB2777")
  wpGrad.addColorStop(1, "#F59E0B")
  ctx.fillStyle = wpGrad
  ctx.fillRect(sx, sy, sw, sh)

  // Glowing abstract studio light orbs on wallpaper
  const orb1 = ctx.createRadialGradient(
    sx + sw * 0.78,
    sy + sh * 0.25,
    12,
    sx + sw * 0.78,
    sy + sh * 0.25,
    190
  )
  orb1.addColorStop(0, "rgba(253, 224, 71, 0.85)")
  orb1.addColorStop(0.5, "rgba(251, 146, 60, 0.35)")
  orb1.addColorStop(1, "rgba(251, 146, 60, 0)")
  ctx.fillStyle = orb1
  ctx.fillRect(sx, sy, sw, sh)

  const orb2 = ctx.createRadialGradient(
    sx + sw * 0.22,
    sy + sh * 0.65,
    10,
    sx + sw * 0.22,
    sy + sh * 0.65,
    210
  )
  orb2.addColorStop(0, "rgba(56, 189, 248, 0.78)")
  orb2.addColorStop(0.55, "rgba(99, 102, 241, 0.3)")
  orb2.addColorStop(1, "rgba(99, 102, 241, 0)")
  ctx.fillStyle = orb2
  ctx.fillRect(sx, sy, sw, sh)

  // Minimalist lock-screen clock typography
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = "700 84px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  ctx.fillText("9:41", sx + sw / 2, sy + 168)

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)"
  ctx.font = "600 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  ctx.fillText("STUDIO PRO MAX • 5G", sx + sw / 2, sy + 106)

  // Frosted glass feature card on screen
  drawRoundedRectPath(ctx, sx + 26, sy + sh - 210, sw - 52, 134, 24)
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)"
  ctx.fill()
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = "#FFFFFF"
  ctx.font = "700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  ctx.fillText("256GB • TITANIUM", sx + sw / 2, sy + sh - 160)
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)"
  ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  ctx.fillText("1-Year Official Warranty", sx + sw / 2, sy + sh - 124)

  // Dynamic Island pill
  drawRoundedRectPath(ctx, sx + sw / 2 - 52, sy + 16, 104, 28, 14)
  ctx.fillStyle = "#09090B"
  ctx.fill()
  // Tiny front camera lens glint
  ctx.beginPath()
  ctx.arc(sx + sw / 2 + 28, sy + 30, 5.5, 0, Math.PI * 2)
  ctx.fillStyle = "#1E293B"
  ctx.fill()
  ctx.beginPath()
  ctx.arc(sx + sw / 2 + 26.5, sy + 28.5, 2, 0, Math.PI * 2)
  ctx.fillStyle = "#38BDF8"
  ctx.fill()

  // Home indicator bar
  drawRoundedRectPath(ctx, sx + sw / 2 - 56, sy + sh - 22, 112, 6, 3)
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)"
  ctx.fill()

  // Diagonal glass reflection sheen
  const sheenGrad = ctx.createLinearGradient(sx, sy, sx + sw * 0.85, sy + sh * 0.55)
  sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.24)")
  sheenGrad.addColorStop(0.42, "rgba(255, 255, 255, 0.05)")
  sheenGrad.addColorStop(0.45, "rgba(255, 255, 255, 0)")
  ctx.fillStyle = sheenGrad
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + sw, sy)
  ctx.lineTo(sx + sw * 0.25, sy + sh)
  ctx.lineTo(sx, sy + sh)
  ctx.closePath()
  ctx.fill()

  ctx.restore() // end screen clip

  // Crisp subtle outer rim highlight
  drawRoundedRectPath(ctx, bx + 1.5, by + 1.5, bodyW - 3, bodyH - 3, 59)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
  ctx.lineWidth = 2.5
  ctx.stroke()

  ctx.restore()

  cachedProductDataUrl = canvas.toDataURL("image/png")
  canvas.width = 0
  canvas.height = 0
  return cachedProductDataUrl
}

/**
 * Renders a stylized editorial 2D presenter mascot illustration on a clean
 * transparent canvas with crisp edges for instant 2D Mascot Studio previews.
 */
export function createSampleMascotCutoutDataUrl(): string {
  if (cachedMascotDataUrl) return cachedMascotDataUrl

  const width = 720
  const height = 900
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.clearRect(0, 0, width, height)

  const cx = width * 0.5

  // 1. Hair back silhouette
  ctx.fillStyle = "#1E1B2E"
  ctx.beginPath()
  ctx.ellipse(cx, 315, 162, 188, 0, 0, Math.PI * 2)
  ctx.fill()

  // 2. Shoulders & Editorial Blazer / Studio Hoodie
  const blazerGrad = ctx.createLinearGradient(cx - 210, 480, cx + 210, 880)
  blazerGrad.addColorStop(0, "#1E293B")
  blazerGrad.addColorStop(0.55, "#0F172A")
  blazerGrad.addColorStop(1, "#18181B")

  ctx.fillStyle = blazerGrad
  ctx.beginPath()
  ctx.moveTo(cx - 220, 872)
  ctx.quadraticCurveTo(cx - 215, 565, cx - 102, 515)
  ctx.lineTo(cx + 102, 515)
  ctx.quadraticCurveTo(cx + 215, 565, cx + 220, 872)
  ctx.closePath()
  ctx.fill()

  // Warm cream inner t-shirt V-neck
  ctx.fillStyle = "#FAF5EE"
  ctx.beginPath()
  ctx.moveTo(cx - 72, 516)
  ctx.lineTo(cx, 668)
  ctx.lineTo(cx + 72, 516)
  ctx.closePath()
  ctx.fill()

  // Blazer lapels with subtle amber trim
  ctx.fillStyle = "#334155"
  ctx.beginPath()
  ctx.moveTo(cx - 100, 516)
  ctx.lineTo(cx - 58, 516)
  ctx.lineTo(cx - 8, 668)
  ctx.lineTo(cx - 86, 616)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx + 100, 516)
  ctx.lineTo(cx + 58, 516)
  ctx.lineTo(cx + 8, 668)
  ctx.lineTo(cx + 86, 616)
  ctx.closePath()
  ctx.fill()

  // Clip-on wireless creator lapel mic (gold/charcoal)
  drawRoundedRectPath(ctx, cx + 52, 588, 22, 34, 6)
  ctx.fillStyle = "#18181B"
  ctx.fill()
  ctx.strokeStyle = "#F59E0B"
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + 63, 598, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = "#10B981"
  ctx.fill()

  // 3. Neck & Neck shadow
  drawRoundedRectPath(ctx, cx - 40, 428, 80, 108, 32)
  ctx.fillStyle = "#E8B89A"
  ctx.fill()

  ctx.fillStyle = "rgba(154, 88, 56, 0.22)"
  ctx.beginPath()
  ctx.ellipse(cx, 456, 42, 22, 0, 0, Math.PI * 2)
  ctx.fill()

  // 4. Ears
  ctx.fillStyle = "#F0C4A8"
  ctx.beginPath()
  ctx.ellipse(cx - 122, 336, 22, 32, -0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + 122, 336, 22, 32, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // 5. Studio Headphones band & ear cups (warm amber & matte charcoal)
  ctx.strokeStyle = "#27272A"
  ctx.lineWidth = 18
  ctx.beginPath()
  ctx.arc(cx, 302, 146, Math.PI * 1.06, Math.PI * 1.94)
  ctx.stroke()

  ctx.strokeStyle = "#F59E0B"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, 302, 152, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()

  // Left & right headphone cups
  drawRoundedRectPath(ctx, cx - 156, 294, 34, 82, 16)
  ctx.fillStyle = "#18181B"
  ctx.fill()
  drawRoundedRectPath(ctx, cx - 150, 308, 12, 54, 6)
  ctx.fillStyle = "#F59E0B"
  ctx.fill()

  drawRoundedRectPath(ctx, cx + 122, 294, 34, 82, 16)
  ctx.fillStyle = "#18181B"
  ctx.fill()
  drawRoundedRectPath(ctx, cx + 138, 308, 12, 54, 6)
  ctx.fillStyle = "#F59E0B"
  ctx.fill()

  // 6. Face base
  const faceGrad = ctx.createRadialGradient(cx - 22, 290, 20, cx, 325, 160)
  faceGrad.addColorStop(0, "#F9D8C0")
  faceGrad.addColorStop(1, "#E8B89A")
  ctx.fillStyle = faceGrad
  ctx.beginPath()
  ctx.ellipse(cx, 325, 122, 142, 0, 0, Math.PI * 2)
  ctx.fill()

  // Soft cheek blush
  ctx.fillStyle = "rgba(244, 114, 182, 0.22)"
  ctx.beginPath()
  ctx.ellipse(cx - 64, 360, 24, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + 64, 360, 24, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // 7. Expressive Eyes & Eyebrows
  ctx.strokeStyle = "#1E1B2E"
  ctx.lineWidth = 6
  ctx.lineCap = "round"
  // Left eyebrow
  ctx.beginPath()
  ctx.moveTo(cx - 72, 286)
  ctx.quadraticCurveTo(cx - 48, 274, cx - 24, 284)
  ctx.stroke()
  // Right eyebrow
  ctx.beginPath()
  ctx.moveTo(cx + 24, 284)
  ctx.quadraticCurveTo(cx + 48, 274, cx + 72, 286)
  ctx.stroke()

  // Eyes
  for (const dir of [-1, 1]) {
    const ex = cx + dir * 48
    const ey = 322
    ctx.fillStyle = "#18181B"
    ctx.beginPath()
    ctx.ellipse(ex, ey, 13, 15, 0, 0, Math.PI * 2)
    ctx.fill()
    // Crisp eye sparkle
    ctx.fillStyle = "#FFFFFF"
    ctx.beginPath()
    ctx.arc(ex - 4, ey - 5, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex + 4, ey + 4, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Subtle nose
  ctx.strokeStyle = "#C88E6E"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cx, 336)
  ctx.quadraticCurveTo(cx + 7, 354, cx - 2, 360)
  ctx.stroke()

  // Warm friendly smile
  ctx.fillStyle = "#9F1239"
  ctx.beginPath()
  ctx.moveTo(cx - 34, 386)
  ctx.quadraticCurveTo(cx, 422, cx + 34, 386)
  ctx.quadraticCurveTo(cx, 392, cx - 34, 386)
  ctx.closePath()
  ctx.fill()
  // Smile highlight
  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.moveTo(cx - 24, 388)
  ctx.quadraticCurveTo(cx, 396, cx + 24, 388)
  ctx.quadraticCurveTo(cx, 392, cx - 24, 388)
  ctx.closePath()
  ctx.fill()

  // 8. Stylized Front Hair Bangs & Sweep
  ctx.fillStyle = "#1E1B2E"
  ctx.beginPath()
  ctx.moveTo(cx - 128, 300)
  ctx.quadraticCurveTo(cx - 135, 165, cx, 162)
  ctx.quadraticCurveTo(cx + 135, 165, cx + 128, 300)
  ctx.quadraticCurveTo(cx + 92, 232, cx + 32, 224)
  ctx.quadraticCurveTo(cx - 18, 258, cx - 64, 234)
  ctx.quadraticCurveTo(cx - 102, 246, cx - 128, 300)
  ctx.closePath()
  ctx.fill()

  // Subtle glossy hair highlight
  ctx.strokeStyle = "rgba(148, 163, 184, 0.32)"
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(cx, 256, 86, Math.PI * 1.18, Math.PI * 1.65)
  ctx.stroke()

  // 9. Right hand holding a mini studio phone card
  ctx.save()
  ctx.translate(cx + 150, 710)
  ctx.rotate(0.14)
  drawRoundedRectPath(ctx, -46, -78, 92, 156, 18)
  ctx.fillStyle = "#F59E0B"
  ctx.fill()
  drawRoundedRectPath(ctx, -38, -68, 76, 136, 12)
  ctx.fillStyle = "#0F172A"
  ctx.fill()
  // Mini spark icon on phone
  ctx.fillStyle = "#38BDF8"
  ctx.beginPath()
  ctx.arc(0, -10, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(-20, 22, 40, 8)
  ctx.fillRect(-14, 38, 28, 6)
  ctx.restore()

  // Stylized hand fingers wrapping phone
  ctx.fillStyle = "#F0C4A8"
  ctx.beginPath()
  ctx.ellipse(cx + 134, 748, 32, 26, -0.2, 0, Math.PI * 2)
  ctx.fill()

  cachedMascotDataUrl = canvas.toDataURL("image/png")
  canvas.width = 0
  canvas.height = 0
  return cachedMascotDataUrl
}

let cachedSampleAudioBlob: Blob | null = null

/**
 * Generates a short 2.0-second synthetic speech-cadence WAV audio blob
 * (16 kHz mono PCM) so 2D Mascot Presenter `Try Sample` immediately enables
 * lip-sync preview and a 2-second test video export without requiring an audio upload.
 */
export function createSampleVoiceoverWavBlob(durationSec = 2.0): Blob {
  if (cachedSampleAudioBlob) return cachedSampleAudioBlob

  const sampleRate = 16000
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const dataBytes = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format = 1
  view.setUint16(22, 1, true) // Mono = 1 channel
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, "data")
  view.setUint32(40, dataBytes, true)

  // Soft warm syllable-cadence envelope so the lip-sync analyzer & waveform animate naturally
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const syllableEnvelope =
      Math.max(0, Math.sin(t * Math.PI * 5.2)) *
      (0.65 + 0.35 * Math.sin(t * Math.PI * 2.1))
    const fadeEdge =
      Math.min(1, t / 0.08) * Math.min(1, Math.max(0, durationSec - t) / 0.12)
    const carrier =
      0.55 * Math.sin(2 * Math.PI * 195 * t) +
      0.3 * Math.sin(2 * Math.PI * 390 * t) +
      0.15 * Math.sin(2 * Math.PI * 620 * t)
    const sample = Math.max(-1, Math.min(1, carrier * syllableEnvelope * fadeEdge * 0.32))
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true)
  }

  cachedSampleAudioBlob = new Blob([buffer], { type: "audio/wav" })
  return cachedSampleAudioBlob
}
