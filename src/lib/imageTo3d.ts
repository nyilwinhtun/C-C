import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"

export type ImageTo3dStage =
  | "preparing"
  | "generating_cloud"
  | "generating_fast_25d"
  | "generating_local"
  | "fallback_fast"
  | "ready"

export type ImageTo3dMode = "fast_25d" | "full_3d"

export type ImageTo3dEngine = "triposr" | "instantmesh" | "fast_25d" | "local_relief"

export type ImageTo3dFallbackReason = "timeout" | "error"

export interface ImageTo3dProgress {
  stage: ImageTo3dStage
  percent: number
  message?: string
}

export interface ConvertImageTo3dOptions {
  /** Conversion mode: instant mobile-first 2.5D relief or full cloud 3D mesh (default: "full_3d") */
  mode?: ImageTo3dMode
  /** Timeout in milliseconds before full 3D automatically falls back to Fast 2.5D Relief (default: 12000) */
  timeoutMs?: number
  /** Optional Hugging Face API token (`hf_...`) for higher ZeroGPU quota/priority */
  hfToken?: string
  /** Whether to run @imgly/background-removal before full 3D conversion (default: true) */
  removeBg?: boolean
  /** Relief depth scale for 2.5D / local GLTFExporter meshes (default: 0.22) */
  reliefDepth?: number
  /** Optional abort signal */
  signal?: AbortSignal
  /** Progress callback */
  onProgress?: (progress: ImageTo3dProgress) => void
}

export interface ConvertImageTo3dResult {
  blob: Blob
  file: File
  fileName: string
  engine: ImageTo3dEngine
  usedFallback: boolean
  fallbackReason?: ImageTo3dFallbackReason
  previewCutoutDataUrl: string
}

export interface Fast25dReliefOptions {
  /** Relief extrusion amplitude (default: 0.22) */
  reliefDepth?: number
  /** Optional abort signal */
  signal?: AbortSignal
  /** Progress callback */
  onProgress?: (progress: ImageTo3dProgress) => void
}

const DEFAULT_FULL_3D_TIMEOUT_MS = 12_000
const FAST_25D_DEPTH_SIZE = 256
const FAST_25D_TEXTURE_SIZE = 512

function disposeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

interface PreparedSubject {
  squarePngBlob: Blob
  cutoutCanvas: HTMLCanvasElement
  previewCutoutDataUrl: string
}

const HF_SPACES = [
  {
    id: "triposr" as const,
    baseUrl: "https://stabilityai-triposr.hf.space",
    endpoint: "run",
    buildArgs: (fileData: Record<string, unknown>) => [fileData, false, 0.85, 256],
  },
  {
    id: "instantmesh" as const,
    baseUrl: "https://tencentarc-instantmesh.hf.space",
    endpoint: "generate_mvs",
    buildArgs: (fileData: Record<string, unknown>) => [fileData, 75, 42],
  },
] as const

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
      reject(new Error("Could not decode image for 3D conversion."))
    }

    if (typeof source === "string") {
      img.src = source
    } else {
      objectUrl = URL.createObjectURL(source)
      img.src = objectUrl
    }
  })
}

async function sourceToBlob(source: File | Blob | string): Promise<Blob> {
  if (source instanceof Blob) return source
  const res = await fetch(source)
  if (!res.ok) throw new Error("Failed to read source image.")
  return res.blob()
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

/**
 * Finds the tight bounding box of non-transparent pixels in a canvas.
 */
function findOpaqueBounds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]
      if (alpha > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Isolates foreground subject (via @imgly/background-removal) and square-pads
 * onto a clean 512x512 canvas for both cloud Image-to-3D and local relief fallback.
 */
async function prepareImageFor3d(
  source: File | Blob | string,
  removeBg: boolean,
  signal?: AbortSignal
): Promise<PreparedSubject> {
  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }
  let workingBlob = await sourceToBlob(source)

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  if (removeBg) {
    try {
      const { removeBackground } = await import("@imgly/background-removal")
      workingBlob = await removeBackground(workingBlob)
    } catch (err) {
      console.warn("Background removal skipped; using original image:", err)
    }
  }

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  const img = await loadImageElement(workingBlob)
  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }
  const rawCanvas = document.createElement("canvas")
  const paddedCanvas = document.createElement("canvas")
  const cutoutCanvas = document.createElement("canvas")

  try {
    const maxInput = 768
    const rawScale = Math.min(1, maxInput / Math.max(img.width, img.height, 1))
    rawCanvas.width = Math.max(1, Math.round(img.width * rawScale))
    rawCanvas.height = Math.max(1, Math.round(img.height * rawScale))

    const rawCtx = rawCanvas.getContext("2d")
    if (!rawCtx) throw new Error("2D canvas context unavailable.")
    rawCtx.drawImage(img, 0, 0, rawCanvas.width, rawCanvas.height)

    const bounds = findOpaqueBounds(rawCtx, rawCanvas.width, rawCanvas.height)
    const cropW = Math.max(1, bounds.maxX - bounds.minX + 1)
    const cropH = Math.max(1, bounds.maxY - bounds.minY + 1)

    const targetSize = 512
    const paddingRatio = 0.82
    const fitScale = Math.min(
      (targetSize * paddingRatio) / cropW,
      (targetSize * paddingRatio) / cropH
    )
    const drawW = Math.round(cropW * fitScale)
    const drawH = Math.round(cropH * fitScale)
    const drawX = Math.round((targetSize - drawW) / 2)
    const drawY = Math.round((targetSize - drawH) / 2)

    // Transparent square cutout canvas (for preview + local 3D relief texture)
    cutoutCanvas.width = targetSize
    cutoutCanvas.height = targetSize
    const cutoutCtx = cutoutCanvas.getContext("2d")
    if (!cutoutCtx) throw new Error("2D canvas context unavailable.")
    cutoutCtx.drawImage(
      rawCanvas,
      bounds.minX,
      bounds.minY,
      cropW,
      cropH,
      drawX,
      drawY,
      drawW,
      drawH
    )

    // White-backed square PNG for Hugging Face TripoSR / InstantMesh
    paddedCanvas.width = targetSize
    paddedCanvas.height = targetSize
    const paddedCtx = paddedCanvas.getContext("2d")
    if (!paddedCtx) throw new Error("2D canvas context unavailable.")
    paddedCtx.fillStyle = "#ffffff"
    paddedCtx.fillRect(0, 0, targetSize, targetSize)
    paddedCtx.drawImage(cutoutCanvas, 0, 0)

    const squarePngBlob = await canvasToPngBlob(paddedCanvas)
    const previewCutoutDataUrl = cutoutCanvas.toDataURL("image/png")

    return {
      squarePngBlob,
      cutoutCanvas,
      previewCutoutDataUrl,
    }
  } catch (err) {
    disposeCanvas(cutoutCanvas)
    throw err
  } finally {
    disposeCanvas(rawCanvas)
    disposeCanvas(paddedCanvas)
  }
}

function buildAuthHeaders(hfToken?: string): Record<string, string> {
  const clean = hfToken?.trim()
  return clean ? { Authorization: `Bearer ${clean}` } : {}
}

/**
 * Extracts the first .glb (or .obj) file reference from a Gradio SSE output payload.
 */
function extractGradioModelUrl(payload: unknown, baseUrl: string): string | null {
  if (!payload) return null

  const scan = (node: unknown): string | null => {
    if (!node) return null
    if (typeof node === "string") {
      if (/\.(glb|gltf)(\?|$)/i.test(node)) {
        if (node.startsWith("http")) return node
        return `${baseUrl}/gradio_api/file=${node.replace(/^\/+/, "")}`
      }
      return null
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = scan(item)
        if (found) return found
      }
      return null
    }
    if (typeof node === "object") {
      const rec = node as Record<string, unknown>
      if (typeof rec.url === "string" && /\.(glb|gltf)(\?|$)/i.test(rec.url)) {
        return rec.url
      }
      if (typeof rec.path === "string" && /\.(glb|gltf)(\?|$)/i.test(rec.path)) {
        return `${baseUrl}/gradio_api/file=${rec.path}`
      }
      for (const val of Object.values(rec)) {
        const found = scan(val)
        if (found) return found
      }
    }
    return null
  }

  return scan(payload)
}

/**
 * Polls a Gradio 4/5 SSE stream (`GET /gradio_api/call/<endpoint>/<event_id>`)
 * until `event: complete` or `event: error`.
 */
async function readGradioSseResult(
  sseUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<unknown> {
  const res = await fetch(sseUrl, { headers, signal })
  if (!res.ok || !res.body) {
    throw new Error(`Gradio SSE failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        const rawData = line.slice(5).trim()
        if (currentEvent === "error") {
          throw new Error(`Space error: ${rawData}`)
        }
        if (currentEvent === "complete") {
          try {
            return JSON.parse(rawData)
          } catch {
            return rawData
          }
        }
      }
    }
  }

  throw new Error("Gradio SSE stream ended before completion.")
}

async function tryHuggingFaceSpace(
  space: (typeof HF_SPACES)[number],
  pngBlob: Blob,
  hfToken?: string,
  outerSignal?: AbortSignal
): Promise<Blob> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)

  const onOuterAbort = () => controller.abort()
  outerSignal?.addEventListener("abort", onOuterAbort, { once: true })

  try {
    const headers = buildAuthHeaders(hfToken)

    // 1. Upload square-padded PNG to Gradio Space
    const formData = new FormData()
    formData.append("files", pngBlob, "subject.png")

    const uploadRes = await fetch(`${space.baseUrl}/gradio_api/upload`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    })

    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status})`)
    }

    const uploadedPaths = (await uploadRes.json()) as string[]
    const uploadedPath = uploadedPaths?.[0]
    if (!uploadedPath) {
      throw new Error("No file path returned from Gradio upload.")
    }

    const fileData = {
      path: uploadedPath,
      meta: { _type: "gradio.FileData" },
    }

    // 2. Enqueue ZeroGPU prediction
    const callRes = await fetch(`${space.baseUrl}/gradio_api/call/${space.endpoint}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: space.buildArgs(fileData) }),
      signal: controller.signal,
    })

    if (!callRes.ok) {
      throw new Error(`Call enqueue failed (${callRes.status})`)
    }

    const { event_id: eventId } = (await callRes.json()) as { event_id?: string }
    if (!eventId) {
      throw new Error("Missing event_id from Gradio call.")
    }

    // 3. Stream SSE result
    const output = await readGradioSseResult(
      `${space.baseUrl}/gradio_api/call/${space.endpoint}/${eventId}`,
      headers,
      controller.signal
    )

    const modelUrl = extractGradioModelUrl(output, space.baseUrl)
    if (!modelUrl) {
      throw new Error("No .glb model URL returned by Space.")
    }

    // 4. Download generated .glb
    const glbRes = await fetch(modelUrl, { headers, signal: controller.signal })
    if (!glbRes.ok) {
      throw new Error(`Failed to download .glb (${glbRes.status})`)
    }

    const glbBlob = await glbRes.blob()
    if (glbBlob.size < 128) {
      throw new Error("Downloaded .glb is unexpectedly empty.")
    }

    return new Blob([glbBlob], { type: "model/gltf-binary" })
  } finally {
    clearTimeout(timeoutId)
    outerSignal?.removeEventListener("abort", onOuterAbort)
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return shape
}

function createRoundedRectPath(width: number, height: number, radius: number): THREE.Path {
  const path = new THREE.Path()
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)

  path.moveTo(-hw + r, -hh)
  path.lineTo(hw - r, -hh)
  path.quadraticCurveTo(hw, -hh, hw, -hh + r)
  path.lineTo(hw, hh - r)
  path.quadraticCurveTo(hw, hh, hw - r, hh)
  path.lineTo(-hw + r, hh)
  path.quadraticCurveTo(-hw, hh, -hw, hh - r)
  path.lineTo(-hw, -hh + r)
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return path
}

function flipPlaneUvForGltf(geom: THREE.PlaneGeometry): void {
  const uv = geom.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, 1 - uv.getY(i))
  }
  uv.needsUpdate = true
}

function createShowcaseFrontCanvas(cutoutCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = 640
  const h = 768
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable.")

  // Sleek studio card background with subtle radial highlight
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.38, w * 0.08, w * 0.5, h * 0.5, h * 0.72)
  bg.addColorStop(0, "#FAF8F5")
  bg.addColorStop(1, "#E7E0D5")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Subtle studio floor shadow under the subject
  ctx.save()
  ctx.fillStyle = "rgba(28, 25, 23, 0.10)"
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.84, w * 0.28, h * 0.032, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Draw crisp, un-warped subject cutout centered inside card
  const pad = 0.84
  const scale = Math.min((w * pad) / cutoutCanvas.width, (h * pad) / cutoutCanvas.height)
  const drawW = cutoutCanvas.width * scale
  const drawH = cutoutCanvas.height * scale
  const drawX = (w - drawW) / 2
  const drawY = (h - drawH) / 2

  ctx.save()
  ctx.shadowColor = "rgba(28, 25, 23, 0.22)"
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 12
  ctx.drawImage(cutoutCanvas, drawX, drawY, drawW, drawH)
  ctx.restore()

  // Subtle inner metallic-tint hairline
  ctx.strokeStyle = "rgba(212, 175, 55, 0.35)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(14, 14, w - 28, h - 28, 42)
  ctx.stroke()

  return canvas
}

function createShowcaseBackCanvas(): HTMLCanvasElement {
  const w = 640
  const h = 768
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable.")

  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, "#232120")
  bg.addColorStop(1, "#121110")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Gold accent border
  ctx.strokeStyle = "rgba(245, 158, 11, 0.55)"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(24, 24, w - 48, h - 48, 38)
  ctx.stroke()

  // Center studio emblem
  const cx = w / 2
  const cy = h * 0.44
  ctx.strokeStyle = "rgba(250, 204, 21, 0.85)"
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, 66, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = "#FACC15"
  ctx.font = '700 34px "Inter", system-ui, sans-serif'
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("3D", cx, cy)

  ctx.fillStyle = "#FAF8F5"
  ctx.font = '700 32px "Inter", system-ui, sans-serif'
  ctx.fillText("THE BOYS MOBILE", cx, h * 0.62)

  ctx.fillStyle = "rgba(250, 248, 245, 0.62)"
  ctx.font = '600 18px "Inter", system-ui, sans-serif'
  ctx.fillText("3D STUDIO SHOWCASE", cx, h * 0.68)

  return canvas
}

/**
 * Generates a sleek, non-distorted 3D Studio Showcase Card `.glb` model locally
 * in the browser using THREE.GLTFExporter: an extruded rounded-rectangle acrylic/glass
 * slab with metallic rim bevel, crisp un-warped front texture, and branded back face.
 * Guarantees 0-cost offline conversion even if cloud ZeroGPU Spaces are busy.
 */
export async function createLocalReliefGlb(
  cutoutCanvas: HTMLCanvasElement,
  reliefDepth = 0.22
): Promise<Blob> {
  const cardW = 0.94
  const cardH = 1.12
  const cornerR = 0.085
  const slabDepth = Math.max(0.036, Math.min(0.11, reliefDepth * 0.25))
  const bevelThickness = 0.012
  const bevelSize = 0.012

  // 1. Acrylic/glass core slab
  const slabShape = createRoundedRectShape(cardW, cardH, cornerR)
  const slabGeom = new THREE.ExtrudeGeometry(slabShape, {
    depth: slabDepth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 4,
    curveSegments: 20,
  })
  slabGeom.translate(0, 0, -slabDepth / 2)

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b18,
    roughness: 0.16,
    metalness: 0.2,
  })
  const slabMesh = new THREE.Mesh(slabGeom, slabMat)
  slabMesh.name = "ShowcaseAcrylicSlab"

  // 2. Subtle metallic rim bevel frame
  const rimPad = 0.022
  const rimOuter = createRoundedRectShape(cardW + rimPad, cardH + rimPad, cornerR + 0.01)
  rimOuter.holes.push(createRoundedRectPath(cardW - 0.015, cardH - 0.015, Math.max(0.02, cornerR - 0.008)))
  const rimGeom = new THREE.ExtrudeGeometry(rimOuter, {
    depth: slabDepth + bevelThickness * 1.4,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 3,
    curveSegments: 20,
  })
  rimGeom.translate(0, 0, -(slabDepth + bevelThickness * 1.4) / 2)

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.24,
    metalness: 0.86,
  })
  const rimMesh = new THREE.Mesh(rimGeom, rimMat)
  rimMesh.name = "ShowcaseMetallicRim"

  // 3. Un-warped crisp front cutout face (+Z)
  const faceW = cardW - 0.035
  const faceH = cardH - 0.035
  const faceZ = slabDepth / 2 + bevelThickness + 0.002

  const frontCanvas = createShowcaseFrontCanvas(cutoutCanvas)
  const frontTex = new THREE.CanvasTexture(frontCanvas)
  frontTex.colorSpace = THREE.SRGBColorSpace
  frontTex.flipY = false
  frontTex.needsUpdate = true

  const frontGeom = new THREE.PlaneGeometry(faceW, faceH)
  flipPlaneUvForGltf(frontGeom)
  const frontMat = new THREE.MeshStandardMaterial({
    map: frontTex,
    roughness: 0.35,
    metalness: 0.05,
  })
  const frontMesh = new THREE.Mesh(frontGeom, frontMat)
  frontMesh.name = "ShowcaseFrontFace"
  frontMesh.position.z = faceZ

  // 4. Branded back face (-Z)
  const backCanvas = createShowcaseBackCanvas()
  const backTex = new THREE.CanvasTexture(backCanvas)
  backTex.colorSpace = THREE.SRGBColorSpace
  backTex.flipY = false
  backTex.needsUpdate = true

  const backGeom = new THREE.PlaneGeometry(faceW, faceH)
  flipPlaneUvForGltf(backGeom)
  const backMat = new THREE.MeshStandardMaterial({
    map: backTex,
    roughness: 0.32,
    metalness: 0.14,
  })
  const backMesh = new THREE.Mesh(backGeom, backMat)
  backMesh.name = "ShowcaseBackFace"
  backMesh.rotation.y = Math.PI
  backMesh.position.z = -faceZ

  const group = new THREE.Group()
  group.name = "StudioShowcaseCard3D"
  group.add(slabMesh, rimMesh, frontMesh, backMesh)

  const exporter = new GLTFExporter()
  try {
    const glbBuffer = await exporter.parseAsync(group, { binary: true })
    if (glbBuffer instanceof ArrayBuffer) {
      return new Blob([glbBuffer], { type: "model/gltf-binary" })
    }
    throw new Error("Expected binary ArrayBuffer from GLTFExporter.")
  } finally {
    slabGeom.dispose()
    slabMat.dispose()
    rimGeom.dispose()
    rimMat.dispose()
    frontGeom.dispose()
    frontTex.dispose()
    frontMat.dispose()
    backGeom.dispose()
    backTex.dispose()
    backMat.dispose()
    disposeCanvas(frontCanvas)
    disposeCanvas(backCanvas)
  }
}

/**
 * Computes a normalized 256×256 luminance heightmap with alpha modulation
 * and smooth perimeter tapering so the displaced 2.5D relief sits seamlessly
 * on the backing slab without jagged edges.
 */
function buildLuminanceDepthMap(
  imageData: ImageData,
  size: number
): Float32Array {
  const { data } = imageData
  const depth = new Float32Array(size * size)
  const invSize = 1 / Math.max(1, size - 1)

  for (let y = 0; y < size; y++) {
    const ny = y * invSize
    const dy = (ny - 0.5) * 2
    const edgeY = Math.min(ny, 1 - ny)

    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const p = idx * 4
      const alpha = data[p + 3] / 255
      if (alpha <= 0.02) {
        depth[idx] = 0
        continue
      }

      const luma = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255
      const nx = x * invSize
      const dx = (nx - 0.5) * 2
      const radial = Math.max(0, 1 - (dx * dx + dy * dy) * 0.55)

      // Smooth border taper over outer 8% so mesh perimeter stays flush with slab
      const edgeX = Math.min(nx, 1 - nx)
      const border = Math.min(1, Math.min(edgeX, edgeY) / 0.08)
      const smoothBorder = border * border * (3 - 2 * border)

      // Combine luminance relief + gentle subject dome
      const rawHeight = (luma * 0.68 + radial * 0.32) * alpha * smoothBorder
      depth[idx] = rawHeight
    }
  }

  return depth
}

/**
 * Fast edge-aware smoothing pass (3×3 bilateral-style filter) over a 256×256
 * depth buffer. Preserves strong subject edges while removing high-frequency
 * noise so the resulting 2.5D mesh tilts smoothly under studio lighting.
 */
function smoothDepthEdgeAware(
  src: Float32Array,
  size: number,
  edgeStrength = 28
): Float32Array {
  const dst = new Float32Array(src.length)

  for (let y = 0; y < size; y++) {
    const y0 = y > 0 ? y - 1 : 0
    const y2 = y < size - 1 ? y + 1 : size - 1

    for (let x = 0; x < size; x++) {
      const x0 = x > 0 ? x - 1 : 0
      const x2 = x < size - 1 ? x + 1 : size - 1
      const cIdx = y * size + x
      const center = src[cIdx]

      let sum = center * 2.0
      let weightSum = 2.0

      // Unrolled 8-neighborhood with fast rational range kernel: 1 / (1 + diff^2 * k)
      // Zero per-pixel array allocations for smooth mobile execution
      const row0 = y0 * size
      const row1 = y * size
      const row2 = y2 * size

      let val = src[row0 + x0]
      let diff = val - center
      let w = 0.7 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row0 + x]
      diff = val - center
      w = 1.0 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row0 + x2]
      diff = val - center
      w = 0.7 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row1 + x0]
      diff = val - center
      w = 1.0 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row1 + x2]
      diff = val - center
      w = 1.0 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row2 + x0]
      diff = val - center
      w = 0.7 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row2 + x]
      diff = val - center
      w = 1.0 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      val = src[row2 + x2]
      diff = val - center
      w = 0.7 / (1 + diff * diff * edgeStrength)
      sum += val * w
      weightSum += w

      dst[cIdx] = sum / weightSum
    }
  }

  return dst
}

function sampleDepthBilinear(
  depth: Float32Array,
  size: number,
  u: number,
  v: number
): number {
  const fx = Math.max(0, Math.min(1, u)) * (size - 1)
  const fy = Math.max(0, Math.min(1, v)) * (size - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0

  const d00 = depth[y0 * size + x0]
  const d10 = depth[y0 * size + x1]
  const d01 = depth[y1 * size + x0]
  const d11 = depth[y1 * size + x1]

  const top = d00 + (d10 - d00) * tx
  const bottom = d01 + (d11 - d01) * tx
  return top + (bottom - top) * ty
}

/**
 * Instant mobile-first 2.5D Depth Relief generator (zero heavy ML downloads).
 * Downscales the image to 256×256, builds an edge-aware smoothed luminance
 * depth map, displaces a lightweight 64×64 Three.js relief mesh mounted on a
 * sleek studio slab, and exports a binary `.glb` in under 1–2 seconds.
 */
export async function generateFast25dRelief(
  source: File | Blob | string,
  options: Fast25dReliefOptions = {}
): Promise<ConvertImageTo3dResult> {
  const { reliefDepth = 0.22, signal, onProgress } = options

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  onProgress?.({ stage: "generating_fast_25d", percent: 20 })
  const img = await loadImageElement(source)

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  const depthCanvas = document.createElement("canvas")
  const textureCanvas = document.createElement("canvas")
  const backCanvas = createShowcaseBackCanvas()

  let slabGeom: THREE.ExtrudeGeometry | null = null
  let slabMat: THREE.MeshStandardMaterial | null = null
  let rimGeom: THREE.ExtrudeGeometry | null = null
  let rimMat: THREE.MeshStandardMaterial | null = null
  let frontGeom: THREE.PlaneGeometry | null = null
  let frontTex: THREE.CanvasTexture | null = null
  let frontMat: THREE.MeshStandardMaterial | null = null
  let backGeom: THREE.PlaneGeometry | null = null
  let backTex: THREE.CanvasTexture | null = null
  let backMat: THREE.MeshStandardMaterial | null = null

  try {
    // 1. Fit source image into a clean studio card texture (512×614) & 256×256 depth canvas
    const texW = FAST_25D_TEXTURE_SIZE
    const texH = Math.round(FAST_25D_TEXTURE_SIZE * (1.12 / 0.94))
    textureCanvas.width = texW
    textureCanvas.height = texH
    const texCtx = textureCanvas.getContext("2d")
    if (!texCtx) throw new Error("2D canvas context unavailable.")

    // Subtle studio gradient behind image (visible if PNG has transparency or letterbox)
    const bg = texCtx.createRadialGradient(
      texW * 0.5,
      texH * 0.4,
      texW * 0.08,
      texW * 0.5,
      texH * 0.5,
      texH * 0.72
    )
    bg.addColorStop(0, "#FAF8F5")
    bg.addColorStop(1, "#E7E0D5")
    texCtx.fillStyle = bg
    texCtx.fillRect(0, 0, texW, texH)

    const pad = 0.92
    const fitScale = Math.min(
      (texW * pad) / Math.max(img.width, 1),
      (texH * pad) / Math.max(img.height, 1)
    )
    const drawW = Math.round(img.width * fitScale)
    const drawH = Math.round(img.height * fitScale)
    const drawX = Math.round((texW - drawW) / 2)
    const drawY = Math.round((texH - drawH) / 2)
    texCtx.drawImage(img, drawX, drawY, drawW, drawH)

    const previewCutoutDataUrl = textureCanvas.toDataURL("image/webp", 0.86)

    // Downscale onto 256×256 canvas for fast luminance depth extraction
    depthCanvas.width = FAST_25D_DEPTH_SIZE
    depthCanvas.height = FAST_25D_DEPTH_SIZE
    const depthCtx = depthCanvas.getContext("2d", { willReadFrequently: true })
    if (!depthCtx) throw new Error("2D canvas context unavailable.")
    depthCtx.drawImage(textureCanvas, 0, 0, FAST_25D_DEPTH_SIZE, FAST_25D_DEPTH_SIZE)
    const depthImgData = depthCtx.getImageData(
      0,
      0,
      FAST_25D_DEPTH_SIZE,
      FAST_25D_DEPTH_SIZE
    )

    onProgress?.({ stage: "generating_fast_25d", percent: 45 })
    await yieldToMainThread()

    if (signal?.aborted) {
      throw new DOMException("Conversion aborted", "AbortError")
    }

    // 2. Luminance heightmap + 2-pass edge-aware smoothing
    let depthMap = buildLuminanceDepthMap(depthImgData, FAST_25D_DEPTH_SIZE)
    depthMap = smoothDepthEdgeAware(depthMap, FAST_25D_DEPTH_SIZE, 28)
    await yieldToMainThread()
    depthMap = smoothDepthEdgeAware(depthMap, FAST_25D_DEPTH_SIZE, 18)

    if (signal?.aborted) {
      throw new DOMException("Conversion aborted", "AbortError")
    }

    onProgress?.({ stage: "generating_fast_25d", percent: 72 })

    // 3. Build lightweight 2.5D sculpted relief mesh + studio backing slab
    const cardW = 0.94
    const cardH = 1.12
    const cornerR = 0.085
    const slabDepth = Math.max(0.036, Math.min(0.09, reliefDepth * 0.24))
    const bevelThickness = 0.011
    const bevelSize = 0.011

    const slabShape = createRoundedRectShape(cardW, cardH, cornerR)
    slabGeom = new THREE.ExtrudeGeometry(slabShape, {
      depth: slabDepth,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: 3,
      curveSegments: 16,
    })
    slabGeom.translate(0, 0, -slabDepth / 2)
    slabMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b18,
      roughness: 0.18,
      metalness: 0.2,
    })
    const slabMesh = new THREE.Mesh(slabGeom, slabMat)
    slabMesh.name = "Fast25dBackingSlab"

    const rimPad = 0.02
    const rimOuter = createRoundedRectShape(cardW + rimPad, cardH + rimPad, cornerR + 0.01)
    rimOuter.holes.push(
      createRoundedRectPath(cardW - 0.015, cardH - 0.015, Math.max(0.02, cornerR - 0.008))
    )
    rimGeom = new THREE.ExtrudeGeometry(rimOuter, {
      depth: slabDepth + bevelThickness * 1.35,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
      curveSegments: 16,
    })
    rimGeom.translate(0, 0, -(slabDepth + bevelThickness * 1.35) / 2)
    rimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.24,
      metalness: 0.84,
    })
    const rimMesh = new THREE.Mesh(rimGeom, rimMat)
    rimMesh.name = "Fast25dMetallicRim"

    const faceW = cardW - 0.038
    const faceH = cardH - 0.038
    const faceZ = slabDepth / 2 + bevelThickness + 0.001
    const reliefAmp = Math.max(0.045, Math.min(0.14, reliefDepth * 0.42))

    // 64×64 subdivided mesh for smooth 3D-tilting relief with low mobile overhead
    const segs = 64
    frontGeom = new THREE.PlaneGeometry(faceW, faceH, segs, segs)
    const pos = frontGeom.getAttribute("position")
    const uv = frontGeom.getAttribute("uv")

    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i)
      const vTopDown = 1 - uv.getY(i)
      const h = sampleDepthBilinear(depthMap, FAST_25D_DEPTH_SIZE, u, vTopDown)
      pos.setZ(i, h * reliefAmp)
    }
    pos.needsUpdate = true
    flipPlaneUvForGltf(frontGeom)
    frontGeom.computeVertexNormals()

    frontTex = new THREE.CanvasTexture(textureCanvas)
    frontTex.colorSpace = THREE.SRGBColorSpace
    frontTex.flipY = false
    frontTex.needsUpdate = true

    frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      roughness: 0.36,
      metalness: 0.04,
    })
    const frontMesh = new THREE.Mesh(frontGeom, frontMat)
    frontMesh.name = "Fast25dDepthRelief"
    frontMesh.position.z = faceZ

    backTex = new THREE.CanvasTexture(backCanvas)
    backTex.colorSpace = THREE.SRGBColorSpace
    backTex.flipY = false
    backTex.needsUpdate = true

    backGeom = new THREE.PlaneGeometry(faceW, faceH)
    flipPlaneUvForGltf(backGeom)
    backMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.32,
      metalness: 0.14,
    })
    const backMesh = new THREE.Mesh(backGeom, backMat)
    backMesh.name = "Fast25dBackFace"
    backMesh.rotation.y = Math.PI
    backMesh.position.z = -faceZ

    const group = new THREE.Group()
    group.name = "Fast25dDepthRelief3D"
    group.add(slabMesh, rimMesh, frontMesh, backMesh)

    const exporter = new GLTFExporter()
    const glbBuffer = await exporter.parseAsync(group, { binary: true })
    if (!(glbBuffer instanceof ArrayBuffer)) {
      throw new Error("Expected binary ArrayBuffer from GLTFExporter.")
    }

    const blob = new Blob([glbBuffer], { type: "model/gltf-binary" })
    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "")
    const fileName = `mascot-25d-relief-${timestamp}.glb`
    const file = new File([blob], fileName, { type: "model/gltf-binary" })

    onProgress?.({ stage: "ready", percent: 100 })

    return {
      blob,
      file,
      fileName,
      engine: "fast_25d",
      usedFallback: false,
      previewCutoutDataUrl,
    }
  } finally {
    slabGeom?.dispose()
    slabMat?.dispose()
    rimGeom?.dispose()
    rimMat?.dispose()
    frontGeom?.dispose()
    frontTex?.dispose()
    frontMat?.dispose()
    backGeom?.dispose()
    backTex?.dispose()
    backMat?.dispose()
    disposeCanvas(depthCanvas)
    disposeCanvas(textureCanvas)
    disposeCanvas(backCanvas)
  }
}

/**
 * Converts any 2D mascot or product photo into a downloadable/loadable `.glb` 3D mesh.
 * - In `"fast_25d"` mode (mobile default): generates a smooth 2.5D depth relief mesh
 *   in under 1–2 seconds with zero heavy ML weight downloads.
 * - In `"full_3d"` mode (desktop option): attempts cloud ZeroGPU Spaces (`TripoSR` ->
 *   `InstantMesh`) with a strict 12-second timeout, automatically aborting and falling
 *   back cleanly to `generateFast25dRelief` on timeout or memory/network failure.
 */
export async function convertImageToGlb(
  source: File | Blob | string,
  options: ConvertImageTo3dOptions = {}
): Promise<ConvertImageTo3dResult> {
  const {
    mode = "full_3d",
    timeoutMs = DEFAULT_FULL_3D_TIMEOUT_MS,
    hfToken,
    removeBg = true,
    reliefDepth = 0.22,
    signal,
    onProgress,
  } = options

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  // Instant mobile-first path: skip @imgly/background-removal and cloud queues entirely
  if (mode === "fast_25d") {
    return generateFast25dRelief(source, {
      reliefDepth,
      signal,
      onProgress,
    })
  }

  // Full 3D path with strict timeout (default 12s) + automatic fallback to Fast 2.5D Relief
  const full3dController = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const onOuterAbort = () => full3dController.abort()
  signal?.addEventListener("abort", onOuterAbort, { once: true })

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      full3dController.abort()
      reject(new Error("Full 3D conversion timed out"))
    }, timeoutMs)
  })

  const runFull3dPipeline = async (): Promise<ConvertImageTo3dResult> => {
    onProgress?.({ stage: "preparing", percent: 15 })
    const prepared = await prepareImageFor3d(source, removeBg, full3dController.signal)

    try {
      if (full3dController.signal.aborted) {
        throw new DOMException("Conversion aborted", "AbortError")
      }

      onProgress?.({ stage: "generating_cloud", percent: 45 })

      let finalBlob: Blob | null = null
      let usedEngine: ImageTo3dEngine = "triposr"

      for (const space of HF_SPACES) {
        if (full3dController.signal.aborted) {
          throw new DOMException("Conversion aborted", "AbortError")
        }
        try {
          finalBlob = await tryHuggingFaceSpace(
            space,
            prepared.squarePngBlob,
            hfToken,
            full3dController.signal
          )
          usedEngine = space.id
          break
        } catch (err) {
          if (full3dController.signal.aborted) {
            throw err
          }
          console.warn(`Hugging Face Space (${space.id}) unavailable, trying next:`, err)
        }
      }

      if (!finalBlob) {
        throw new Error("All cloud 3D spaces were unavailable.")
      }

      onProgress?.({ stage: "ready", percent: 100 })
      const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "")
      const fileName = `mascot-3d-${usedEngine}-${timestamp}.glb`
      const file = new File([finalBlob], fileName, { type: "model/gltf-binary" })

      return {
        blob: finalBlob,
        file,
        fileName,
        engine: usedEngine,
        usedFallback: false,
        previewCutoutDataUrl: prepared.previewCutoutDataUrl,
      }
    } finally {
      disposeCanvas(prepared.cutoutCanvas)
    }
  }

  const full3dPromise = runFull3dPipeline()
  // Prevent unhandled rejection if timeoutPromise wins the race while full3dPromise rejects later
  full3dPromise.catch(() => {})

  try {
    return await Promise.race([full3dPromise, timeoutPromise])
  } catch (err) {
    // Propagate explicit user cancellation
    if (signal?.aborted) {
      throw new DOMException("Conversion aborted", "AbortError")
    }

    const fallbackReason: ImageTo3dFallbackReason = timedOut ? "timeout" : "error"
    console.warn(
      `Full 3D conversion ${fallbackReason}; falling back to Fast 2.5D Relief:`,
      err
    )

    onProgress?.({ stage: "fallback_fast", percent: 75 })
    const fastResult = await generateFast25dRelief(source, {
      reliefDepth,
      signal,
      onProgress: onProgress
        ? (p) =>
            onProgress({
              stage: p.stage === "ready" ? "ready" : "fallback_fast",
              percent: p.stage === "ready" ? 100 : Math.min(98, 75 + Math.round(p.percent * 0.22)),
            })
        : undefined,
    })

    return {
      ...fastResult,
      usedFallback: true,
      fallbackReason,
    }
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId)
    signal?.removeEventListener("abort", onOuterAbort)
  }
}
