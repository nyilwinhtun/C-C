import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"

export type ImageTo3dStage =
  | "preparing"
  | "generating_cloud"
  | "generating_local"
  | "ready"

export type ImageTo3dEngine = "triposr" | "instantmesh" | "local_relief"

export interface ImageTo3dProgress {
  stage: ImageTo3dStage
  percent: number
  message?: string
}

export interface ConvertImageTo3dOptions {
  /** Optional Hugging Face API token (`hf_...`) for higher ZeroGPU quota/priority */
  hfToken?: string
  /** Whether to run @imgly/background-removal before 3D conversion (default: true) */
  removeBg?: boolean
  /** Relief depth scale for local GLTFExporter fallback (default: 0.22) */
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
  previewCutoutDataUrl: string
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
  removeBg: boolean
): Promise<PreparedSubject> {
  let workingBlob = await sourceToBlob(source)

  if (removeBg) {
    try {
      const { removeBackground } = await import("@imgly/background-removal")
      workingBlob = await removeBackground(workingBlob)
    } catch (err) {
      console.warn("Background removal skipped; using original image:", err)
    }
  }

  const img = await loadImageElement(workingBlob)
  const rawCanvas = document.createElement("canvas")
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
  const cutoutCanvas = document.createElement("canvas")
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
  const paddedCanvas = document.createElement("canvas")
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

/**
 * Generates a watertight, double-sided 3D Extruded Relief `.glb` model locally
 * in the browser using THREE.GLTFExporter from the subject cutout + luminance depth map.
 * Guarantees 0-cost offline conversion even if cloud ZeroGPU Spaces are busy.
 */
export async function createLocalReliefGlb(
  cutoutCanvas: HTMLCanvasElement,
  reliefDepth = 0.22
): Promise<Blob> {
  const grid = 76
  const sampleCanvas = document.createElement("canvas")
  sampleCanvas.width = grid
  sampleCanvas.height = grid
  const sCtx = sampleCanvas.getContext("2d")
  if (!sCtx) throw new Error("2D canvas context unavailable.")
  sCtx.drawImage(cutoutCanvas, 0, 0, grid, grid)
  const { data } = sCtx.getImageData(0, 0, grid, grid)

  const mask = new Uint8Array(grid * grid)
  const lum = new Float32Array(grid * grid)

  for (let i = 0; i < grid * grid; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const a = data[i * 4 + 3]
    mask[i] = a > 28 ? 1 : 0
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }

  // Compute normalized interior distance (0 at silhouette edge -> 1 at center)
  // for smooth rounded 3D relief beveling
  const dist = new Float32Array(grid * grid)
  const maxPass = 6
  for (let i = 0; i < grid * grid; i++) {
    dist[i] = mask[i] ? maxPass : 0
  }
  for (let pass = 0; pass < maxPass; pass++) {
    for (let y = 1; y < grid - 1; y++) {
      for (let x = 1; x < grid - 1; x++) {
        const idx = y * grid + x
        if (!mask[idx]) continue
        const minNeighbor = Math.min(
          dist[idx - 1],
          dist[idx + 1],
          dist[idx - grid],
          dist[idx + grid]
        )
        dist[idx] = Math.min(dist[idx], minNeighbor + 1)
      }
    }
  }

  const depthMap = new Float32Array(grid * grid)
  for (let i = 0; i < grid * grid; i++) {
    if (!mask[i]) continue
    const edgeFactor = Math.sin((Math.min(dist[i], maxPass) / maxPass) * (Math.PI / 2))
    depthMap[i] = (edgeFactor * 0.72 + lum[i] * 0.28) * reliefDepth
  }

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const frontIndex = new Int32Array(grid * grid).fill(-1)
  const backIndex = new Int32Array(grid * grid).fill(-1)

  const widthWorld = 1.0
  const heightWorld = 1.0

  // Create front & back vertices for all opaque grid points
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const idx = y * grid + x
      // Include a vertex if it or any of its 4-cell neighbors is opaque
      const active =
        mask[idx] ||
        (x > 0 && mask[idx - 1]) ||
        (y > 0 && mask[idx - grid]) ||
        (x > 0 && y > 0 && mask[idx - grid - 1])

      if (!active) continue

      const wx = (x / (grid - 1) - 0.5) * widthWorld
      const wy = (0.5 - y / (grid - 1)) * heightWorld
      const u = x / (grid - 1)
      // glTF textures use flipY = false where v = 0 is the top row of the canvas
      const v = y / (grid - 1)
      const z = mask[idx] ? depthMap[idx] : 0

      frontIndex[idx] = positions.length / 3
      positions.push(wx, wy, z * 0.65)
      uvs.push(u, v)

      backIndex[idx] = positions.length / 3
      positions.push(wx, wy, -z * 0.45)
      uvs.push(u, v)
    }
  }

  const cellActive = (cx: number, cy: number): boolean => {
    if (cx < 0 || cy < 0 || cx >= grid - 1 || cy >= grid - 1) return false
    const i00 = cy * grid + cx
    const i10 = i00 + 1
    const i01 = i00 + grid
    const i11 = i01 + 1
    return Boolean(mask[i00] || mask[i10] || mask[i01] || mask[i11])
  }

  // Triangulate front, back, and silhouette side walls
  for (let y = 0; y < grid - 1; y++) {
    for (let x = 0; x < grid - 1; x++) {
      if (!cellActive(x, y)) continue

      const i00 = y * grid + x
      const i10 = i00 + 1
      const i01 = i00 + grid
      const i11 = i01 + 1

      const f00 = frontIndex[i00]
      const f10 = frontIndex[i10]
      const f01 = frontIndex[i01]
      const f11 = frontIndex[i11]

      const b00 = backIndex[i00]
      const b10 = backIndex[i10]
      const b01 = backIndex[i01]
      const b11 = backIndex[i11]

      if (f00 >= 0 && f10 >= 0 && f01 >= 0 && f11 >= 0) {
        // Front face (+Z)
        indices.push(f00, f01, f10)
        indices.push(f10, f01, f11)
        // Back face (-Z)
        indices.push(b00, b10, b01)
        indices.push(b10, b11, b01)

        // Stitch boundary edges
        if (!cellActive(x, y - 1)) {
          indices.push(f00, f10, b00, f10, b10, b00)
        }
        if (!cellActive(x, y + 1)) {
          indices.push(f11, f01, b11, f01, b01, b11)
        }
        if (!cellActive(x - 1, y)) {
          indices.push(f01, f00, b01, f00, b00, b01)
        }
        if (!cellActive(x + 1, y)) {
          indices.push(f10, f11, b10, f11, b11, b10)
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const texture = new THREE.CanvasTexture(cutoutCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.needsUpdate = true

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.45,
    metalness: 0.08,
    alphaTest: 0.1,
    transparent: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = "MascotRelief3D"

  const group = new THREE.Group()
  group.name = "Presenter3DRelief"
  group.add(mesh)

  const exporter = new GLTFExporter()
  try {
    const glbBuffer = await exporter.parseAsync(group, { binary: true })
    if (glbBuffer instanceof ArrayBuffer) {
      return new Blob([glbBuffer], { type: "model/gltf-binary" })
    }
    throw new Error("Expected binary ArrayBuffer from GLTFExporter.")
  } finally {
    geometry.dispose()
    texture.dispose()
    material.dispose()
  }
}

/**
 * Converts any 2D mascot or product photo into a downloadable/loadable `.glb` 3D mesh.
 * Tries public Hugging Face ZeroGPU Gradio Spaces (`TripoSR` -> `InstantMesh`) first,
 * and seamlessly falls back to a local 3D Extruded Relief `.glb` via `GLTFExporter`.
 */
export async function convertImageToGlb(
  source: File | Blob | string,
  options: ConvertImageTo3dOptions = {}
): Promise<ConvertImageTo3dResult> {
  const {
    hfToken,
    removeBg = true,
    reliefDepth = 0.22,
    signal,
    onProgress,
  } = options

  onProgress?.({ stage: "preparing", percent: 15 })
  const prepared = await prepareImageFor3d(source, removeBg)

  if (signal?.aborted) {
    throw new DOMException("Conversion aborted", "AbortError")
  }

  onProgress?.({ stage: "generating_cloud", percent: 45 })

  let finalBlob: Blob | null = null
  let usedEngine: ImageTo3dEngine = "local_relief"
  let usedFallback = false

  for (const space of HF_SPACES) {
    if (signal?.aborted) {
      throw new DOMException("Conversion aborted", "AbortError")
    }
    try {
      finalBlob = await tryHuggingFaceSpace(
        space,
        prepared.squarePngBlob,
        hfToken,
        signal
      )
      usedEngine = space.id
      break
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError" && signal?.aborted) {
        throw err
      }
      console.warn(`Hugging Face Space (${space.id}) unavailable, trying next:`, err)
    }
  }

  if (!finalBlob) {
    usedFallback = true
    usedEngine = "local_relief"
    onProgress?.({ stage: "generating_local", percent: 75 })
    finalBlob = await createLocalReliefGlb(prepared.cutoutCanvas, reliefDepth)
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
    usedFallback,
    previewCutoutDataUrl: prepared.previewCutoutDataUrl,
  }
}
