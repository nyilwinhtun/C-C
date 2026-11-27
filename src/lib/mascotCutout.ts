export type ForegroundCutoutMode = "instant" | "smart"

export interface ExtractForegroundCutoutOptions {
  /** Cutout method: fast canvas color-key ("instant") or WASM ML ("smart") */
  mode?: ForegroundCutoutMode
  /** Maximum width/height before running cutout (default: 512 on mobile, 640 on desktop) */
  maxDimension?: number
  /** Timeout in ms for Smart Cutout before falling back to Instant Cutout (default: 12000) */
  timeoutMs?: number
  /** Color distance threshold for Instant Cutout flood-fill (default: 42) */
  tolerance?: number
  /** Optional abort signal */
  signal?: AbortSignal
  /** Stage progress callback */
  onProgress?: (progress: { stage: "cutting_out" | "building_foreground"; percent: number }) => void
}

export interface ExtractForegroundCutoutResult {
  blob: Blob
  dataUrl: string
  width: number
  height: number
  skippedBgRemoval: boolean
  usedFallback: boolean
  modeUsed: ForegroundCutoutMode | "passthrough"
}

const DEFAULT_SMART_CUTOUT_TIMEOUT_MS = 12_000
const MOBILE_MAX_CUTOUT_SIZE = 512
const DESKTOP_MAX_CUTOUT_SIZE = 640

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true
  }
  if (window.innerWidth < 768) return true
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    return true
  }
  return false
}

function disposeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    let objectUrl: string | null = null

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not decode image for cutout."))
    }

    if (typeof source === "string") {
      img.src = source
    } else {
      objectUrl = URL.createObjectURL(source)
      img.src = objectUrl
    }
  })
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas PNG encoding failed."))
      },
      "image/png",
      0.95
    )
  })
}

function encodeCanvasDataUrl(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", 0.88)
  if (webp.startsWith("data:image/webp")) return webp
  return canvas.toDataURL("image/png")
}

/**
 * Samples an image's alpha channel to detect whether it already contains
 * transparent pixels (e.g., an exported PNG cutout from Photo Studio).
 * Disposes temporary canvas immediately.
 */
export async function hasTransparentPixels(
  source: File | Blob | string | HTMLImageElement | HTMLCanvasElement
): Promise<boolean> {
  if (source instanceof Blob && source.type === "image/jpeg") {
    return false
  }
  if (typeof source === "string" && source.startsWith("data:image/jpeg")) {
    return false
  }

  let img: HTMLImageElement | HTMLCanvasElement
  if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
    img = source
  } else {
    img = await loadImageElement(source)
  }

  const probeCanvas = document.createElement("canvas")
  try {
    const srcW = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth || img.width
    const srcH = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight || img.height
    if (srcW <= 0 || srcH <= 0) return false

    const maxSample = 192
    const scale = Math.min(1, maxSample / Math.max(srcW, srcH, 1))
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    probeCanvas.width = w
    probeCanvas.height = h

    const ctx = probeCanvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, w, h)

    const { data } = ctx.getImageData(0, 0, w, h)
    const totalPixels = w * h
    const thresholdCount = Math.max(10, Math.floor(totalPixels * 0.005))
    let transparentCount = 0

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 240) {
        transparentCount++
        if (transparentCount >= thresholdCount) {
          return true
        }
      }
    }
    return false
  } finally {
    disposeCanvas(probeCanvas)
  }
}

/**
 * Downscales an image source to `maxDimension` and returns a PNG Blob + dimensions.
 * Always disposes temporary canvases.
 */
async function downscaleImageSource(
  source: File | Blob | string,
  maxDimension: number
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const img = await loadImageElement(source)
  const canvas = document.createElement("canvas")
  try {
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context unavailable.")
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await canvasToPngBlob(canvas)
    const dataUrl = encodeCanvasDataUrl(canvas)
    return { blob, dataUrl, width: w, height: h }
  } finally {
    disposeCanvas(canvas)
  }
}

/**
 * Fast corner-sampled flood-fill / edge-tolerant background removal on HTML5 Canvas.
 * Runs in < 0.2s on mobile phones with zero WASM/ML downloads — ideal for clean
 * product photos, mascots, logos, and studio backdrops.
 */
export async function instantColorKeyCutout(
  source: File | Blob | string,
  options: {
    maxDimension?: number
    tolerance?: number
    signal?: AbortSignal
  } = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const {
    maxDimension = isMobileViewport() ? MOBILE_MAX_CUTOUT_SIZE : DESKTOP_MAX_CUTOUT_SIZE,
    tolerance = 42,
    signal,
  } = options

  if (signal?.aborted) {
    throw new DOMException("Cutout aborted", "AbortError")
  }

  const img = await loadImageElement(source)
  if (signal?.aborted) {
    throw new DOMException("Cutout aborted", "AbortError")
  }

  const canvas = document.createElement("canvas")
  try {
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("2D canvas context unavailable.")
    ctx.drawImage(img, 0, 0, w, h)

    const imgData = ctx.getImageData(0, 0, w, h)
    const { data } = imgData
    const pixelCount = w * h

    // Sample average RGB of 3×3 patches at the 4 corners as background reference colors
    const sampleCorner = (cx: number, cy: number): [number, number, number] => {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const y = Math.max(0, Math.min(h - 1, cy + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.max(0, Math.min(w - 1, cx + dx))
          const p = (y * w + x) * 4
          if (data[p + 3] > 20) {
            r += data[p]
            g += data[p + 1]
            b += data[p + 2]
            count++
          }
        }
      }
      if (count === 0) return [255, 255, 255]
      return [r / count, g / count, b / count]
    }

    const corners: [number, number, number][] = [
      sampleCorner(1, 1),
      sampleCorner(w - 2, 1),
      sampleCorner(1, h - 2),
      sampleCorner(w - 2, h - 2),
    ]

    const tolSq = tolerance * tolerance
    const softTolSq = (tolerance * 1.45) * (tolerance * 1.45)
    const edgeStepSq = 28 * 28

    const minCornerDistSq = (r: number, g: number, b: number): number => {
      let best = Infinity
      for (let i = 0; i < 4; i++) {
        const dr = r - corners[i][0]
        const dg = g - corners[i][1]
        const db = b - corners[i][2]
        const d = dr * dr + dg * dg + db * db
        if (d < best) best = d
      }
      return best
    }

    // 0 = unvisited, 1 = background, 2 = boundary/subject
    const mask = new Uint8Array(pixelCount)
    const queue = new Int32Array(pixelCount)
    let head = 0
    let tail = 0

    const trySeed = (idx: number) => {
      if (mask[idx] !== 0) return
      const p = idx * 4
      if (data[p + 3] <= 20 || minCornerDistSq(data[p], data[p + 1], data[p + 2]) <= tolSq) {
        mask[idx] = 1
        queue[tail++] = idx
      }
    }

    // Seed flood-fill from all 4 outer borders
    for (let x = 0; x < w; x++) {
      trySeed(x)
      trySeed((h - 1) * w + x)
    }
    for (let y = 1; y < h - 1; y++) {
      trySeed(y * w)
      trySeed(y * w + (w - 1))
    }

    // Fast 4-connected BFS with edge-tolerant gradient check
    while (head < tail) {
      const idx = queue[head++]
      const x = idx % w
      const y = (idx - x) / w
      const p = idx * 4
      const cr = data[p]
      const cg = data[p + 1]
      const cb = data[p + 2]

      const checkNeighbor = (nIdx: number) => {
        if (mask[nIdx] !== 0) return
        const np = nIdx * 4
        const nr = data[np]
        const ng = data[np + 1]
        const nb = data[np + 2]
        const na = data[np + 3]

        if (na <= 20) {
          mask[nIdx] = 1
          queue[tail++] = nIdx
          return
        }

        const cDistSq = minCornerDistSq(nr, ng, nb)
        if (cDistSq <= tolSq) {
          mask[nIdx] = 1
          queue[tail++] = nIdx
          return
        }

        if (cDistSq <= softTolSq) {
          const dr = nr - cr
          const dg = ng - cg
          const db = nb - cb
          if (dr * dr + dg * dg + db * db <= edgeStepSq) {
            mask[nIdx] = 1
            queue[tail++] = nIdx
            return
          }
        }

        mask[nIdx] = 2
      }

      if (x > 0) checkNeighbor(idx - 1)
      if (x < w - 1) checkNeighbor(idx + 1)
      if (y > 0) checkNeighbor(idx - w)
      if (y < h - 1) checkNeighbor(idx + w)
    }

    // Apply alpha removal + gentle 1px edge feather on boundary pixels
    const softSpan = Math.max(1, softTolSq - tolSq)
    for (let i = 0; i < pixelCount; i++) {
      const m = mask[i]
      if (m === 1) {
        data[i * 4 + 3] = 0
      } else if (m === 2) {
        const p = i * 4
        const dSq = minCornerDistSq(data[p], data[p + 1], data[p + 2])
        if (dSq < softTolSq) {
          const ratio = Math.max(0, Math.min(1, (dSq - tolSq) / softSpan))
          data[p + 3] = Math.round(data[p + 3] * (0.25 + 0.75 * ratio))
        }
      }
    }

    ctx.putImageData(imgData, 0, 0)
    const blob = await canvasToPngBlob(canvas)
    const dataUrl = encodeCanvasDataUrl(canvas)
    return { blob, dataUrl, width: w, height: h }
  } finally {
    disposeCanvas(canvas)
  }
}

/**
 * Unified 2D Mascot Cutout pipeline:
 * 1. Samples alpha channel first — if the image already has transparent pixels
 *    (e.g., an exported PNG cutout from Photo Studio), skips background removal completely.
 * 2. Downscales input to `maxDimension` (512px on mobile) before processing.
 * 3. Supports `"instant"` (Canvas flood-fill, <0.5s) and `"smart"` (WASM with
 *    a strict 12s timeout that falls back cleanly to `"instant"`).
 */
export async function extractForegroundCutout(
  source: File | Blob | string,
  options: ExtractForegroundCutoutOptions = {}
): Promise<ExtractForegroundCutoutResult> {
  const {
    mode = isMobileViewport() ? "instant" : "smart",
    maxDimension = isMobileViewport() ? MOBILE_MAX_CUTOUT_SIZE : DESKTOP_MAX_CUTOUT_SIZE,
    timeoutMs = DEFAULT_SMART_CUTOUT_TIMEOUT_MS,
    tolerance = 42,
    signal,
    onProgress,
  } = options

  if (signal?.aborted) {
    throw new DOMException("Cutout aborted", "AbortError")
  }

  // 1. Skip redundant background removal if the image already has transparent pixels
  const alreadyTransparent = await hasTransparentPixels(source)
  if (signal?.aborted) {
    throw new DOMException("Cutout aborted", "AbortError")
  }

  if (alreadyTransparent) {
    onProgress?.({ stage: "building_foreground", percent: 55 })
    const resized = await downscaleImageSource(source, maxDimension)
    return {
      ...resized,
      skippedBgRemoval: true,
      usedFallback: false,
      modeUsed: "passthrough",
    }
  }

  // 2. Instant Cutout (No Model) — fast HTML5 Canvas corner-sampled flood-fill
  onProgress?.({ stage: "cutting_out", percent: 20 })
  if (mode === "instant") {
    const cutout = await instantColorKeyCutout(source, {
      maxDimension,
      tolerance,
      signal,
    })
    onProgress?.({ stage: "building_foreground", percent: 65 })
    return {
      ...cutout,
      skippedBgRemoval: false,
      usedFallback: false,
      modeUsed: "instant",
    }
  }

  // 3. Smart Cutout — pre-downscale to maxDimension (512px on mobile) + 12s timeout fallback
  const downscaled = await downscaleImageSource(source, maxDimension)
  if (signal?.aborted) {
    throw new DOMException("Cutout aborted", "AbortError")
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Smart cutout timed out"))
    }, timeoutMs)
  })

  try {
    const runSmartCutout = async (): Promise<Blob> => {
      const { removeBackground } = await import("@imgly/background-removal")
      return removeBackground(downscaled.blob)
    }

    const smartPromise = runSmartCutout()
    smartPromise.catch(() => {})

    const cutoutBlob = await Promise.race([smartPromise, timeoutPromise])
    if (signal?.aborted) {
      throw new DOMException("Cutout aborted", "AbortError")
    }

    onProgress?.({ stage: "building_foreground", percent: 65 })
    const finalCutout = await downscaleImageSource(cutoutBlob, maxDimension)
    return {
      ...finalCutout,
      skippedBgRemoval: false,
      usedFallback: false,
      modeUsed: "smart",
    }
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException("Cutout aborted", "AbortError")
    }
    console.warn("Smart cutout failed or timed out; falling back to Instant Cutout:", err)
    const fallbackCutout = await instantColorKeyCutout(downscaled.blob, {
      maxDimension,
      tolerance,
      signal,
    })
    onProgress?.({ stage: "building_foreground", percent: 65 })
    return {
      ...fallbackCutout,
      skippedBgRemoval: false,
      usedFallback: true,
      modeUsed: "instant",
    }
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}
