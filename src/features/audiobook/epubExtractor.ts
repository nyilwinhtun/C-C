/**
 * Zero-dependency browser EPUB text extractor.
 * Reads ZIP local/central directory entries and inflates HTML/XHTML chapters
 * using the browser's built-in DecompressionStream('deflate-raw').
 */

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("EPUB decompression is not supported in this browser.")
  }
  const stream = new Blob([compressed.slice().buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedData: Uint8Array
}

function parseZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder("utf-8")

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1
  const minOffset = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid EPUB file (missing ZIP directory).")
  }

  const centralDirSize = view.getUint32(eocdOffset + 12, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)
  const entries: ZipEntry[] = []

  let ptr = centralDirOffset
  const end = centralDirOffset + centralDirSize
  while (ptr + 46 <= end && ptr + 46 <= bytes.length) {
    const sig = view.getUint32(ptr, true)
    if (sig !== 0x02014b50) break

    const compressionMethod = view.getUint16(ptr + 10, true)
    const compressedSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localHeaderOffset = view.getUint32(ptr + 42, true)

    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commentLen

    if (localHeaderOffset + 30 <= bytes.length) {
      const localNameLen = view.getUint16(localHeaderOffset + 26, true)
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
      const dataEnd = Math.min(bytes.length, dataStart + compressedSize)
      entries.push({
        name,
        compressionMethod,
        compressedData: bytes.subarray(dataStart, dataEnd),
      })
    }
  }

  return entries
}

function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  doc.querySelectorAll("script, style, head").forEach((el) => el.remove())

  const blockTags = new Set([
    "P",
    "DIV",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "BLOCKQUOTE",
    "BR",
    "SECTION",
    "ARTICLE",
  ])

  const lines: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ") ?? ""
      if (text.trim()) {
        lines.push(text)
      }
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const isBlock = blockTags.has(el.tagName)
      if (isBlock && lines.length > 0 && lines[lines.length - 1] !== "\n") {
        lines.push("\n")
      }
      el.childNodes.forEach(walk)
      if (isBlock && lines.length > 0 && lines[lines.length - 1] !== "\n") {
        lines.push("\n")
      }
    }
  }

  if (doc.body) {
    walk(doc.body)
  }

  return lines
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function extractTextFromEpub(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const entries = parseZipEntries(bytes)
  const decoder = new TextDecoder("utf-8")

  const contentEntries = entries
    .filter((entry) => {
      const lower = entry.name.toLowerCase()
      return (
        (lower.endsWith(".xhtml") || lower.endsWith(".html") || lower.endsWith(".htm")) &&
        !lower.includes("toc.") &&
        !lower.includes("nav.")
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const chapters: string[] = []
  for (const entry of contentEntries) {
    let rawBytes: Uint8Array
    if (entry.compressionMethod === 0) {
      rawBytes = entry.compressedData
    } else if (entry.compressionMethod === 8) {
      rawBytes = await inflateRawBytes(entry.compressedData)
    } else {
      continue
    }
    const html = decoder.decode(rawBytes)
    const plain = htmlToPlainText(html)
    if (plain.length > 20) {
      chapters.push(plain)
    }
  }

  const combined = chapters.join("\n\n").trim()
  if (!combined) {
    throw new Error("Could not extract readable text from this EPUB file.")
  }
  return combined
}
