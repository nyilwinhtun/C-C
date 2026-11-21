import { sanitizeSpeechText } from "@/components/shared/read-aloud-button"
import { encodeMonoWav16Bit } from "@/lib/audioProcessor"
import { decodeAudioBlob, getAudioContextConstructor, unlockIosAudio } from "@/lib/iosAudio"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"

export type BurmeseVoiceType = "female" | "male"
export type VoiceoverSpeed = 0.85 | 0.9 | 1.0 | 1.1 | 1.15 | 1.2
export type VoiceDeliveryTone = "promo" | "storytelling" | "educational"
export type SoundEffectType = "none" | "pop" | "whoosh" | "cash_ding"

export interface SoundEffectPreset {
  id: SoundEffectType
  label: string
  labelMy: string
}

export const SOUND_EFFECT_PRESETS: Record<SoundEffectType, SoundEffectPreset> = {
  none: { id: "none", label: "No SFX", labelMy: "မထည့်ပါ" },
  pop: { id: "pop", label: "Pop", labelMy: "Pop" },
  whoosh: { id: "whoosh", label: "Whoosh", labelMy: "Whoosh" },
  cash_ding: { id: "cash_ding", label: "Cash Ding", labelMy: "Cash Ding" },
}

export const PAUSE_TAG_REGEX = /\[pause\s+(\d+(?:\.\d+)?)\s*s?\]/gi

export type ScriptSegment =
  | { kind: "speech"; text: string }
  | { kind: "pause"; seconds: number }

export interface VoiceDeliveryPreset {
  id: VoiceDeliveryTone
  label: string
  labelMy: string
  styleInstruction: string
}

export const VOICE_DELIVERY_PRESETS: Record<VoiceDeliveryTone, VoiceDeliveryPreset> = {
  promo: {
    id: "promo",
    label: "Energetic Promo",
    labelMy: "တက်ကြွသော အရောင်းဟန်",
    styleInstruction:
      "Deliver with an upbeat, energetic, persuasive Myanmar commercial promo tone—crisp articulation, enthusiastic warmth, and punchy emphasis on key offers.",
  },
  storytelling: {
    id: "storytelling",
    label: "Warm Storytelling",
    labelMy: "နွေးထွေးသော စကားပြောဟန်",
    styleInstruction:
      "Deliver with a warm, friendly, conversational Myanmar storytelling tone—natural emotional flow, engaging warmth, and smooth pacing.",
  },
  educational: {
    id: "educational",
    label: "Calm Educational",
    labelMy: "တည်ငြိမ်သော ပညာပေးဟန်",
    styleInstruction:
      "Deliver with a calm, confident, clear Myanmar educational presenter tone—steady measured pacing, articulate pronunciation, and trustworthy clarity.",
  },
}

export interface BurmeseVoicePreset {
  id: BurmeseVoiceType
  label: string
  labelMy: string
  neuralVoice: "my-MM-NilarNeural" | "my-MM-ThihaNeural"
  geminiVoice: string
}

export const BURMESE_VOICE_PRESETS: Record<BurmeseVoiceType, BurmeseVoicePreset> = {
  female: {
    id: "female",
    label: "Female (Nilar)",
    labelMy: "မိန်းကလေးအသံ (Nilar)",
    neuralVoice: "my-MM-NilarNeural",
    geminiVoice: "Aoede",
  },
  male: {
    id: "male",
    label: "Male (Thiha)",
    labelMy: "ယောက်ျားလေးအသံ (Thiha)",
    neuralVoice: "my-MM-ThihaNeural",
    geminiVoice: "Charon",
  },
}

export const VOICEOVER_SPEEDS: VoiceoverSpeed[] = [0.9, 1.0, 1.1, 1.2]

export interface VoiceoverResult {
  audioUrl: string
  blob: Blob
  audioBuffer: AudioBuffer
  mimeType: string
  fileExtension: "wav" | "mp3"
  durationSeconds: number
  voiceName: string
  provider: "gemini" | "neural-tts" | "speech-synthesis"
  cleanedText: string
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TtsError"
  }
}

/**
 * Strip markdown symbols, timestamps like [0-3s] or 0:00 - 0:05, and emojis
 * so only clean spoken Burmese/English text is sent to TTS synthesis.
 * Never deletes actual spoken words, parenthetical phrases, or sentences.
 */
export function cleanVoiceoverText(raw: string): string {
  const sanitized = sanitizeSpeechText(raw)
  return sanitized
    .replace(/\s+\n/g, "\n")
    .trim()
}

/**
 * Estimate spoken duration in seconds for Burmese/English voiceover text,
 * accounting for playback speed and any [pause Xs] tags.
 */
export function estimateSpokenDurationSeconds(
  rawText: string,
  speed: number = 1.0
): number {
  if (!rawText || !rawText.trim()) return 0

  let pauseSeconds = 0
  const withoutPauses = rawText.replace(PAUSE_TAG_REGEX, (_m, sec: string) => {
    const parsed = Number.parseFloat(sec)
    if (Number.isFinite(parsed) && parsed > 0) {
      pauseSeconds += parsed
    }
    return " "
  })

  const cleaned = cleanVoiceoverText(withoutPauses)
  const nonSpaceChars = cleaned.replace(/\s+/g, "").length
  if (nonSpaceChars === 0 && pauseSeconds === 0) return 0

  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1.0
  // ~16.5 non-space Burmese chars/sec (~2.8 words/sec) at 1.0x speed
  const speechSeconds = nonSpaceChars / (16.5 * safeSpeed)
  return Math.max(1, Math.round(speechSeconds + pauseSeconds))
}

const BURMESE_DIGITS = [
  "သုည",
  "တစ်",
  "နှစ်",
  "သုံး",
  "လေး",
  "ငါး",
  "ခြောက်",
  "ခုနစ်",
  "ရှစ်",
  "ကိုး",
] as const

const BURMESE_PLACE_UNITS: ReadonlyArray<{ value: number; label: string; creakyLabel?: string }> = [
  { value: 10_000_000, label: "ကုဋေ" },
  { value: 100_000, label: "သိန်း" },
  { value: 10_000, label: "သောင်း" },
  { value: 1_000, label: "ထောင်", creakyLabel: "ထောင့်" },
  { value: 100, label: "ရာ", creakyLabel: "ရာ့" },
  { value: 10, label: "ဆယ်", creakyLabel: "ဆယ့်" },
]

function myanmarDigitsToArabic(input: string): string {
  return input.replace(/[၀-၉]/g, (ch) => String(ch.charCodeAt(0) - 0x1040))
}

function integerToBurmeseWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n)
  const intVal = Math.floor(n)
  if (intVal === 0) return BURMESE_DIGITS[0]
  if (intVal < 10) return BURMESE_DIGITS[intVal]

  let remaining = intVal
  const largeParts: string[] = []
  let smallPart = ""

  for (const unit of BURMESE_PLACE_UNITS) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value)
      remaining %= unit.value

      const countWords = count >= 10 ? integerToBurmeseWords(count) : BURMESE_DIGITS[count]
      const unitWord = remaining > 0 && unit.creakyLabel ? unit.creakyLabel : unit.label
      const chunk = `${countWords}${unitWord}`

      if (unit.value >= 100) {
        largeParts.push(chunk)
      } else {
        smallPart += chunk
      }
    }
  }

  if (remaining > 0) {
    smallPart += BURMESE_DIGITS[remaining]
  }

  if (smallPart) {
    largeParts.push(smallPart)
  }

  return largeParts.join("")
}

function numericStringToBurmeseWords(rawNum: string): string {
  const cleaned = rawNum.replace(/,/g, "").trim()
  if (!cleaned) return rawNum

  // Read leading-zero multi-digit sequences (e.g. phone numbers like 09...) digit by digit
  if (/^0\d+$/.test(cleaned)) {
    return cleaned
      .split("")
      .map((d) => BURMESE_DIGITS[Number(d)] ?? d)
      .join(" ")
  }

  const [intPart, decPart] = cleaned.split(".")
  const intNum = Number.parseInt(intPart, 10)
  if (!Number.isFinite(intNum)) return rawNum

  const spokenInt = integerToBurmeseWords(intNum)
  if (!decPart) return spokenInt

  const spokenDec = decPart
    .split("")
    .map((d) => BURMESE_DIGITS[Number(d)] ?? d)
    .join(" ")
  return `${spokenInt} ဒသမ ${spokenDec}`
}

const ENGLISH_TO_BURMESE_PHONETICS: ReadonlyArray<[RegExp, string]> = [
  [/\bfree\s+delivery\b/gi, "ဖရီး ဒယ်လီဗာရီ"],
  [/\bfree\s+deli\b/gi, "ဖရီး ဒယ်လီဗာရီ"],
  [/\bpro\s+max\b/gi, "ပရိုမက်စ်"],
  [/\bpre[-\s]?order\b/gi, "ပရီအော်ဒါ"],
  [/\btype[-\s]?c\b/gi, "တိုက်ပ်စီ"],
  [/\bin[-\s]?stock\b/gi, "အင်စတော့ခ်"],
  [/\bsubscribes?\b/gi, "ဆပ်စခရိုက်ဘ်"],
  [/\bfollows?\b/gi, "ဖောလိုး"],
  [/\blikes?\b/gi, "လိုက်ခ်"],
  [/\bshares?\b/gi, "ရှယ်"],
  [/\bcomments?\b/gi, "ကွန်မန့်"],
  [/\btutorials?\b/gi, "ကျူတိုရီရယ်"],
  [/\bcontents?\b/gi, "ကွန်တန့်"],
  [/\bupdates?\b/gi, "အပ်ဒိတ်"],
  [/\blinks?\b/gi, "လင့်ခ်"],
  [/\bapps?\b/gi, "အက်ပ်"],
  [/\bpro\b/gi, "ပရို"],
  [/\bplus\b/gi, "ပလပ်စ်"],
  [/\bpromotions?\b/gi, "ပရိုမိုးရှင်း"],
  [/\bpromo\b/gi, "ပရိုမိုးရှင်း"],
  [/\bdiscounts?\b/gi, "ဒစ်စကောင့်"],
  [/\boriginal\b/gi, "အော်ဂျင်နယ်"],
  [/\bfacebook\b/gi, "ဖေ့စ်ဘွတ်ခ်"],
  [/\btiktok\b/gi, "တစ်တော့ခ်"],
  [/\bquality\b/gi, "ကွာလတီ"],
  [/\breviews?\b/gi, "ရီဗျူး"],
  [/\binbox\b/gi, "အင်ဘောက်စ်"],
  [/\bib\b/gi, "အင်ဘောက်စ်"],
  [/\breels?\b/gi, "ရီးလ်စ်"],
  [/\blive\b/gi, "လိုက်ဖ်"],
  [/\bcod\b/gi, "စီအိုဒီ"],
  [/\b(?:kbzpay|kpay)\b/gi, "ကေပေး"],
  [/\bwavepay\b/gi, "ဝေ့ဖ်ပေး"],
  [/\bvip\b/gi, "ဗီအိုင်ပီ"],
  [/\bdm\b/gi, "ဒီအမ်"],
  [/\bygn\b/gi, "ရန်ကုန်"],
  [/\bmdy\b/gi, "မန္တလေး"],
  [/\bnpt\b/gi, "နေပြည်တော်"],
  [/\b(?:ph|tel)\s*[:.]\s*/gi, "ဖုန်းနံပါတ် "],
  [/\bno\.\s*/gi, "နံပါတ် "],
  [/\bqty\b/gi, "အရေအတွက်"],
  [/\bpcs\b/gi, "ခု"],
  [/\bkg\b/gi, "ကီလိုဂရမ်"],
  [/\bml\b/gi, "မီလီလီတာ"],
  [/\bhrs?\b/gi, "နာရီ"],
  [/\bmins?\b/gi, "မိနစ်"],
  [/\bsecs?\b/gi, "စက္ကန့်"],
  [/\betc\.?/gi, "စသည်ဖြင့်"],
  [/\bvs\.?/gi, "နှင့်"],
]

export interface PronunciationRule {
  word: string
  phonetic: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function applyCustomPronunciations(
  text: string,
  rules: ReadonlyArray<PronunciationRule>
): string {
  if (!text || rules.length === 0) return text

  const sorted = [...rules]
    .filter((r) => r.word.trim() && r.phonetic.trim())
    .sort((a, b) => b.word.trim().length - a.word.trim().length)

  let result = text
  for (const rule of sorted) {
    const word = rule.word.trim()
    const phonetic = rule.phonetic.trim()
    const escaped = escapeRegExp(word)
    const isAsciiWord = /^[\x20-\x7E]+$/.test(word) && /[a-zA-Z0-9]/.test(word)
    const pattern = isAsciiWord
      ? new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "gi")
      : new RegExp(escaped, "g")
    result = result.replace(pattern, phonetic)
  }
  return result
}

/**
 * Normalize Burmese script text for clear, natural TTS pronunciation:
 * - Strips markdown, emojis, and bracketed timestamps/section tags
 * - Applies user's custom pronunciation dictionary
 * - Transliterates common English e-commerce/tech terms to phonetic Burmese
 * - Converts Arabic numbers, prices, currencies, and percentages to spoken Burmese
 * - Converts slashes, pipes, and hyphens into natural Burmese pauses
 */
export function normalizeBurmeseForTTS(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>
): string {
  if (!rawText || !rawText.trim()) return ""

  let text = rawText
    // Remove pause tags so single-segment TTS never reads them aloud
    .replace(/\[pause\s+\d+(?:\.\d+)?\s*s?\]/gi, " ")
    // Remove bracketed timestamps like [0-3s], [0-3s Hook], [0:00 - 0:05] without deleting spoken text
    .replace(
      /\[\s*\d+(?::\d+)?\s*(?:s\b|:\d+|\s*[-–—]\s*\d+(?::\d+)?\s*s?)(?:\s+[a-zA-Z0-9\s,&/-]{1,40})?\s*\]/gi,
      " "
    )
    // Remove standalone unbracketed timestamp ranges like 0:00 - 0:05
    .replace(/(?:^|\s)\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}(?=\s|$)/gm, " ")
    // Remove exact section-only tags like [Hook], [Body], [CTA], [Intro], [Outro], [Scene 1]
    .replace(/\[(hook|body|cta|intro|outro|scene\s*\d*)\]/gi, " ")
    // Remove emojis, pictographs, variation selectors, and ZWJ sequences
    .replace(/(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3)/gu, "")
    // Remove markdown headings, bold/italic markers, backticks, underscores, tildes
    .replace(/[*#`_~]/g, "")
    // Remove bullet symbols and leading list dashes
    .replace(/^\s*[-•–—]+\s+/gm, "")
    .replace(/•/g, " ")

  const rulesToApply =
    customRules ?? useContentStore.getState().customPronunciations ?? []
  if (rulesToApply.length > 0) {
    text = applyCustomPronunciations(text, rulesToApply)
  }

  // Transliterate common English e-commerce & tech terms before hyphen-to-pause conversion
  for (const [pattern, phonetic] of ENGLISH_TO_BURMESE_PHONETICS) {
    text = text.replace(pattern, phonetic)
  }

  // Convert Myanmar digits (၀-၉) to Arabic digits (0-9) so unified number parsing handles both
  text = myanmarDigitsToArabic(text)

  // Expand shorthand k/K thousands (e.g. 15k -> 15000, 1.5k -> 1500)
  text = text.replace(/(?<![\d.])(\d+(?:\.\d+)?)\s*[kK]\b/g, (_match, num: string) => {
    const parsed = Number.parseFloat(num)
    if (!Number.isFinite(parsed)) return _match
    return String(Math.round(parsed * 1000))
  })

  // Convert percentages (special case 100% -> ရာနှုန်းပြည့်)
  text = text.replace(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)\s*%/g, (_match, num: string) => {
    if (num.replace(/,/g, "") === "100") {
      return "ရာနှုန်းပြည့်"
    }
    return `${numericStringToBurmeseWords(num)} ရာခိုင်နှုန်း`
  })

  // Convert currency-annotated prices
  text = text
    .replace(
      /(?:Ks|MMK|Kyats?|ကျပ်)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:Ks|MMK|Kyats?|ကျပ်)\b/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ကျပ်`
    )
    .replace(
      /(?:USD|\$)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဒေါ်လာ`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:USD|\$)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဒေါ်လာ`
    )
    .replace(
      /(?:THB|฿|Baht)\s*(\d[\d,]*(?:\.\d+)?)/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဘတ်`
    )
    .replace(
      /(\d[\d,]*(?:\.\d+)?)\s*(?:THB|฿|Baht)\b/gi,
      (_match, num: string) => `${numericStringToBurmeseWords(num)} ဘတ်`
    )

  // Convert remaining Arabic numbers into spoken Burmese
  text = text.replace(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)(?![\d.])/g, (_match, num: string) =>
    numericStringToBurmeseWords(num)
  )

  // Convert slashes, pipes, commas, semicolons, and hyphens into natural Burmese breath pauses
  text = text
    .replace(/\.{2,}|…/g, "။ ")
    .replace(/\s*\|\s*/g, "။ ")
    .replace(/\s*\/\s*/g, "၊ ")
    .replace(/\s*[-–—]+\s*/g, "၊ ")
    .replace(/[;,]\s*/g, "၊ ")
    .replace(/\s*([၊။])\s*/g, "$1 ")
    .replace(/([၊။])(?:\s*[၊။])+/g, "$1 ")

  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function getSavedGeminiApiKey(): string {
  const fromStore = useUIStore.getState().apiKeys.gemini?.trim()
  if (fromStore) return fromStore
  if (typeof window !== "undefined") {
    try {
      return (
        window.localStorage.getItem("cc_api_key_gemini")?.trim() ||
        window.localStorage.getItem("gemini_api_key")?.trim() ||
        ""
      )
    } catch {
      return ""
    }
  }
  return ""
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const TTS_SAMPLE_RATE = 24000
export const TTS_NUM_CHANNELS = 1
export const TTS_BITS_PER_SAMPLE = 16
export const TTS_BYTE_RATE = (TTS_SAMPLE_RATE * TTS_NUM_CHANNELS * TTS_BITS_PER_SAMPLE) / 8

function parsePcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i)
  if (match && match[1]) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return TTS_SAMPLE_RATE
}

interface ParsedWavPcm {
  pcmBytes: Uint8Array
  sampleRate: number
  numChannels: number
  bitsPerSample: number
}

function isRiffWaveHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 44 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45 // E
  )
}

/**
 * Strip the RIFF/WAV header (44 bytes or extended chunks) and extract raw PCM payload
 * along with its format metadata. Returns null if bytes are not a valid PCM WAV.
 */
function extractPcmFromWavBytes(bytes: Uint8Array): ParsedWavPcm | null {
  if (!isRiffWaveHeader(bytes)) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let audioFormat = 1
  let numChannels = TTS_NUM_CHANNELS
  let sampleRate = TTS_SAMPLE_RATE
  let bitsPerSample = TTS_BITS_PER_SAMPLE
  let foundFmt = false
  let pcmBytes: Uint8Array | null = null

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    )
    const chunkSize = view.getUint32(offset + 4, true)
    const payloadStart = offset + 8

    if (id === "fmt " && payloadStart + 16 <= bytes.byteLength) {
      audioFormat = view.getUint16(payloadStart, true)
      numChannels = view.getUint16(payloadStart + 2, true)
      sampleRate = view.getUint32(payloadStart + 4, true)
      bitsPerSample = view.getUint16(payloadStart + 14, true)
      foundFmt = true
    } else if (id === "data") {
      const payloadEnd =
        chunkSize > 0 ? Math.min(bytes.byteLength, payloadStart + chunkSize) : bytes.byteLength
      pcmBytes = bytes.subarray(payloadStart, payloadEnd)
      break
    }

    const paddedSize = chunkSize + (chunkSize % 2)
    const nextOffset = payloadStart + paddedSize
    if (nextOffset <= offset) break
    offset = nextOffset
  }

  if (!pcmBytes) {
    pcmBytes = bytes.subarray(44)
  }

  if (foundFmt && (audioFormat !== 1 || bitsPerSample !== 16)) {
    return null
  }

  return {
    pcmBytes,
    sampleRate: sampleRate > 0 ? sampleRate : TTS_SAMPLE_RATE,
    numChannels: numChannels > 0 ? numChannels : TTS_NUM_CHANNELS,
    bitsPerSample: bitsPerSample > 0 ? bitsPerSample : TTS_BITS_PER_SAMPLE,
  }
}

/**
 * Normalize raw 16-bit signed LE PCM to consistent 24000Hz mono 16-bit PCM
 * so concatenated chunks never shift pitch/speed mid-audio.
 */
function normalizePcmTo24kMono(
  pcmBytes: Uint8Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const bytesPerFrame = Math.max(1, numChannels) * 2
  const usableBytes = pcmBytes.byteLength - (pcmBytes.byteLength % bytesPerFrame)
  if (usableBytes <= 0) return new Uint8Array(0)

  const aligned = usableBytes === pcmBytes.byteLength ? pcmBytes : pcmBytes.subarray(0, usableBytes)
  if (sampleRate === TTS_SAMPLE_RATE && numChannels === TTS_NUM_CHANNELS) {
    return aligned
  }

  const view = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength)
  const frameCount = usableBytes / bytesPerFrame
  const mono = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i += 1) {
    let sum = 0
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = view.getInt16((i * numChannels + ch) * 2, true)
      sum += sample / 32768
    }
    mono[i] = sum / numChannels
  }

  if (sampleRate === TTS_SAMPLE_RATE) {
    const outBytes = new Uint8Array(frameCount * 2)
    const outView = new DataView(outBytes.buffer)
    for (let i = 0; i < frameCount; i += 1) {
      const clamped = Math.max(-1, Math.min(1, mono[i]))
      outView.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return outBytes
  }

  const targetFrames = Math.max(1, Math.round((frameCount * TTS_SAMPLE_RATE) / sampleRate))
  const outBytes = new Uint8Array(targetFrames * 2)
  const outView = new DataView(outBytes.buffer)
  const ratio = sampleRate / TTS_SAMPLE_RATE

  for (let i = 0; i < targetFrames; i += 1) {
    const srcPos = i * ratio
    const idx0 = Math.min(frameCount - 1, Math.floor(srcPos))
    const idx1 = Math.min(frameCount - 1, idx0 + 1)
    const frac = srcPos - idx0
    const interpolated = mono[idx0] * (1 - frac) + mono[idx1] * frac
    const clamped = Math.max(-1, Math.min(1, interpolated))
    outView.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return outBytes
}

/**
 * Wrap raw 16-bit signed little-endian PCM bytes in a standard 44-byte RIFF/WAV header
 * so browsers can play and decode it natively.
 */
function pcmToWavBlob(
  pcmBytes: Uint8Array,
  sampleRate = TTS_SAMPLE_RATE,
  numChannels = TTS_NUM_CHANNELS,
  bitsPerSample = TTS_BITS_PER_SAMPLE
): Blob {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmBytes.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, 44).set(pcmBytes)
  return new Blob([buffer], { type: "audio/wav" })
}

/**
 * Concatenate multiple 24kHz 16-bit mono PCM buffers sequentially with a brief
 * silence gap and write a single accurate 44-byte RIFF/WAV header.
 */
function concatenatePcmBuffersToWav(pcmChunks: Uint8Array[], gapMs = 120): Blob {
  const nonEmpty = pcmChunks.filter((c) => c.byteLength > 0)
  if (nonEmpty.length === 0) {
    return pcmToWavBlob(new Uint8Array(0), TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }
  if (nonEmpty.length === 1) {
    return pcmToWavBlob(nonEmpty[0], TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }

  const gapSamples = Math.max(0, Math.floor((TTS_SAMPLE_RATE * gapMs) / 1000))
  const gapBytes = gapSamples * 2
  const totalDataLength =
    nonEmpty.reduce((sum, chunk) => sum + chunk.byteLength, 0) + gapBytes * (nonEmpty.length - 1)

  const buffer = new ArrayBuffer(44 + totalDataLength)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + totalDataLength, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, TTS_NUM_CHANNELS, true)
  view.setUint32(24, TTS_SAMPLE_RATE, true)
  view.setUint32(28, TTS_BYTE_RATE, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, TTS_BITS_PER_SAMPLE, true)
  writeString(36, "data")
  view.setUint32(40, totalDataLength, true)

  const out = new Uint8Array(buffer, 44)
  let offset = 0
  for (let i = 0; i < nonEmpty.length; i += 1) {
    const chunk = nonEmpty[i]
    out.set(chunk, offset)
    offset += chunk.byteLength
    if (i < nonEmpty.length - 1) {
      // ArrayBuffer is zero-initialized, so advancing offset leaves clean 16-bit PCM silence
      offset += gapBytes
    }
  }

  return new Blob([buffer], { type: "audio/wav" })
}

async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  try {
    return await decodeAudioBlob(blob)
  } catch (err) {
    if (err instanceof TtsError) throw err
    throw new TtsError(
      err instanceof Error ? err.message : "Could not decode synthesized audio."
    )
  }
}

function getSpeedPromptInstruction(speed: VoiceoverSpeed): string {
  switch (speed) {
    case 0.85:
      return "Speak at a calm, unhurried, deliberate pace (0.85x speed)."
    case 0.9:
      return "Speak at a slightly slower, relaxed, clear pace (0.9x speed)."
    case 1.1:
      return "Speak at a slightly brisk, energetic social-media pace (1.1x speed)."
    case 1.15:
      return "Speak at a lively, confident, brisk pace (1.15x speed)."
    case 1.2:
      return "Speak at a fast, engaging, punchy TikTok/Reels pace (1.2x speed)."
    default:
      return "Speak at a natural, conversational pace (1.0x speed)."
  }
}

export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"
export const GEMINI_SPEECH_PREP_MODEL = "gemini-2.5-flash"

/**
 * Fast speech-normalization pass using Gemini 2.5 Flash (when an API key is configured)
 * to convert numbers, years, currency, abbreviations, and symbols into natural spoken
 * Burmese words and place natural breath pauses (`၊` and `။`) at clause boundaries.
 * Always falls back cleanly to deterministic `normalizeBurmeseForTTS`.
 */
export async function prepareBurmeseSpeechText(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>,
  useAiSpeechPrep = true
): Promise<string> {
  const deterministic = normalizeBurmeseForTTS(rawText, customRules)
  if (!deterministic || !useAiSpeechPrep || deterministic.length > 1800) return deterministic

  const apiKey = getSavedGeminiApiKey()
  if (!apiKey) return deterministic

  // Apply custom rules & strip formatting first, but pass the pre-number-normalized
  // text to Flash only if rawText has digits/abbreviations/long unpunctuated clauses,
  // or pass deterministic text so Flash can refine breath pauses (`၊`, `။`) and phrasing.
  const controller = new AbortController()
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), 5500)
      : undefined

  try {
    const cleanKey = apiKey.trim()
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SPEECH_PREP_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`
    const prepPrompt = [
      "You are a Burmese (Myanmar) speech-normalization preprocessor for Text-to-Speech.",
      "Rewrite the input text ONLY for natural spoken Burmese TTS delivery:",
      "1. Convert any remaining numbers, years, prices, currencies, percentages, and symbols into natural spoken Burmese words (e.g., 2026 -> နှစ်ထောင့်နှစ်ဆယ့်ခြောက်, 100% -> ရာနှုန်းပြည့်, 15,000 -> တစ်သောင်းငါးထောင်).",
      "2. Expand common abbreviations into spoken Burmese.",
      "3. Ensure natural Burmese breath pauses using `၊` (comma pause) and `။` (sentence end pause) at natural clause boundaries so sentences are never rushed or slurred.",
      "4. Keep the exact meaning and words—do NOT summarize, translate, or add intro/commentary. Return ONLY the normalized Burmese speech text.",
      "",
      deterministic,
    ].join("\n")

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cleanKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prepPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    })

    if (!response.ok) return deterministic

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }
    const output = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim()

    if (!output) return deterministic
    // Run deterministic pass once more to guarantee no stray digits/markdown remain
    const finalClean = normalizeBurmeseForTTS(output, customRules)
    return finalClean || deterministic
  } catch {
    return deterministic
  } finally {
    if (timeoutId !== undefined && typeof window !== "undefined") {
      window.clearTimeout(timeoutId)
    }
  }
}

/**
 * Split long scripts cleanly at sentence boundaries (`။` / `.` / newlines / punctuation)
 * so each TTS chunk (max ~360 chars, safely under Gemini's ~24s / 450-char truncation limit)
 * synthesizes reliably and can be stitched seamlessly.
 */
export function splitScriptIntoChunks(text: string, maxChunkChars = 360): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkChars) return [normalized]

  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const pushHardSplit = (segment: string, out: string[]) => {
    const chars = Array.from(segment)
    for (let i = 0; i < chars.length; i += maxChunkChars) {
      const piece = chars.slice(i, i + maxChunkChars).join("").trim()
      if (piece) out.push(piece)
    }
  }

  const sentences: string[] = []
  for (const line of lines) {
    // Split on Burmese full stop (။) or standard sentence terminators while keeping delimiter
    const parts = line.split(/(?<=[။.!?])\s*/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (trimmed.length <= maxChunkChars) {
        sentences.push(trimmed)
      } else {
        // Fallback split at Burmese comma (၊), comma, or whitespace
        const subParts = trimmed.split(/(?<=[၊,])\s*/)
        let subCurrent = ""
        for (const sub of subParts) {
          const subTrimmed = sub.trim()
          if (!subTrimmed) continue
          if (subTrimmed.length > maxChunkChars) {
            if (subCurrent.trim()) {
              sentences.push(subCurrent.trim())
              subCurrent = ""
            }
            const words = subTrimmed.split(/\s+/)
            if (words.length > 1) {
              let wordBuf = ""
              for (const w of words) {
                if (w.length > maxChunkChars) {
                  if (wordBuf.trim()) {
                    sentences.push(wordBuf.trim())
                    wordBuf = ""
                  }
                  pushHardSplit(w, sentences)
                } else if (wordBuf && wordBuf.length + w.length + 1 > maxChunkChars) {
                  sentences.push(wordBuf.trim())
                  wordBuf = w
                } else {
                  wordBuf = wordBuf ? `${wordBuf} ${w}` : w
                }
              }
              if (wordBuf.trim()) {
                sentences.push(wordBuf.trim())
              }
            } else {
              pushHardSplit(subTrimmed, sentences)
            }
            continue
          }

          if (subCurrent && subCurrent.length + subTrimmed.length + 1 > maxChunkChars) {
            sentences.push(subCurrent.trim())
            subCurrent = subTrimmed
          } else {
            subCurrent = subCurrent ? `${subCurrent} ${subTrimmed}` : subTrimmed
          }
        }
        if (subCurrent.trim()) {
          sentences.push(subCurrent.trim())
        }
      }
    }
  }

  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChunkChars) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks
}

function audioBufferTo24kMonoPcm(audioBuffer: AudioBuffer): Uint8Array {
  const length = audioBuffer.length
  const channelCount = audioBuffer.numberOfChannels
  const mono = new Float32Array(length)

  for (let i = 0; i < length; i += 1) {
    let sample = 0
    for (let ch = 0; ch < channelCount; ch += 1) {
      sample += audioBuffer.getChannelData(ch)[i] ?? 0
    }
    mono[i] = sample / Math.max(1, channelCount)
  }

  const srcRate = audioBuffer.sampleRate
  if (srcRate === TTS_SAMPLE_RATE) {
    const pcmBytes = new Uint8Array(length * 2)
    const view = new DataView(pcmBytes.buffer)
    for (let i = 0; i < length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, mono[i]))
      view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return pcmBytes
  }

  const targetFrames = Math.max(1, Math.round((length * TTS_SAMPLE_RATE) / srcRate))
  const pcmBytes = new Uint8Array(targetFrames * 2)
  const view = new DataView(pcmBytes.buffer)
  const ratio = srcRate / TTS_SAMPLE_RATE
  for (let i = 0; i < targetFrames; i += 1) {
    const srcPos = i * ratio
    const idx0 = Math.min(length - 1, Math.floor(srcPos))
    const idx1 = Math.min(length - 1, idx0 + 1)
    const frac = srcPos - idx0
    const interpolated = mono[idx0] * (1 - frac) + mono[idx1] * frac
    const clamped = Math.max(-1, Math.min(1, interpolated))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return pcmBytes
}

function encodeAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length
  const pcmBytes = new Uint8Array(length * 2)
  const view = new DataView(pcmBytes.buffer)

  // Mix down to mono 16-bit signed PCM
  const channelCount = audioBuffer.numberOfChannels
  for (let i = 0; i < length; i += 1) {
    let sample = 0
    for (let ch = 0; ch < channelCount; ch += 1) {
      sample += audioBuffer.getChannelData(ch)[i] ?? 0
    }
    sample /= Math.max(1, channelCount)
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return pcmToWavBlob(pcmBytes, sampleRate, numChannels, 16)
}

export async function concatenateAudioBlobsToWav(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    return pcmToWavBlob(new Uint8Array(0), TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
  }
  if (blobs.length === 1) return blobs[0]

  const pcmChunks: Uint8Array[] = []
  let ctx: AudioContext | null = null

  try {
    for (const blob of blobs) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const parsedWav = extractPcmFromWavBytes(bytes)
      if (parsedWav) {
        const normalized = normalizePcmTo24kMono(
          parsedWav.pcmBytes,
          parsedWav.sampleRate,
          parsedWav.numChannels
        )
        if (normalized.byteLength > 0) {
          pcmChunks.push(normalized)
        }
        continue
      }

      if (!ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) {
          throw new TtsError("Web Audio API is not supported in this browser.")
        }
        ctx = new AudioCtx()
      }

      const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0))
      const normalized = audioBufferTo24kMonoPcm(decoded)
      if (normalized.byteLength > 0) {
        pcmChunks.push(normalized)
      }
    }

    return concatenatePcmBuffersToWav(pcmChunks, 120)
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {})
    }
  }
}

async function synthesizeGeminiChunk(
  chunkText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string
): Promise<
  | { kind: "pcm"; pcmBytes: Uint8Array; sampleRate: number }
  | { kind: "blob"; blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }
> {
  const cleanKey = apiKey.trim()
  const standardUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`
  const tonePreset = VOICE_DELIVERY_PRESETS[deliveryTone]
  const narratorName = preset.id === "male" ? "သီဟ (Thiha)" : "နီလာ (Nilar)"

  const prompt = [
    `You are ${narratorName}, a native Yangon Myanmar (Burmese) professional voiceover narrator.`,
    tonePreset.styleInstruction,
    "Pronunciation & Prosody Direction: Speak in clear, articulate, warm native Yangon Myanmar pronunciation with crisp consonant endings (အသတ်သံများ ပီသကြည်လင်စွာ) and accurate Burmese tonal contours. Use natural Yangon spoken intonation—never stiff, robotic, or English-accented cadence.",
    `Pacing & Breath Pauses: Pause briefly and naturally after every \`၊\` and take a full, calm breath pause after every \`။\` so sentences are never rushed or slurred. ${getSpeedPromptInstruction(speed)}`,
    "Read ONLY the following Burmese script aloud. Do not add any intro, commentary, or extra words.",
    "",
    chunkText,
  ].join("\n")

  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": cleanKey,
  }
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: preset.geminiVoice,
          },
        },
      },
    },
  })

  let response: Response | null = null
  const maxAttempts = 2
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    response = null
    if (cleanKey.startsWith("AQ.")) {
      const vertexUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(cleanKey)}`
      try {
        const vertexRes = await fetch(vertexUrl, {
          method: "POST",
          headers,
          body: requestBody,
        })
        if (vertexRes.ok) {
          response = vertexRes
        }
      } catch {
        // Fall back to generativelanguage.googleapis.com
      }
    }

    if (!response) {
      try {
        response = await fetch(standardUrl, {
          method: "POST",
          headers,
          body: requestBody,
        })
      } catch (err) {
        if (attempt === maxAttempts - 1) throw err
      }
    }

    if (response?.ok) break
    if (attempt < maxAttempts - 1 && (!response || response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
      continue
    }
    break
  }

  if (!response) {
    throw new TtsError("Gemini audio generation failed: network error.")
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    throw new TtsError(`Gemini audio generation failed (${response.status}): ${errText.slice(0, 180)}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string }
        }>
      }
    }>
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const audioPart = parts.find((part) => part.inlineData?.data)
  if (!audioPart?.inlineData?.data) {
    throw new TtsError("Gemini did not return audio data.")
  }

  const rawMime = (audioPart.inlineData.mimeType || "audio/L16;rate=24000").toLowerCase()
  const bytes = base64ToUint8Array(audioPart.inlineData.data)

  if (rawMime.includes("mp3") || rawMime.includes("mpeg")) {
    const mp3Blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" })
    return { kind: "blob", blob: mp3Blob, mimeType: "audio/mpeg", fileExtension: "mp3" }
  }

  // Strip any 44-byte (or extended) RIFF/WAV header if Gemini returned WAV-wrapped PCM,
  // and normalize to consistent 24000Hz 16-bit mono PCM.
  const parsedWav = extractPcmFromWavBytes(bytes)
  if (parsedWav) {
    const normalizedPcm = normalizePcmTo24kMono(
      parsedWav.pcmBytes,
      parsedWav.sampleRate,
      parsedWav.numChannels
    )
    return { kind: "pcm", pcmBytes: normalizedPcm, sampleRate: TTS_SAMPLE_RATE }
  }

  const sampleRate = parsePcmSampleRate(rawMime)
  const normalizedPcm = normalizePcmTo24kMono(bytes, sampleRate, 1)
  return { kind: "pcm", pcmBytes: normalizedPcm, sampleRate: TTS_SAMPLE_RATE }
}

async function synthesizeWithGemini(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  apiKey: string,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void
): Promise<{ blob: Blob; mimeType: string; fileExtension: "wav" | "mp3" }> {
  const chunks = splitScriptIntoChunks(cleanedText, 420)
  const chunkResults = []
  for (let i = 0; i < chunks.length; i += 1) {
    onChunkProgress?.(i + 1, chunks.length)
    chunkResults.push(await synthesizeGeminiChunk(chunks[i], preset, speed, deliveryTone, apiKey))
  }

  if (chunkResults.length === 1) {
    const single = chunkResults[0]
    if (single.kind === "pcm") {
      return {
        blob: pcmToWavBlob(single.pcmBytes, TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE),
        mimeType: "audio/wav",
        fileExtension: "wav",
      }
    }
    return { blob: single.blob, mimeType: single.mimeType, fileExtension: single.fileExtension }
  }

  if (chunkResults.every((r) => r.kind === "pcm")) {
    const pcmChunks = chunkResults.map((r) => (r.kind === "pcm" ? r.pcmBytes : new Uint8Array(0)))
    return {
      blob: concatenatePcmBuffersToWav(pcmChunks, 120),
      mimeType: "audio/wav",
      fileExtension: "wav",
    }
  }

  const blobs = chunkResults.map((r) =>
    r.kind === "pcm"
      ? pcmToWavBlob(r.pcmBytes, TTS_SAMPLE_RATE, TTS_NUM_CHANNELS, TTS_BITS_PER_SAMPLE)
      : r.blob
  )
  const mergedWav = await concatenateAudioBlobsToWav(blobs)
  return { blob: mergedWav, mimeType: "audio/wav", fileExtension: "wav" }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function formatEdgeRate(speed: VoiceoverSpeed): string {
  const delta = Math.round((speed - 1.0) * 100)
  return delta >= 0 ? `+${delta}%` : `${delta}%`
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`
}

async function synthesizeWithNeuralTts(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed
): Promise<{ blob: Blob; mimeType: string; fileExtension: "mp3" }> {
  const endpoint =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"

  return new Promise((resolve, reject) => {
    let settled = false
    const chunks: Uint8Array[] = []
    let ws: WebSocket | null = null

    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      try {
        ws?.close()
      } catch {
        // Ignore close errors
      }
      reject(new TtsError("Neural TTS request timed out."))
    }, 15000)

    const cleanup = () => {
      window.clearTimeout(timeout)
    }

    try {
      ws = new WebSocket(endpoint)
      ws.binaryType = "arraybuffer"
    } catch (err) {
      cleanup()
      reject(new TtsError(err instanceof Error ? err.message : "Failed to connect to Neural TTS."))
      return
    }

    ws.onopen = () => {
      if (!ws) return
      const timestamp = new Date().toISOString()
      const requestId = generateRequestId()

      const configMessage = [
        `X-Timestamp:${timestamp}`,
        "Content-Type:application/json; charset=utf-8",
        "Path:speech.config",
        "",
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        }),
      ].join("\r\n")

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='my-MM'><voice name='${preset.neuralVoice}'><prosody rate='${formatEdgeRate(speed)}' pitch='+0Hz'>${escapeXml(cleanedText)}</prosody></voice></speak>`

      const ssmlMessage = [
        `X-RequestId:${requestId}`,
        "Content-Type:application/ssml+xml",
        `X-Timestamp:${timestamp}`,
        "Path:ssml",
        "",
        ssml,
      ].join("\r\n")

      ws.send(configMessage)
      ws.send(ssmlMessage)
    }

    ws.onmessage = (event) => {
      if (settled) return

      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          settled = true
          cleanup()
          try {
            ws?.close()
          } catch {
            // Ignore close errors
          }
          if (chunks.length === 0) {
            reject(new TtsError("Neural TTS returned empty audio."))
            return
          }
          const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0)
          const merged = new Uint8Array(totalBytes)
          let offset = 0
          for (const chunk of chunks) {
            merged.set(chunk, offset)
            offset += chunk.byteLength
          }
          const blob = new Blob([merged.buffer as ArrayBuffer], { type: "audio/mpeg" })
          resolve({ blob, mimeType: "audio/mpeg", fileExtension: "mp3" })
        }
        return
      }

      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data)
        if (event.data.byteLength < 2) return
        const headerLength = view.getUint16(0, false)
        const payloadOffset = 2 + headerLength
        if (payloadOffset < event.data.byteLength) {
          chunks.push(new Uint8Array(event.data, payloadOffset))
        }
      }
    }

    ws.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new TtsError("Neural TTS WebSocket connection failed."))
    }

    ws.onclose = () => {
      if (settled) return
      settled = true
      cleanup()
      if (chunks.length === 0) {
        reject(new TtsError("Neural TTS connection closed before audio completed."))
      }
    }
  })
}

function synthesizeWithSpeechSynthesis(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed
): { blob: Blob; mimeType: string; fileExtension: "wav" } {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new TtsError("Browser speech synthesis is not supported in this environment.")
  }

  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(cleanedText)
  utterance.lang = "my-MM"
  utterance.rate = speed
  utterance.pitch = preset.id === "female" ? 1.05 : 0.95

  const voices = synth.getVoices()
  const burmeseVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("my"))
  if (burmeseVoices.length > 0) {
    const preferred = burmeseVoices.find((v) =>
      preset.id === "female"
        ? /nilar|female|woman/i.test(v.name)
        : /thiha|male|man/i.test(v.name)
    )
    utterance.voice = preferred ?? burmeseVoices[0]
  }

  synth.speak(utterance)

  // Produce a valid 24kHz mono WAV container matching estimated duration so audio players
  // and downstream Video Merger decode cleanly without errors.
  const estimatedSeconds = Math.max(1.5, Math.min(30, (cleanedText.length * 0.08) / speed))
  const sampleRate = 24000
  const sampleCount = Math.floor(sampleRate * estimatedSeconds)
  const silentPcm = new Uint8Array(sampleCount * 2)
  const wavBlob = pcmToWavBlob(silentPcm, sampleRate, 1, 16)
  return { blob: wavBlob, mimeType: "audio/wav", fileExtension: "wav" }
}

export interface VoiceoverProgress {
  currentChunk: number
  totalChunks: number
}

export interface GenerateVoiceoverOptions {
  deliveryTone?: VoiceDeliveryTone
  customPronunciations?: ReadonlyArray<PronunciationRule>
  introSfx?: SoundEffectType
  useAiSpeechPrep?: boolean
  onStageChange?: (stage: "preparing" | "generating") => void
  onProgress?: (progress: VoiceoverProgress) => void
}

const MYANMAR_DIGIT_MAP = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"] as const

export function toBurmeseDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => MYANMAR_DIGIT_MAP[Number(d)] ?? d)
}

export function formatAudioClockDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * Parse a script containing `[pause 0.5s]`, `[pause 1s]`, `[pause 2s]` markers
 * into ordered speech and pause segments.
 */
export function parseScriptWithPauses(rawText: string): ScriptSegment[] {
  if (!rawText || !rawText.trim()) return []
  const regex = /\[pause\s+(\d+(?:\.\d+)?)\s*s?\]/gi
  const segments: ScriptSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawText)) !== null) {
    const preceding = rawText.slice(lastIndex, match.index).trim()
    if (preceding) {
      segments.push({ kind: "speech", text: preceding })
    }
    const parsedSec = Number.parseFloat(match[1])
    if (Number.isFinite(parsedSec) && parsedSec > 0) {
      segments.push({ kind: "pause", seconds: Math.min(5, Math.max(0.1, parsedSec)) })
    }
    lastIndex = match.index + match[0].length
  }

  const trailing = rawText.slice(lastIndex).trim()
  if (trailing) {
    segments.push({ kind: "speech", text: trailing })
  }
  return segments
}

/**
 * Normalize Burmese script for TTS while preserving `[pause Xs]` markers
 * so the user's manual timing tags stay intact in the editor.
 */
export function optimizeScriptPreservingPauses(
  rawText: string,
  customRules?: ReadonlyArray<PronunciationRule>
): string {
  const segments = parseScriptWithPauses(rawText)
  if (segments.length === 0) return ""
  return segments
    .map((seg) => {
      if (seg.kind === "pause") {
        const label = Number.isInteger(seg.seconds) ? `${seg.seconds}` : seg.seconds.toFixed(1)
        return `[pause ${label}s]`
      }
      return normalizeBurmeseForTTS(seg.text, customRules)
    })
    .filter(Boolean)
    .join(" ")
}

/**
 * Generate procedural mono PCM samples for short intro/accent sound effects
 * using Web Audio math (zero external audio files required).
 */
export function synthesizeSfxSamples(sfx: SoundEffectType, sampleRate: number): Float32Array {
  if (sfx === "none") return new Float32Array(0)

  if (sfx === "pop") {
    const duration = 0.11
    const length = Math.floor(sampleRate * duration)
    const out = new Float32Array(length)
    let phase = 0
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate
      const progress = t / duration
      const freq = 580 * Math.pow(0.28, progress)
      phase += (2 * Math.PI * freq) / sampleRate
      const env = Math.sin(Math.min(1, t / 0.008) * (Math.PI / 2)) * Math.exp(-progress * 6.5)
      out[i] = Math.sin(phase) * env * 0.55
    }
    return out
  }

  if (sfx === "whoosh") {
    const duration = 0.34
    const length = Math.floor(sampleRate * duration)
    const out = new Float32Array(length)
    let lp = 0
    let hpPrev = 0
    let hpOut = 0
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate
      const progress = t / duration
      const noise = Math.random() * 2 - 1
      const cutoff = 350 + Math.sin(progress * Math.PI) * 2100
      const alpha = Math.min(0.95, (2 * Math.PI * cutoff) / sampleRate)
      lp = lp + alpha * (noise - lp)
      hpOut = 0.96 * (hpOut + lp - hpPrev)
      hpPrev = lp
      const env = Math.sin(progress * Math.PI)
      out[i] = Math.max(-1, Math.min(1, hpOut * env * 0.65))
    }
    return out
  }

  // cash_ding: bright dual-harmonic bell chime
  const duration = 0.48
  const length = Math.floor(sampleRate * duration)
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const attack = Math.min(1, t / 0.005)
    const decay1 = Math.exp(-t * 7.5)
    const decay2 = Math.exp(-t * 10.5)
    const tone1 = Math.sin(2 * Math.PI * 1318.5 * t) * 0.45 * decay1
    const tone2 = Math.sin(2 * Math.PI * 1975.5 * t) * 0.32 * decay2
    const tone3 = Math.sin(2 * Math.PI * 2637.0 * t) * 0.18 * decay2
    out[i] = (tone1 + tone2 + tone3) * attack * 0.55
  }
  return out
}

export async function playSoundEffectPreview(sfx: SoundEffectType): Promise<void> {
  if (sfx === "none" || typeof window === "undefined") return
  const unlocked = unlockIosAudio()
  const AudioCtx = getAudioContextConstructor()
  if (!AudioCtx && !unlocked) return

  const ctx = unlocked && unlocked.state !== "closed" ? unlocked : new AudioCtx!()
  const shouldClose = ctx !== unlocked
  try {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
    const samples = synthesizeSfxSamples(sfx, ctx.sampleRate)
    if (samples.length === 0) return
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    buffer.getChannelData(0).set(samples)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(0)
    await new Promise<void>((resolve) => {
      src.onended = () => resolve()
      window.setTimeout(resolve, Math.ceil((samples.length / ctx.sampleRate) * 1000) + 80)
    })
  } finally {
    if (shouldClose) {
      await ctx.close().catch(() => {})
    }
  }
}

async function synthesizeSpeechSegmentBlob(
  cleanedText: string,
  preset: BurmeseVoicePreset,
  speed: VoiceoverSpeed,
  deliveryTone: VoiceDeliveryTone,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void
): Promise<{
  blob: Blob
  mimeType: string
  fileExtension: "wav" | "mp3"
  voiceName: string
  provider: "gemini" | "neural-tts" | "speech-synthesis"
}> {
  const geminiKey = getSavedGeminiApiKey()

  if (geminiKey) {
    try {
      const geminiResult = await synthesizeWithGemini(
        cleanedText,
        preset,
        speed,
        deliveryTone,
        geminiKey,
        onChunkProgress
      )
      return {
        ...geminiResult,
        voiceName: `${preset.label} · Gemini`,
        provider: "gemini",
      }
    } catch {
      // Silently fall back to free Myanmar Neural TTS on any Gemini error
    }
  }

  try {
    const neuralChunks = splitScriptIntoChunks(cleanedText, 200)
    let neuralBlob: Blob
    let neuralMime = "audio/mpeg"
    let neuralExt: "mp3" | "wav" = "mp3"

    if (neuralChunks.length <= 1) {
      onChunkProgress?.(1, 1)
      const single = await synthesizeWithNeuralTts(cleanedText, preset, speed)
      neuralBlob = single.blob
      neuralMime = single.mimeType
      neuralExt = single.fileExtension
    } else {
      const chunkBlobs: Blob[] = []
      for (let i = 0; i < neuralChunks.length; i += 1) {
        onChunkProgress?.(i + 1, neuralChunks.length)
        const res = await synthesizeWithNeuralTts(neuralChunks[i], preset, speed)
        chunkBlobs.push(res.blob)
      }
      neuralBlob = await concatenateAudioBlobsToWav(chunkBlobs)
      neuralMime = "audio/wav"
      neuralExt = "wav"
    }

    return {
      blob: neuralBlob,
      mimeType: neuralMime,
      fileExtension: neuralExt,
      voiceName: `${preset.label} · ${preset.neuralVoice}`,
      provider: "neural-tts",
    }
  } catch {
    onChunkProgress?.(1, 1)
    const speechResult = synthesizeWithSpeechSynthesis(cleanedText, preset, speed)
    return {
      ...speechResult,
      voiceName: `${preset.label} · Browser Speech`,
      provider: "speech-synthesis",
    }
  }
}

async function assembleSegmentsWithPausesAndSfx(
  timeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  >,
  introSfx: SoundEffectType
): Promise<{ blob: Blob; audioBuffer: AudioBuffer }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    throw new TtsError("Web Audio API is not supported in this browser.")
  }

  const ctx = new AudioCtx()
  try {
    const decodedItems: Array<
      | { kind: "speech"; buffer: AudioBuffer }
      | { kind: "pause"; seconds: number }
    > = []
    let sampleRate = 24000

    for (const item of timeline) {
      if (item.kind === "pause") {
        decodedItems.push(item)
      } else {
        const buf = await ctx.decodeAudioData(await item.blob.arrayBuffer())
        sampleRate = buf.sampleRate
        decodedItems.push({ kind: "speech", buffer: buf })
      }
    }

    const sfxSamples = synthesizeSfxSamples(introSfx, sampleRate)
    const sfxLeadSamples = sfxSamples.length > 0 ? Math.floor(sampleRate * 0.16) : 0

    let speechTotalSamples = 0
    for (const item of decodedItems) {
      if (item.kind === "pause") {
        speechTotalSamples += Math.floor(item.seconds * sampleRate)
      } else {
        speechTotalSamples += item.buffer.length
      }
    }

    const totalSamples = Math.max(
      sfxSamples.length,
      sfxLeadSamples + speechTotalSamples
    )
    const merged = ctx.createBuffer(1, Math.max(1, totalSamples), sampleRate)
    const out = merged.getChannelData(0)

    if (sfxSamples.length > 0) {
      for (let i = 0; i < sfxSamples.length && i < out.length; i += 1) {
        out[i] = Math.max(-1, Math.min(1, out[i] + sfxSamples[i]))
      }
    }

    let offset = sfxLeadSamples
    for (const item of decodedItems) {
      if (item.kind === "pause") {
        offset += Math.floor(item.seconds * sampleRate)
        continue
      }
      const ch0 = item.buffer.getChannelData(0)
      for (let i = 0; i < ch0.length && offset + i < out.length; i += 1) {
        out[offset + i] = Math.max(-1, Math.min(1, out[offset + i] + ch0[i]))
      }
      offset += item.buffer.length
    }

    const wavBlob = encodeAudioBufferToWavBlob(merged)
    return { blob: wavBlob, audioBuffer: merged }
  } finally {
    await ctx.close().catch(() => {})
  }
}

/**
 * Generate a playable Burmese AI voiceover from a timed or markdown script.
 * Supports `[pause 0.5s]`, `[pause 1s]`, `[pause 2s]` markers and optional
 * Web Audio intro sound effects (`pop`, `whoosh`, `cash_ding`).
 * Tier 1: Gemini dedicated TTS (`gemini-2.5-flash-preview-tts`) when an API key is configured.
 * Tier 2: Free Myanmar Neural TTS (`my-MM-NilarNeural` / `my-MM-ThihaNeural`).
 * Tier 3: Browser Speech Synthesis fallback.
 */
export async function generateBurmeseVoiceover(
  scriptText: string,
  voiceType: BurmeseVoiceType = "female",
  speed: VoiceoverSpeed = 1.0,
  options: GenerateVoiceoverOptions = {}
): Promise<VoiceoverResult> {
  const deliveryTone = options.deliveryTone ?? "storytelling"
  const introSfx = options.introSfx ?? "none"
  const useAiSpeechPrep = options.useAiSpeechPrep ?? true
  const preset = BURMESE_VOICE_PRESETS[voiceType]

  options.onStageChange?.("preparing")

  const rawSegments = parseScriptWithPauses(scriptText)
  const normalizedTimeline: Array<
    | { kind: "speech"; text: string }
    | { kind: "pause"; seconds: number }
  > = []

  for (const seg of rawSegments) {
    if (seg.kind === "pause") {
      if (normalizedTimeline.length > 0) {
        normalizedTimeline.push(seg)
      }
    } else {
      const normalized = await prepareBurmeseSpeechText(
        seg.text,
        options.customPronunciations,
        useAiSpeechPrep
      )
      if (normalized) {
        normalizedTimeline.push({ kind: "speech", text: normalized })
      }
    }
  }

  options.onStageChange?.("generating")

  // Trim trailing pauses
  while (
    normalizedTimeline.length > 0 &&
    normalizedTimeline[normalizedTimeline.length - 1].kind === "pause"
  ) {
    normalizedTimeline.pop()
  }

  const speechSegments = normalizedTimeline.filter(
    (item): item is { kind: "speech"; text: string } => item.kind === "speech"
  )
  if (speechSegments.length === 0) {
    throw new TtsError("Voiceover script is empty after removing timestamps and formatting.")
  }

  const combinedCleanedText = speechSegments.map((s) => s.text).join(" ")
  const hasPauses = normalizedTimeline.some((item) => item.kind === "pause")
  const onProgress = options.onProgress

  // Fast path: single speech segment and no SFX
  if (!hasPauses && introSfx === "none" && speechSegments.length === 1) {
    const single = await synthesizeSpeechSegmentBlob(
      speechSegments[0].text,
      preset,
      speed,
      deliveryTone,
      onProgress
        ? (currentChunk, totalChunks) => onProgress({ currentChunk, totalChunks })
        : undefined
    )
    const audioBuffer = await decodeBlobToAudioBuffer(single.blob)
    const audioUrl = URL.createObjectURL(single.blob)
    return {
      audioUrl,
      blob: single.blob,
      audioBuffer,
      mimeType: single.mimeType,
      fileExtension: single.fileExtension,
      durationSeconds: audioBuffer.duration,
      voiceName: single.voiceName,
      provider: single.provider,
      cleanedText: combinedCleanedText,
    }
  }

  // Multi-segment (with pauses) and/or intro SFX path
  const segmentChunkCounts = speechSegments.map((seg) => splitScriptIntoChunks(seg.text, 420).length)
  const totalChunksAllSegments = Math.max(
    1,
    segmentChunkCounts.reduce((sum, count) => sum + count, 0)
  )
  let completedChunksBeforeSegment = 0

  const audioTimeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  > = []

  let lastVoiceName = `${preset.label} · ${preset.neuralVoice}`
  let lastProvider: VoiceoverResult["provider"] = "neural-tts"
  let speechIdx = 0

  for (const item of normalizedTimeline) {
    if (item.kind === "pause") {
      audioTimeline.push(item)
    } else {
      const segBase = completedChunksBeforeSegment
      const segChunksCount = segmentChunkCounts[speechIdx] ?? 1
      const res = await synthesizeSpeechSegmentBlob(
        item.text,
        preset,
        speed,
        deliveryTone,
        onProgress
          ? (currentChunk, totalChunks) => {
              const scaled =
                totalChunks === segChunksCount
                  ? segBase + currentChunk
                  : segBase + Math.min(segChunksCount, Math.ceil((currentChunk / Math.max(1, totalChunks)) * segChunksCount))
              onProgress({
                currentChunk: Math.min(totalChunksAllSegments, Math.max(1, scaled)),
                totalChunks: totalChunksAllSegments,
              })
            }
          : undefined
      )
      completedChunksBeforeSegment += segChunksCount
      speechIdx += 1
      lastVoiceName = res.voiceName
      lastProvider = res.provider
      audioTimeline.push({ kind: "speech", blob: res.blob })
    }
  }

  const assembled = await assembleSegmentsWithPausesAndSfx(audioTimeline, introSfx)
  const audioUrl = URL.createObjectURL(assembled.blob)
  return {
    audioUrl,
    blob: assembled.blob,
    audioBuffer: assembled.audioBuffer,
    mimeType: "audio/wav",
    fileExtension: "wav",
    durationSeconds: assembled.audioBuffer.duration,
    voiceName: lastVoiceName,
    provider: lastProvider,
    cleanedText: combinedCleanedText,
  }
}

export interface DialogueTurn {
  speaker: BurmeseVoiceType
  text: string
}

const FEMALE_LABEL_RE = /^(?:nilar|နီလာ|female|speaker\s*1|a)\s*[:：]\s*/i
const MALE_LABEL_RE = /^(?:thiha|သီဟ|male|speaker\s*2|b)\s*[:：]\s*/i

export function parseDialogueTurns(rawScript: string): DialogueTurn[] {
  const lines = rawScript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const turns: DialogueTurn[] = []
  let nextAlternating: BurmeseVoiceType = "female"

  for (const line of lines) {
    let speaker: BurmeseVoiceType
    let text: string
    if (FEMALE_LABEL_RE.test(line)) {
      speaker = "female"
      text = line.replace(FEMALE_LABEL_RE, "").trim()
    } else if (MALE_LABEL_RE.test(line)) {
      speaker = "male"
      text = line.replace(MALE_LABEL_RE, "").trim()
    } else {
      speaker = nextAlternating
      text = line
    }
    if (!text) continue
    turns.push({ speaker, text })
    nextAlternating = speaker === "female" ? "male" : "female"
  }

  return turns
}

/**
 * Dual-Voice Dialogue Mode: alternates between Nilar (Female) and Thiha (Male)
 * for conversational scripts, inserting natural 0.35s pauses between turns.
 */
export async function generateBurmeseDialogueVoiceover(
  scriptText: string,
  speed: VoiceoverSpeed = 1.0,
  options: GenerateVoiceoverOptions = {}
): Promise<VoiceoverResult> {
  const turns = parseDialogueTurns(scriptText)
  if (turns.length === 0) {
    throw new TtsError("Dialogue script is empty.")
  }

  const deliveryTone = options.deliveryTone ?? "storytelling"
  const introSfx = options.introSfx ?? "none"
  const useAiSpeechPrep = options.useAiSpeechPrep ?? true
  const onProgress = options.onProgress

  options.onStageChange?.("preparing")

  const timeline: Array<
    | { kind: "speech"; blob: Blob }
    | { kind: "pause"; seconds: number }
  > = []

  const cleanedParts: string[] = []
  let lastProvider: VoiceoverResult["provider"] = "neural-tts"

  options.onStageChange?.("generating")
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i]
    onProgress?.({ currentChunk: i + 1, totalChunks: turns.length })
    const res = await generateBurmeseVoiceover(turn.text, turn.speaker, speed, {
      deliveryTone,
      introSfx: "none",
      customPronunciations: options.customPronunciations,
      useAiSpeechPrep,
    })
    lastProvider = res.provider
    cleanedParts.push(`${turn.speaker === "female" ? "Nilar" : "Thiha"}: ${res.cleanedText}`)
    timeline.push({ kind: "speech", blob: res.blob })
    URL.revokeObjectURL(res.audioUrl)
    if (i < turns.length - 1) {
      timeline.push({ kind: "pause", seconds: 0.35 })
    }
  }

  const assembled = await assembleSegmentsWithPausesAndSfx(timeline, introSfx)
  const audioUrl = URL.createObjectURL(assembled.blob)
  return {
    audioUrl,
    blob: assembled.blob,
    audioBuffer: assembled.audioBuffer,
    mimeType: "audio/wav",
    fileExtension: "wav",
    durationSeconds: assembled.audioBuffer.duration,
    voiceName: "Nilar + Thiha (Dialogue)",
    provider: lastProvider,
    cleanedText: cleanedParts.join("\n"),
  }
}

export type StandaloneBgMusicPreset =
  | "none"
  | "lofi_chill"
  | "calm_lofi"
  | "upbeat_promo"
  | "soft_piano"
  | "soft_vlog"

function synthesizeAmbientLoopBuffer(
  ctx: BaseAudioContext,
  preset: Exclude<StandaloneBgMusicPreset, "none">,
  durationSeconds: number
): AudioBuffer {
  const normalizedPreset: "lofi_chill" | "upbeat_promo" | "soft_piano" =
    preset === "calm_lofi"
      ? "lofi_chill"
      : preset === "soft_vlog"
        ? "soft_piano"
        : preset

  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.ceil(durationSeconds * sampleRate))
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  const chords: Record<"lofi_chill" | "upbeat_promo" | "soft_piano", number[][]> = {
    lofi_chill: [
      [220, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 349.23],
      [164.81, 196.0, 246.94, 293.66],
    ],
    upbeat_promo: [
      [261.63, 329.63, 392.0],
      [293.66, 369.99, 440.0],
      [220.0, 261.63, 329.63],
      [246.94, 311.13, 392.0],
    ],
    soft_piano: [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [196.0, 246.94, 293.66, 392.0],
    ],
  }

  const progression = chords[normalizedPreset]
  const barSec = normalizedPreset === "upbeat_promo" ? 1.5 : 2.5

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate
    const chordIdx = Math.floor(t / barSec) % progression.length
    const chord = progression[chordIdx]
    const barPos = (t % barSec) / barSec
    const env = Math.sin(Math.min(1, barPos * 4) * (Math.PI / 2)) * (1 - 0.35 * barPos)
    let sample = 0
    for (let n = 0; n < chord.length; n += 1) {
      sample += Math.sin(2 * Math.PI * chord[n] * t) / chord.length
    }
    data[i] = sample * env * 0.35
  }

  return buffer
}

/**
 * Mix a voiceover Blob with optional background music using Web Audio API GainNode
 * auto-ducking so music smoothly lowers during speech and rises during pauses.
 */
export async function mixVoiceoverWithAutoDuckingMusic(params: {
  voiceoverBlob: Blob
  musicPreset: StandaloneBgMusicPreset | "custom"
  customMusicFile?: File | null
  musicVolume?: number
}): Promise<{
  audioUrl: string
  blob: Blob
  audioBuffer: AudioBuffer
  durationSeconds: number
}> {
  const voiceBuffer = await decodeBlobToAudioBuffer(params.voiceoverBlob)
  const sampleRate = voiceBuffer.sampleRate
  const totalSamples = voiceBuffer.length
  const durationSeconds = voiceBuffer.duration

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  if (!OfflineCtx) {
    throw new Error("OfflineAudioContext is not supported in this browser.")
  }

  const offlineCtx = new OfflineCtx(1, totalSamples, sampleRate)

  const voiceSrc = offlineCtx.createBufferSource()
  voiceSrc.buffer = voiceBuffer
  voiceSrc.connect(offlineCtx.destination)

  let musicBuffer: AudioBuffer
  if (params.musicPreset === "custom" && params.customMusicFile) {
    musicBuffer = await decodeBlobToAudioBuffer(params.customMusicFile)
  } else {
    const preset =
      params.musicPreset === "none" || params.musicPreset === "custom"
        ? "lofi_chill"
        : params.musicPreset
    musicBuffer = synthesizeAmbientLoopBuffer(offlineCtx, preset, durationSeconds + 0.5)
  }

  const musicSrc = offlineCtx.createBufferSource()
  musicSrc.buffer = musicBuffer
  musicSrc.loop = true

  const musicGain = offlineCtx.createGain()
  const baseVol = Math.max(0.05, Math.min(0.8, params.musicVolume ?? 0.3))
  const duckedVol = baseVol * 0.22

  // Compute 100ms RMS speech envelope for GainNode auto-ducking
  const voiceChannel = voiceBuffer.getChannelData(0)
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.1))
  musicGain.gain.setValueAtTime(baseVol, 0)

  for (let start = 0; start < voiceChannel.length; start += windowSize) {
    const end = Math.min(voiceChannel.length, start + windowSize)
    let sumSq = 0
    for (let i = start; i < end; i += 1) {
      sumSq += voiceChannel[i] * voiceChannel[i]
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start))
    const targetGain = rms > 0.015 ? duckedVol : baseVol
    const timeSec = Math.min(durationSeconds, (start + windowSize * 0.5) / sampleRate)
    musicGain.gain.linearRampToValueAtTime(targetGain, timeSec)
  }

  musicSrc.connect(musicGain)
  musicGain.connect(offlineCtx.destination)

  voiceSrc.start(0)
  musicSrc.start(0)
  musicSrc.stop(durationSeconds)

  const rendered = await offlineCtx.startRendering()
  const wavBlob = encodeMonoWav16Bit(rendered.getChannelData(0), rendered.sampleRate)
  const audioUrl = URL.createObjectURL(wavBlob)

  return {
    audioUrl,
    blob: wavBlob,
    audioBuffer: rendered,
    durationSeconds: rendered.duration,
  }
}

