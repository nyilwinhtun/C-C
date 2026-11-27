export interface LipSyncWeights {
  /** Low-mid vocal openness (300–1000 Hz) */
  aa: number
  /** Rounded vowel openness derived from low-mid */
  oh: number
  /** Tight rounded vowel openness */
  ou: number
  /** High-mid mouth spread (1500–3500 Hz) */
  ee: number
  /** Secondary high-mid spread */
  ih: number
  /** Overall vocal energy (0–1) */
  energy: number
}

export interface LipSyncAnalyzer {
  analyser: AnalyserNode
  update: (delta?: number) => LipSyncWeights
  reset: () => void
  getWeights: () => LipSyncWeights
  dispose: () => void
}

export interface CreateLipSyncAnalyzerOptions {
  audioContext: AudioContext
  sourceNode: AudioNode
  fftSize?: number
  smoothingTimeConstant?: number
  /** Connect analyser output to destination (default: false; caller routes sourceNode directly) */
  connectToDestination?: boolean
}

function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * Math.min(1, Math.max(0, alpha))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Computes average normalized energy (0–1) within [minHz, maxHz] from FFT byte frequency data.
 */
function sampleBandEnergy(
  freqData: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
): number {
  const nyquist = sampleRate / 2
  const binCount = freqData.length
  const startBin = Math.max(0, Math.floor((minHz / nyquist) * binCount))
  const endBin = Math.min(binCount - 1, Math.ceil((maxHz / nyquist) * binCount))

  if (endBin < startBin) return 0

  let sum = 0
  let count = 0
  for (let i = startBin; i <= endBin; i++) {
    sum += freqData[i] / 255
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * Web Audio AnalyserNode lip-sync analyzer.
 * Splits playback frequencies into:
 * - Low-mid (300–1000 Hz) -> `aa` / `oh` mouth openness
 * - High-mid (1500–3500 Hz) -> `ee` / `ih` mouth spread
 * with smooth lerp interpolation.
 */
export function createLipSyncAnalyzer({
  audioContext,
  sourceNode,
  fftSize = 1024,
  smoothingTimeConstant = 0.55,
  connectToDestination = false,
}: CreateLipSyncAnalyzerOptions): LipSyncAnalyzer {
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = smoothingTimeConstant

  sourceNode.connect(analyser)
  if (connectToDestination) {
    analyser.connect(audioContext.destination)
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount)

  const state: LipSyncWeights = {
    aa: 0,
    oh: 0,
    ou: 0,
    ee: 0,
    ih: 0,
    energy: 0,
  }

  const update = (delta = 1 / 60): LipSyncWeights => {
    analyser.getByteFrequencyData(freqData)
    const sampleRate = audioContext.sampleRate || 48000

    const lowMidRaw = sampleBandEnergy(freqData, sampleRate, 300, 1000)
    const highMidRaw = sampleBandEnergy(freqData, sampleRate, 1500, 3500)

    // Noise floor gating + expressive gain curve for speech
    const lowMid = clamp01((lowMidRaw - 0.06) * 2.2)
    const highMid = clamp01((highMidRaw - 0.04) * 2.6)

    const targetAa = clamp01(lowMid * 1.05)
    const targetOh = clamp01(lowMid * 0.62 * (1 - highMid * 0.45))
    const targetOu = clamp01(lowMid * 0.48 * (1 - highMid * 0.55))
    const targetEe = clamp01(highMid * 0.95)
    const targetIh = clamp01(highMid * 0.65)
    const targetEnergy = clamp01(Math.max(targetAa, targetEe * 0.85))

    // Frame-rate independent smoothing
    const attackAlpha = 1 - Math.exp(-22 * delta)
    const releaseAlpha = 1 - Math.exp(-14 * delta)

    state.aa = lerp(state.aa, targetAa, targetAa > state.aa ? attackAlpha : releaseAlpha)
    state.oh = lerp(state.oh, targetOh, targetOh > state.oh ? attackAlpha : releaseAlpha)
    state.ou = lerp(state.ou, targetOu, targetOu > state.ou ? attackAlpha : releaseAlpha)
    state.ee = lerp(state.ee, targetEe, targetEe > state.ee ? attackAlpha : releaseAlpha)
    state.ih = lerp(state.ih, targetIh, targetIh > state.ih ? attackAlpha : releaseAlpha)
    state.energy = lerp(
      state.energy,
      targetEnergy,
      targetEnergy > state.energy ? attackAlpha : releaseAlpha
    )

    return { ...state }
  }

  const reset = () => {
    state.aa = 0
    state.oh = 0
    state.ou = 0
    state.ee = 0
    state.ih = 0
    state.energy = 0
  }

  const getWeights = (): LipSyncWeights => ({ ...state })

  const dispose = () => {
    try {
      sourceNode.disconnect(analyser)
    } catch {
      // Ignore if already disconnected
    }
    try {
      analyser.disconnect()
    } catch {
      // Ignore if already disconnected
    }
  }

  return {
    analyser,
    update,
    reset,
    getWeights,
    dispose,
  }
}

export type PresenterStudioSet =
  | "mobile_showroom"
  | "tech_podcast"
  | "soft_bokeh"
  | "custom_photo"

export type Presenter3dPopMotionPreset = "orbit_sway" | "slow_push" | "vocal_bounce"

export type MascotPosition = "left" | "center" | "right"

export type StudioLightingPreset = "natural" | "warm_studio" | "crisp_daylight"

export interface MascotCutoutFrameOptions {
  framing?: "upper_body" | "close_up"
  position?: MascotPosition
  hasShowcaseCard?: boolean
  talkingImg?: HTMLImageElement | null
  talkingBlend?: number
  lighting?: StudioLightingPreset
  lowPower?: boolean
}

export function getStudioLightingCssFilter(preset: StudioLightingPreset): string {
  switch (preset) {
    case "warm_studio":
      return "brightness(1.03) contrast(1.04) saturate(1.06) sepia(0.11)"
    case "crisp_daylight":
      return "brightness(1.05) contrast(1.06) saturate(1.04) hue-rotate(-4deg)"
    case "natural":
    default:
      return "none"
  }
}

/**
 * Draws a subtle studio lighting atmospheric tint over the stage backdrop so the
 * mascot cutout and backdrop share cohesive lighting in both preview and export.
 */
export function drawStudioLightingAtmosphere(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  preset: StudioLightingPreset
): void {
  if (preset === "natural") return
  ctx.save()
  if (preset === "warm_studio") {
    const grad = ctx.createRadialGradient(
      canvasW * 0.5,
      canvasH * 0.25,
      canvasW * 0.08,
      canvasW * 0.5,
      canvasH * 0.5,
      canvasH * 0.85
    )
    grad.addColorStop(0, "rgba(255, 232, 196, 0.10)")
    grad.addColorStop(1, "rgba(180, 120, 60, 0.05)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvasW, canvasH)
  } else if (preset === "crisp_daylight") {
    const grad = ctx.createRadialGradient(
      canvasW * 0.5,
      canvasH * 0.2,
      canvasW * 0.08,
      canvasW * 0.5,
      canvasH * 0.5,
      canvasH * 0.85
    )
    grad.addColorStop(0, "rgba(224, 242, 254, 0.10)")
    grad.addColorStop(1, "rgba(186, 230, 253, 0.04)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvasW, canvasH)
  }
  ctx.restore()
}

export interface ShowcaseCardOptions {
  side: "left" | "right"
  /** Seconds elapsed since the card appeared or playback/render started */
  entranceElapsed: number
  elapsed: number
  lip: LipSyncWeights
  hasLowerThird?: boolean
  captionsOn?: boolean
  lighting?: StudioLightingPreset
  lowPower?: boolean
}

/**
 * Draws a sleek side-by-side Product / Slide Showcase Card on the opposite side of the mascot
 * with rounded frame, subtle drop shadow, and smooth fade/slide entrance.
 */
export function drawShowcaseCard(
  ctx: CanvasRenderingContext2D,
  mediaImg: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  options: ShowcaseCardOptions
): void {
  const isVertical = canvasH > canvasW
  const lowPower = Boolean(options.lowPower)
  const entranceDuration = 0.48
  const rawProgress = clamp01(options.entranceElapsed / entranceDuration)
  // Smooth easeOutCubic entrance
  const eased = 1 - Math.pow(1 - rawProgress, 3)

  const marginX = canvasW * 0.045
  const cardW = canvasW * (isVertical ? 0.455 : 0.44)
  const srcW = mediaImg.naturalWidth || mediaImg.width || 1
  const srcH = mediaImg.naturalHeight || mediaImg.height || 1
  const imgAspect = srcW / srcH

  // Constrain card height nicely to avoid colliding with lower-third / captions
  const maxCardH = canvasH * (isVertical ? 0.44 : 0.62)
  const minCardH = canvasW * 0.34
  const idealH = cardW / Math.max(0.55, Math.min(1.65, imgAspect))
  const cardH = Math.max(minCardH, Math.min(maxCardH, idealH))

  const baseX = options.side === "left" ? marginX : canvasW - marginX - cardW
  const slideDist = canvasW * 0.055 * (1 - eased)
  const cardX = options.side === "left" ? baseX - slideDist : baseX + slideDist

  const topSafe = isVertical ? canvasH * 0.14 : canvasH * 0.10
  let bottomSafe = isVertical ? canvasH * 0.24 : canvasH * 0.14
  if (options.captionsOn) {
    bottomSafe = Math.max(bottomSafe, canvasH * (isVertical ? 0.32 : 0.24))
  }
  if (options.hasLowerThird) {
    bottomSafe += canvasW * 0.09
  }
  const availH = Math.max(cardH, canvasH - topSafe - bottomSafe)
  const floatY = Math.sin(options.elapsed * 1.55 + 0.8) * (canvasH * 0.0035)
  const cardY = topSafe + (availH - cardH) * 0.46 + floatY

  const radius = Math.round(Math.min(cardW, cardH) * 0.085)
  const framePad = Math.max(5, Math.round(cardW * 0.032))
  const innerR = Math.max(4, radius - Math.round(framePad * 0.55))

  ctx.save()
  ctx.globalAlpha = eased

  // Subtle drop shadow
  if (!lowPower) {
    ctx.shadowColor = "rgba(15, 15, 18, 0.28)"
    ctx.shadowBlur = 24
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 10
  } else {
    ctx.shadowColor = "rgba(15, 15, 18, 0.18)"
    ctx.shadowBlur = 10
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 5
  }

  // Crisp editorial card frame
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)"
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Subtle hairline border
  ctx.strokeStyle = "rgba(24, 24, 27, 0.12)"
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.stroke()

  // Clipped inner media area (cover/contain cleanly without distortion)
  const innerX = cardX + framePad
  const innerY = cardY + framePad
  const innerW = Math.max(10, cardW - framePad * 2)
  const innerH = Math.max(10, cardH - framePad * 2)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(innerX, innerY, innerW, innerH, innerR)
  ctx.clip()

  ctx.fillStyle = "#F4F4F5"
  ctx.fillRect(innerX, innerY, innerW, innerH)

  // Use contain if extreme aspect ratio, otherwise gentle cover
  const boxAspect = innerW / innerH
  const aspectDiff = Math.abs(imgAspect - boxAspect) / Math.max(imgAspect, boxAspect)
  const scale =
    aspectDiff > 0.35
      ? Math.min(innerW / srcW, innerH / srcH)
      : Math.max(innerW / srcW, innerH / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale
  const drawX = innerX + (innerW - drawW) / 2
  const drawY = innerY + (innerH - drawH) / 2

  const filterCss = options.lighting ? getStudioLightingCssFilter(options.lighting) : "none"
  if (filterCss !== "none") {
    ctx.filter = filterCss
  }
  ctx.drawImage(mediaImg, drawX, drawY, drawW, drawH)
  ctx.filter = "none"
  ctx.restore()

  ctx.restore()
}

/**
 * Draws a subtle damped Audio Waveform Bar along the bottom edge of the stage
 * in a clean Matte Charcoal & Crisp White editorial aesthetic.
 */
export function drawBottomAudioWaveformBar(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  lip: LipSyncWeights,
  elapsed: number,
  smoothedBars: Float32Array,
  delta: number
): void {
  const barCount = smoothedBars.length
  if (barCount === 0) return

  const energy = clamp01(lip.energy)
  const marginX = Math.round(canvasW * 0.06)
  const trackW = canvasW - marginX * 2
  const barMaxH = Math.max(10, Math.round(canvasH * 0.026))
  const barMinH = Math.max(2.5, Math.round(canvasH * 0.0038))
  const bottomEdgeY = canvasH - Math.max(10, Math.round(canvasH * 0.016))
  const railH = barMaxH + 10
  const railY = bottomEdgeY - railH

  // Damped temporal smoothing per bar
  const attack = 1 - Math.exp(-16 * delta)
  const release = 1 - Math.exp(-7 * delta)

  ctx.save()

  // Subtle matte charcoal frosted rail at bottom edge
  ctx.fillStyle = "rgba(24, 24, 27, 0.52)"
  ctx.beginPath()
  ctx.roundRect(marginX - 8, railY, trackW + 16, railH, railH / 2)
  ctx.fill()

  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(marginX - 8, railY, trackW + 16, railH, railH / 2)
  ctx.stroke()

  const step = trackW / barCount
  const barW = Math.max(2, step * 0.48)
  const centerY = railY + railH / 2

  for (let i = 0; i < barCount; i++) {
    const t = i / Math.max(1, barCount - 1)
    const band = t < 0.34 ? lip.aa : t < 0.67 ? lip.oh : lip.ee
    const envelope = Math.sin(Math.PI * t) * 0.55 + 0.45
    const wave =
      0.5 + 0.5 * Math.sin(elapsed * 5.6 + i * 0.72) * Math.cos(elapsed * 2.4 + i * 0.29)
    const target = clamp01((energy * 0.58 + band * 0.42) * wave * envelope)

    const prev = smoothedBars[i]
    const next = prev + (target - prev) * (target > prev ? attack : release)
    smoothedBars[i] = next

    const h = barMinH + (barMaxH - barMinH) * next
    const x = marginX + i * step + (step - barW) / 2
    const alpha = 0.38 + next * 0.62

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`
    ctx.beginPath()
    ctx.roundRect(x, centerY - h / 2, barW, h, barW / 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Helper to draw a mascot cutout image with optional 3-slice vocal mouth articulation.
 */
function drawCutoutImageLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  px: number,
  py: number,
  pw: number,
  ph: number,
  mouthOpen: number,
  mouthSpread: number,
  useArticulation: boolean
): void {
  const srcW = img.naturalWidth || img.width || 1
  const srcH = img.naturalHeight || img.height || 1

  if (!useArticulation || (mouthOpen <= 0.01 && mouthSpread <= 0.01)) {
    ctx.drawImage(img, px, py, pw, ph)
    return
  }

  const splitTop = 0.44
  const splitBot = 0.60
  const sTopH = srcH * splitTop
  const sMidH = srcH * (splitBot - splitTop)
  const sBotH = srcH - sTopH - sMidH

  const dTopH = ph * splitTop
  const jawDropPx = ph * 0.024 * mouthOpen
  const dMidH = ph * (splitBot - splitTop) + jawDropPx
  const dBotH = ph * (1 - splitBot)
  const midSpreadPx = pw * 0.012 * mouthSpread

  // 1. Upper head (crisp, anchored)
  ctx.drawImage(img, 0, 0, srcW, sTopH + 1, px, py, pw, dTopH + 1)

  // 2. Mouth band (subtle vertical vocal openness + horizontal spread)
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.drawImage(
    img,
    0,
    sTopH,
    srcW,
    sMidH + 1,
    px - midSpreadPx / 2,
    py + dTopH,
    pw + midSpreadPx,
    dMidH + 1
  )

  // 3. Lower chin & body (follows jaw drop cleanly)
  ctx.drawImage(
    img,
    0,
    sTopH + sMidH,
    srcW,
    sBotH,
    px,
    py + dTopH + dMidH,
    pw,
    dBotH
  )
}

/**
 * Draws a crisp transparent 2D Mascot Cutout directly onto the stage backdrop with:
 * - Left / Center / Right stage positioning (for side-by-side product showcase)
 * - Optional 2-state expression swap (Idle vs. Talking/Expressive cutout)
 * - Subtle idle breathing & floating motion
 * - Gentle expressive tilt & bounce when speaking
 * - Seamless audio-reactive lower-face / mouth-zone lip-sync articulation
 * - Lightweight Canvas lighting filter presets
 */
export function drawMascotCutoutFrame(
  ctx: CanvasRenderingContext2D,
  cutoutImg: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  lip: LipSyncWeights,
  elapsed: number,
  options?: MascotCutoutFrameOptions
): void {
  const lowPower = Boolean(options?.lowPower)
  const isCloseUp = options?.framing === "close_up"
  const position: MascotPosition = options?.position ?? "center"
  const hasShowcase = Boolean(options?.hasShowcaseCard) && position !== "center"
  const talkingImg = options?.talkingImg ?? null
  const talkingBlend = clamp01(options?.talkingBlend ?? 0)
  const lighting: StudioLightingPreset = options?.lighting ?? "natural"

  const energy = clamp01(lip.energy)
  const mouthOpen = clamp01(lip.aa * 0.85 + lip.oh * 0.45)
  const mouthSpread = clamp01(lip.ee * 0.75 + lip.ih * 0.35)

  // Stage placement box based on Left / Center / Right position
  let areaX = canvasW * 0.06
  let areaW = canvasW * 0.88
  if (position === "left") {
    areaX = canvasW * 0.02
    areaW = canvasW * (hasShowcase ? 0.50 : 0.56)
  } else if (position === "right") {
    areaW = canvasW * (hasShowcase ? 0.50 : 0.56)
    areaX = canvasW - areaW - canvasW * 0.02
  }

  const areaY = canvasH * (isCloseUp ? 0.06 : 0.09)
  const areaH = canvasH * (isCloseUp ? 0.72 : 0.66)

  const srcW = cutoutImg.naturalWidth || cutoutImg.width || 1
  const srcH = cutoutImg.naturalHeight || cutoutImg.height || 1
  const fitScale = isCloseUp ? 1.12 : 1.0
  const fit = Math.min(areaW / srcW, areaH / srcH) * fitScale
  const pw = srcW * fit
  const ph = srcH * fit
  const px = areaX + (areaW - pw) / 2

  // Subtle breathing, floating motion & vocal bounce
  const breathe = Math.sin(elapsed * 1.6)
  const floatY = breathe * (canvasH * 0.005) - energy * (canvasH * 0.009)
  const py = areaY + (areaH - ph) / 2 + floatY + (isCloseUp ? canvasH * 0.04 : 0)

  // Gentle tilt when speaking + subtle idle sway
  const speakingTilt = Math.sin(elapsed * 3.4) * energy * 0.03
  const idleSway = Math.sin(elapsed * 0.95) * 0.01
  const tiltRad = speakingTilt + idleSway

  const scaleX = 1 + breathe * 0.003 + energy * 0.013 + mouthSpread * 0.01
  const scaleY = 1 + breathe * 0.005 + energy * 0.02

  const pivotX = px + pw / 2
  const pivotY = py + ph * 0.78

  ctx.save()
  ctx.translate(pivotX, pivotY)
  ctx.rotate(tiltRad)
  ctx.scale(scaleX, scaleY)
  ctx.translate(-pivotX, -pivotY)

  const filterCss = getStudioLightingCssFilter(lighting)
  if (filterCss !== "none") {
    ctx.filter = filterCss
  }

  // Soft stage contact drop-shadow (skips expensive extra pass on lowPower)
  if (!lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.26)"
    ctx.shadowBlur = 20
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 11
  }

  const useTalkingSwap = Boolean(talkingImg) && talkingBlend > 0.02

  if (!useTalkingSwap) {
    // Single idle pose with subtle 3-slice mouth articulation
    drawCutoutImageLayer(ctx, cutoutImg, px, py, pw, ph, mouthOpen, mouthSpread, true)
  } else if (talkingImg && talkingBlend >= 0.96) {
    // Full talking/expressive cutout anchored to same center-bottom as idle cutout
    const tSrcW = talkingImg.naturalWidth || talkingImg.width || srcW
    const tSrcH = talkingImg.naturalHeight || talkingImg.height || srcH
    const tFit = Math.min(areaW / tSrcW, areaH / tSrcH) * fitScale
    const tw = tSrcW * tFit
    const th = tSrcH * tFit
    const tx = px + (pw - tw) / 2
    const ty = py + (ph - th)
    drawCutoutImageLayer(ctx, talkingImg, tx, ty, tw, th, mouthOpen * 0.25, mouthSpread * 0.25, false)
  } else if (talkingImg) {
    // Smooth crossfade between Idle and Talking cutout
    const tSrcW = talkingImg.naturalWidth || talkingImg.width || srcW
    const tSrcH = talkingImg.naturalHeight || talkingImg.height || srcH
    const tFit = Math.min(areaW / tSrcW, areaH / tSrcH) * fitScale
    const tw = tSrcW * tFit
    const th = tSrcH * tFit
    const tx = px + (pw - tw) / 2
    const ty = py + (ph - th)

    ctx.save()
    ctx.globalAlpha = 1 - talkingBlend
    drawCutoutImageLayer(ctx, cutoutImg, px, py, pw, ph, mouthOpen * 0.4, mouthSpread * 0.4, false)
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = talkingBlend
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    drawCutoutImageLayer(ctx, talkingImg, tx, ty, tw, th, 0, 0, false)
    ctx.restore()
  }

  ctx.filter = "none"
  ctx.restore()
}

export type CaptionStyle = "classic" | "dynamic_pop"

export interface CaptionBarOptions {
  style?: CaptionStyle
  lip?: LipSyncWeights
  elapsed?: number
  hasLowerThird?: boolean
  lowPower?: boolean
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string[] {
  const lines: string[] = []
  let line = ""
  const tokens = text.includes(" ") ? text.split(/(\s+)/) : Array.from(text)
  for (const tok of tokens) {
    const pieces = ctx.measureText(tok).width > maxW ? Array.from(tok) : [tok]
    for (const p of pieces) {
      if (line && ctx.measureText(line + p).width > maxW) {
        lines.push(line.trim())
        line = p.trimStart()
      } else {
        line += p
      }
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

export function drawCaptionBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  options?: CaptionBarOptions
): void {
  const clean = text.trim()
  if (!clean) return

  const style: CaptionStyle = options?.style ?? "classic"
  const isVertical = canvasH > canvasW

  if (style === "dynamic_pop") {
    const fontSize = Math.round(canvasW * 0.048)
    ctx.save()
    ctx.font = `800 ${fontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const maxW = canvasW * 0.84
    const lines = wrapCaptionLines(ctx, clean, maxW)
    const shown = lines.slice(-3)
    const lh = fontSize * 1.48
    const padY = fontSize * 0.45
    const boxH = shown.length * lh + padY * 2
    const safeBottomOffset = isVertical
      ? canvasH * (options?.hasLowerThird ? 0.25 : 0.225)
      : canvasH * 0.08
    const boxY = canvasH - boxH - safeBottomOffset
    const centerY = boxY + boxH / 2

    const energy = options?.lip?.energy ?? 0
    const popScale = 1 + Math.min(0.085, energy * 0.08)

    ctx.translate(canvasW / 2, centerY)
    ctx.scale(popScale, popScale)
    ctx.translate(-canvasW / 2, -centerY)

    if (!options?.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.42)"
      ctx.shadowBlur = 18
    }
    ctx.fillStyle = "rgba(15, 15, 18, 0.78)"
    ctx.beginPath()
    ctx.roundRect(canvasW * 0.06, boxY, canvasW * 0.88, boxH, fontSize * 0.55)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(250, 204, 21, 0.36)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(canvasW * 0.06, boxY, canvasW * 0.88, boxH, fontSize * 0.55)
    ctx.stroke()

    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineJoin = "round"
    ctx.lineWidth = Math.max(4, fontSize * 0.2)
    ctx.strokeStyle = "rgba(9, 9, 11, 0.96)"

    shown.forEach((l, i) => {
      const y = boxY + padY + lh * (i + 0.5)
      const isHighlight =
        shown.length === 1 ? energy > 0.22 : i % 2 === 1
      ctx.strokeText(l, canvasW / 2, y, maxW)
      ctx.fillStyle = isHighlight ? "#FACC15" : "#FFFFFF"
      ctx.fillText(l, canvasW / 2, y, maxW)
    })

    ctx.restore()
    return
  }

  const fontSize = Math.round(canvasW * 0.045)
  ctx.save()
  ctx.font = `600 ${fontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
  const maxW = canvasW * 0.86
  const lines = wrapCaptionLines(ctx, clean, maxW)
  const shown = lines.slice(-4)
  const lh = fontSize * 1.5
  const boxH = shown.length * lh + fontSize * 0.6
  const boxY = canvasH - boxH - canvasH * 0.06
  ctx.fillStyle = "rgba(24,24,27,0.72)"
  ctx.beginPath()
  ctx.roundRect(canvasW * 0.05, boxY, canvasW * 0.9, boxH, fontSize * 0.6)
  ctx.fill()
  ctx.fillStyle = "#FAF8F5"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  shown.forEach((l, i) => {
    ctx.fillText(l, canvasW / 2, boxY + fontSize * 0.3 + lh * (i + 0.5), maxW)
  })
  ctx.restore()
}

/**
 * Draws the top-right corner shop logo watermark at subtle 80% opacity.
 */
export function drawCornerLogoWatermark(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement | null,
  canvasW: number,
  options?: { lowPower?: boolean }
): void {
  if (!logoImg) return
  const size = Math.round(canvasW * 0.095)
  const margin = Math.round(canvasW * 0.036)
  const x = canvasW - margin - size
  const y = margin
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size / 2

  ctx.save()
  ctx.globalAlpha = 0.8
  if (!options?.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)"
    ctx.shadowBlur = 12
  }
  ctx.fillStyle = "rgba(250, 248, 245, 0.92)"
  ctx.beginPath()
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(logoImg, x, y, size, size)
  ctx.restore()
}

export interface BroadcastLowerThirdOptions {
  presenterName: string
  shopName: string
  logoImg: HTMLImageElement | null
  lip: LipSyncWeights
  elapsed: number
  captionsOn: boolean
  hasBottomVisualizer?: boolean
  lowPower?: boolean
}

/**
 * Draws a minimalist editorial Lower-Third Title/Shop Badge (Matte Charcoal & Crisp White)
 * with optional mini shop logo and crisp typographic hierarchy.
 */
export function drawBroadcastLowerThird(
  ctx: CanvasRenderingContext2D,
  options: BroadcastLowerThirdOptions,
  canvasW: number,
  canvasH: number
): void {
  const cleanPresenter = options.presenterName.trim()
  const cleanShop = options.shopName.trim()
  if (!cleanPresenter && !cleanShop) return

  const marginX = Math.round(canvasW * 0.048)
  const maxCardW = canvasW - marginX * 2
  const cardH = Math.round(canvasW * 0.098)
  const visualizerClearance = options.hasBottomVisualizer ? canvasH * 0.046 : 0
  const bottomOffset = options.captionsOn
    ? canvasH * 0.18 + visualizerClearance * 0.4
    : canvasH * 0.036 + visualizerClearance
  const cardX = marginX
  const cardY = Math.round(canvasH - cardH - bottomOffset)
  const radius = Math.round(cardH * 0.24)

  const titleFontSize = Math.max(12, Math.round(cardH * 0.31))
  const subFontSize = Math.max(10, Math.round(cardH * 0.22))

  ctx.save()

  // Measure content so the editorial badge hugs the text cleanly (capped to maxCardW)
  ctx.font = `700 ${titleFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
  const titleW = cleanPresenter ? ctx.measureText(cleanPresenter).width : 0
  ctx.font = `500 ${subFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
  const subW = cleanShop ? ctx.measureText(cleanShop).width : 0

  const thumbSize = options.logoImg ? Math.round(cardH * 0.64) : 0
  const leftChrome = 24 + (options.logoImg ? thumbSize + 12 : 0)
  const rightPad = 20
  const contentW = Math.max(titleW, subW)
  const cardW = Math.min(maxCardW, Math.max(canvasW * 0.44, Math.ceil(leftChrome + contentW + rightPad)))

  if (!options.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.26)"
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 6
  }
  // Matte Charcoal pill background
  ctx.fillStyle = "rgba(24, 24, 27, 0.90)"
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  // Crisp hairline border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.stroke()

  // Crisp White editorial left accent bar
  const accentW = Math.max(3, Math.round(cardH * 0.055))
  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.roundRect(cardX + 10, cardY + Math.round(cardH * 0.22), accentW, Math.round(cardH * 0.56), accentW / 2)
  ctx.fill()

  let textStartX = cardX + 22

  if (options.logoImg) {
    const thumbX = textStartX
    const thumbY = cardY + Math.round((cardH - thumbSize) / 2)
    ctx.save()
    ctx.fillStyle = "#FFFFFF"
    ctx.beginPath()
    ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2 + 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(options.logoImg, thumbX, thumbY, thumbSize, thumbSize)
    ctx.restore()
    textStartX = thumbX + thumbSize + 12
  }

  const maxTextW = Math.max(60, cardX + cardW - textStartX - rightPad + 4)

  if (cleanPresenter && cleanShop) {
    ctx.fillStyle = "#FFFFFF"
    ctx.font = `700 ${titleFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPresenter, textStartX, cardY + cardH * 0.36, maxTextW)

    ctx.fillStyle = "rgba(244, 244, 245, 0.78)"
    ctx.font = `500 ${subFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.fillText(cleanShop, textStartX, cardY + cardH * 0.69, maxTextW)
  } else {
    const single = cleanPresenter || cleanShop
    ctx.fillStyle = "#FFFFFF"
    ctx.font = `700 ${titleFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(single, textStartX, cardY + cardH * 0.5, maxTextW)
  }

  ctx.restore()
}

export type PipCorner = "top_left" | "top_right" | "bottom_left" | "bottom_right"

export interface PipPhoneOverlayOptions {
  phoneImg: HTMLImageElement | null
  priceText: string
  promoTag: string
  corner: PipCorner
  lip: LipSyncWeights
  elapsed: number
  hasCornerLogo?: boolean
  hasLowerThird?: boolean
  captionsOn?: boolean
  lowPower?: boolean
}

/**
 * Draws a Picture-in-Picture (PiP) featured phone showcase card with optional
 * Promo/Installment Trust Badge and Price Pill in the chosen corner.
 */
export function drawPipPhoneOverlay(
  ctx: CanvasRenderingContext2D,
  options: PipPhoneOverlayOptions,
  canvasW: number,
  canvasH: number
): void {
  const cleanPrice = options.priceText.trim()
  const cleanPromo = options.promoTag.trim()
  if (!options.phoneImg && !cleanPrice && !cleanPromo) return

  const isVertical = canvasH > canvasW
  const cardW = Math.round(canvasW * (isVertical ? 0.31 : 0.25))
  const cardH = Math.round(cardW * (options.phoneImg ? 1.24 : 0.56))
  const marginX = Math.round(canvasW * 0.042)

  const topSafeY = isVertical ? Math.round(canvasH * 0.125) : Math.round(canvasH * 0.045)
  const logoClearanceY =
    options.corner === "top_right" && options.hasCornerLogo
      ? Math.max(topSafeY, Math.round(canvasW * 0.155))
      : topSafeY

  let bottomClearance = isVertical ? Math.round(canvasH * 0.23) : Math.round(canvasH * 0.05)
  if (options.captionsOn) {
    bottomClearance = Math.max(bottomClearance, Math.round(canvasH * (isVertical ? 0.32 : 0.2)))
  }
  if (options.hasLowerThird) {
    bottomClearance += Math.round(canvasW * 0.115)
  }

  const floatY = Math.sin(options.elapsed * 2.2) * 3.5
  const vocalPop = 1 + Math.min(0.035, options.lip.energy * 0.03)

  const x =
    options.corner === "top_left" || options.corner === "bottom_left"
      ? marginX
      : canvasW - marginX - cardW

  const y =
    options.corner === "top_left" || options.corner === "top_right"
      ? logoClearanceY + floatY
      : canvasH - bottomClearance - cardH + floatY

  const cx = x + cardW / 2
  const cy = y + cardH / 2
  const radius = Math.round(cardW * 0.11)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(vocalPop, vocalPop)
  ctx.translate(-cx, -cy)

  if (!options.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.36)"
    ctx.shadowBlur = 20
    ctx.shadowOffsetY = 8
  }
  ctx.fillStyle = "rgba(20, 20, 24, 0.80)"
  ctx.beginPath()
  ctx.roundRect(x, y, cardW, cardH, radius)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = "rgba(255, 255, 255, 0.20)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x, y, cardW, cardH, radius)
  ctx.stroke()

  if (options.phoneImg) {
    const imgPadX = cardW * 0.1
    const imgTop = cleanPromo ? cardH * 0.16 : cardH * 0.08
    const imgBottom = cleanPrice ? cardH * 0.2 : cardH * 0.08
    const availW = cardW - imgPadX * 2
    const availH = Math.max(24, cardH - imgTop - imgBottom)
    const scale = Math.min(availW / options.phoneImg.width, availH / options.phoneImg.height)
    const drawW = options.phoneImg.width * scale
    const drawH = options.phoneImg.height * scale
    const drawX = x + (cardW - drawW) / 2
    const drawY = y + imgTop + (availH - drawH) / 2

    ctx.save()
    if (!options.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)"
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 4
    }
    ctx.drawImage(options.phoneImg, drawX, drawY, drawW, drawH)
    ctx.restore()
  }

  if (cleanPromo) {
    const promoFontSize = Math.max(11, Math.round(cardW * 0.072))
    ctx.font = `700 ${promoFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const pillH = Math.round(promoFontSize * 1.65)
    const textW = ctx.measureText(cleanPromo).width
    const pillW = Math.min(cardW * 0.94, Math.max(cardW * 0.56, textW + promoFontSize * 1.3))
    const pillX = x + (cardW - pillW) / 2
    const pillY = y - pillH * 0.35

    ctx.fillStyle = "#10B981"
    ctx.beginPath()
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPromo, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 10)
  }

  if (cleanPrice) {
    const priceFontSize = Math.max(12, Math.round(cardW * 0.084))
    ctx.font = `800 ${priceFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const pillH = Math.round(priceFontSize * 1.72)
    const textW = ctx.measureText(cleanPrice).width
    const pillW = Math.min(cardW * 0.96, Math.max(cardW * 0.68, textW + priceFontSize * 1.4))
    const pillX = x + (cardW - pillW) / 2
    const pillY = y + cardH - pillH * 0.72

    if (!options.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.32)"
      ctx.shadowBlur = 10
    }
    ctx.fillStyle = "#FACC15"
    ctx.beginPath()
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = "#18181B"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPrice, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 12)
  }

  ctx.restore()
}
