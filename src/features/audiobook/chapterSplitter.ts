export interface BookChapter {
  id: string
  index: number
  title: string
  text: string
  charCount: number
}

const HEADING_LINE_REGEX =
  /^(?:#{1,3}\s+.+|chapter\s+\d+.*|part\s+\d+.*|အခန်း\s*[၀-၉\d]+.*|အပိုင်း\s*[၀-၉\d]+.*)$/i

function splitParagraphByLength(paragraph: string, maxChars: number): string[] {
  const trimmed = paragraph.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const sentences = trimmed
    .split(/(?<=[။.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const parts: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        parts.push(current)
        current = ""
      }
      const chars = Array.from(sentence)
      for (let i = 0; i < chars.length; i += maxChars) {
        parts.push(chars.slice(i, i + maxChars).join(""))
      }
      continue
    }

    if (current && current.length + sentence.length + 1 > maxChars) {
      parts.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }

  if (current) parts.push(current)
  return parts
}

/**
 * Split a long book, article, or document into manageable chapters/parts
 * for chunked Burmese/English TTS synthesis.
 */
export function splitDocumentIntoChapters(
  rawText: string,
  maxCharsPerPart = 1200
): BookChapter[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const sections: Array<{ title?: string; body: string }> = []
  let activeTitle: string | undefined
  let activeParagraphs: string[] = []

  const flushSection = () => {
    const body = activeParagraphs.join("\n\n").trim()
    if (body) {
      sections.push({ title: activeTitle, body })
    }
    activeTitle = undefined
    activeParagraphs = []
  }

  for (const para of paragraphs) {
    const firstLine = para.split("\n")[0]?.trim() ?? ""
    if (HEADING_LINE_REGEX.test(firstLine) && para.split("\n").length === 1) {
      flushSection()
      activeTitle = firstLine.replace(/^#{1,3}\s+/, "").trim()
    } else {
      activeParagraphs.push(para)
    }
  }
  flushSection()

  const chapters: BookChapter[] = []
  let partCounter = 1

  for (const section of sections) {
    const subParts = splitParagraphByLength(section.body, maxCharsPerPart)
    subParts.forEach((partText, subIdx) => {
      const baseTitle = section.title || `Part ${partCounter}`
      const title =
        section.title && subParts.length > 1
          ? `${baseTitle} (${subIdx + 1}/${subParts.length})`
          : baseTitle
      chapters.push({
        id: `chapter-${partCounter}`,
        index: partCounter,
        title,
        text: partText,
        charCount: partText.length,
      })
      partCounter += 1
    })
  }

  return chapters
}

export function formatDurationLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs.toString().padStart(2, "0")}s`
}

