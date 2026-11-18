import { DEFAULT_MODELS, useUIStore } from "@/store/useUIStore"

export const GEMINI_MODEL = "gemini-3.5-flash-lite"
export const GEMINI_VISION_MODEL = "gemini-2.5-flash"
export const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite"
export const QUOTA_EXCEEDED_MESSAGE =
  "Daily/minute API quota exceeded. Please switch model in Settings or wait a moment."
export const OPENROUTER_BUSY_MESSAGE =
  "OpenRouter free models are busy right now. Please try again in 30 seconds or switch to Gemini with VPN."

export class ApiError extends Error {
  status: number
  isQuotaExceeded: boolean

  constructor(status: number, message: string, isQuotaExceeded = false) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.isQuotaExceeded = isQuotaExceeded
  }
}

function parseApiError(provider: string, status: number, rawText: string): ApiError {
  let extractedMessage = ""
  let isQuota = status === 429

  if (rawText) {
    try {
      const parsed = JSON.parse(rawText)
      const err = parsed.error ?? parsed

      if (typeof err === "string") {
        extractedMessage = err
      } else if (err && typeof err === "object") {
        if (typeof err.message === "string") {
          extractedMessage = err.message
        } else if (typeof parsed.message === "string") {
          extractedMessage = parsed.message
        } else if (Array.isArray(parsed.errors) && parsed.errors[0]?.message) {
          extractedMessage = String(parsed.errors[0].message)
        }

        if (
          err.status === "RESOURCE_EXHAUSTED" ||
          err.code === 429 ||
          err.code === "rate_limit_exceeded" ||
          err.type === "rate_limit_exceeded"
        ) {
          isQuota = true
        }
      }
    } catch {
      // Not JSON
      if (rawText.includes("<html") || rawText.includes("<!DOCTYPE")) {
        extractedMessage = `Server error (${status})`
      } else {
        extractedMessage = rawText.trim()
      }
    }
  }

  const lower = (extractedMessage + " " + rawText).toLowerCase()
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("tokens per minute") ||
    lower.includes("requests per minute") ||
    lower.includes("requests per day")
  ) {
    isQuota = true
  }

  if (isQuota) {
    return new ApiError(status || 429, QUOTA_EXCEEDED_MESSAGE, true)
  }

  if (
    status === 401 ||
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key")
  ) {
    return new ApiError(
      status,
      `Invalid API key for ${provider}. Please check your API key in Settings.`,
      false
    )
  }

  const cleanMessage = extractedMessage ? extractedMessage.replace(/\s+/g, " ").trim() : ""
  const finalMessage = cleanMessage
    ? `${provider} error (${status}): ${cleanMessage}`
    : `${provider} error (${status}): Request failed`

  return new ApiError(status, finalMessage, false)
}

export type AIProvider = "gemini" | "groq" | "openrouter"

export interface GenerateContentRequest {
  topic: string
  platform: string
  contentType: string
  tone: string
  language: string
  includeHashtags: boolean
  instruction?: string
  currentContent?: string
}

export interface GeneratedContent {
  id: string
  topic: string
  platform: string
  contentType: string
  tone: string
  content: string
  createdAt: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const SYSTEM_PROMPT = `You are an expert social media copywriter and content strategist.
You create engaging, platform-native content in English, Myanmar (Burmese), or bilingual (Myanmar + English).

Rules:
- Write naturally for the selected platform (Facebook, TikTok, YouTube, Instagram, Telegram).
- Match the requested tone exactly.
- If the language is "myanmar" or "my":
  - Write 100% in natural Myanmar (Burmese) Unicode script, even if the Topic is written in English.
  - Write ALL video script labels and stage directions in Burmese (use "မြင်ကွင်း:", "အသံ:", "ဖန်သားပြင်စာသား:", "ပြောစကား:" instead of English "(Visual - ...)", "(Sound - ...)", "(Audio - ...)", or "[Visual Cue]").
  - Keep international tech, product, and platform brand names (e.g., Redmi, iPhone, Samsung, TikTok, Facebook, Instagram, YouTube, Telegram) in their original English spelling rather than phonetic Burmese transliteration.
- If the language is "bilingual", blend Myanmar and English naturally while keeping international brand names in English.
- When includeHashtags is true, append relevant hashtags at the end.
- NEVER use raw Markdown formatting symbols such as *, **, ***, # headings, or backticks. Output clean plain text ready to copy-paste directly onto Facebook or TikTok.
- Keep formatting clean with short paragraphs, line breaks, and emoji where appropriate.
- Output only the final content, no preamble or meta commentary.`

function sanitizePlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildUserPrompt(request: GenerateContentRequest): string {
  const hashtagInstruction = request.includeHashtags
    ? "Include relevant hashtags at the end."
    : "Do not include hashtags."
  const isMyanmarOnly = request.language === "myanmar" || request.language === "my"
  const myanmarRules = isMyanmarOnly
    ? "\nStrict Myanmar Rules: Write 100% in natural Burmese script (even if the topic is in English). Use Burmese script labels like မြင်ကွင်း:, အသံ:, ဖန်သားပြင်စာသား:, ပြောစကား: instead of English stage directions. Keep international brand names (e.g., Redmi, iPhone, Samsung, TikTok, Facebook) in English spelling. Do NOT use Markdown symbols (*, **, # headings)."
    : "\nFormatting Rule: Output clean plain text with no Markdown symbols (*, **, # headings)."

  if (request.instruction && request.currentContent) {
    return `Task: ${request.instruction}
Target Platform: ${request.platform}
Target Content Type: ${request.contentType}
Tone: ${request.tone}
Output Language: ${request.language}
${hashtagInstruction}${myanmarRules}

Current content to transform:
"""
${request.currentContent}
"""

Output only the final transformed content now.`
  }

  return `Platform: ${request.platform}
Content type: ${request.contentType}
Tone: ${request.tone}
Language: ${request.language}
Topic: ${request.topic}
${hashtagInstruction}${myanmarRules}
Write the content now.`
}

function mockGenerate(request: GenerateContentRequest): GeneratedContent {
  const isMyanmar = request.language === "myanmar" || request.language === "bilingual"
  const greeting = isMyanmar
    ? request.language === "bilingual"
      ? "Hello / Mingalaba!\n\n"
      : "မင်္ဂလာပါ!\n\n"
    : "Hello!\n\n"
  const body = `Here is a ${request.tone} ${request.contentType.replace(
    "_",
    " "
  )} for "${request.topic}" on ${request.platform}.\n\n`
  const closing = isMyanmar
    ? request.language === "bilingual"
      ? "\n#Myanmar #Content #${request.platform}"
      : "\n#မյանမာ # content #${request.platform}"
    : `\n#${request.platform} #ContentCreator #SocialMedia`
  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content:
      greeting +
      body +
      "This is a mock AI response. Add your API key in Settings to connect to a real AI provider." +
      closing,
    createdAt: new Date().toISOString(),
  }
}

const PREFERRED_OPENROUTER_FREE_VISION_MODELS = [
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
] as const

const OPENROUTER_MODELS_CACHE_TTL_MS = 10 * 60 * 1000
let openRouterFreeVisionCache: {
  models: string[]
  fetchedAt: number
} | null = null
let openRouterFreeVisionInFlight: Promise<string[]> | null = null

interface OpenRouterModelEntry {
  id?: unknown
  architecture?: {
    modality?: unknown
    input_modalities?: unknown
  }
}

function isFreeVisionModel(entry: OpenRouterModelEntry): entry is OpenRouterModelEntry & { id: string } {
  if (typeof entry.id !== "string" || !entry.id.endsWith(":free")) {
    return false
  }
  const inputModalities = entry.architecture?.input_modalities
  if (
    Array.isArray(inputModalities) &&
    inputModalities.some((m) => typeof m === "string" && m.toLowerCase() === "image")
  ) {
    return true
  }
  const modality = entry.architecture?.modality
  return typeof modality === "string" && modality.toLowerCase().includes("image")
}

function prioritizeOpenRouterVisionModels(models: string[]): string[] {
  const unique = Array.from(new Set(models))
  const preferredOrder = new Map<string, number>(
    PREFERRED_OPENROUTER_FREE_VISION_MODELS.map((id, idx) => [id, idx])
  )
  return unique.sort((a, b) => {
    const aRank = preferredOrder.get(a)
    const bRank = preferredOrder.get(b)
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank
    if (aRank !== undefined) return -1
    if (bRank !== undefined) return 1
    return 0
  })
}

async function getActiveOpenRouterFreeVisionModels(): Promise<string[]> {
  const now = Date.now()
  if (
    openRouterFreeVisionCache &&
    now - openRouterFreeVisionCache.fetchedAt < OPENROUTER_MODELS_CACHE_TTL_MS
  ) {
    return openRouterFreeVisionCache.models
  }

  if (openRouterFreeVisionInFlight) {
    return openRouterFreeVisionInFlight
  }

  openRouterFreeVisionInFlight = (async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
      })
      if (!res.ok) {
        throw new Error(`OpenRouter models fetch failed (${res.status})`)
      }
      const payload = (await res.json()) as { data?: OpenRouterModelEntry[] }
      const discovered = Array.isArray(payload.data)
        ? payload.data.filter(isFreeVisionModel).map((entry) => entry.id)
        : []
      const prioritized = prioritizeOpenRouterVisionModels(discovered)
      if (prioritized.length > 0) {
        openRouterFreeVisionCache = {
          models: prioritized,
          fetchedAt: Date.now(),
        }
        return prioritized
      }
    } catch (err) {
      console.warn("Failed to discover live OpenRouter free vision models; using defaults.", err)
    } finally {
      openRouterFreeVisionInFlight = null
    }
    return [...PREFERRED_OPENROUTER_FREE_VISION_MODELS]
  })()

  return openRouterFreeVisionInFlight
}

function shouldFallbackOpenRouterModel(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.status === 402 ||
      err.status === 404 ||
      err.status === 429 ||
      err.status === 502 ||
      err.status === 503 ||
      err.isQuotaExceeded
    )
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes("402") ||
      msg.includes("insufficient credits") ||
      msg.includes("404") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503")
    )
  }
  return false
}

const GROQ_VISION_FALLBACK_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
const GROQ_TEXT_ONLY_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
])

function resolveGroqVisionModel(model: string): string {
  const trimmed = model.trim()
  if (!trimmed || GROQ_TEXT_ONLY_MODELS.has(trimmed)) {
    return GROQ_VISION_FALLBACK_MODEL
  }
  return trimmed
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 429 || err.isQuotaExceeded
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota")
  }
  return false
}

async function callOpenRouterWithFallback<T>(
  primaryModel: string,
  callFn: (model: string) => Promise<T>,
  options?: { isTextOnly?: boolean }
): Promise<T> {
  const normalizedPrimary = primaryModel.trim()
  const liveVisionModels = await getActiveOpenRouterFreeVisionModels()
  const fallbackPool = options?.isTextOnly
    ? [...liveVisionModels, "openrouter/free"]
    : liveVisionModels

  const rawCandidates =
    !normalizedPrimary || normalizedPrimary === "openrouter/auto"
      ? fallbackPool
      : [normalizedPrimary, ...fallbackPool]
  const modelsToTry = Array.from(new Set(rawCandidates))

  let lastError: unknown
  let sawRateLimit = false
  for (const candidateModel of modelsToTry) {
    try {
      return await callFn(candidateModel)
    } catch (err) {
      lastError = err
      if (isRateLimitError(err)) {
        sawRateLimit = true
      }
      if (!shouldFallbackOpenRouterModel(err)) {
        throw err
      }
      console.warn(
        `OpenRouter model "${candidateModel}" failed (${err instanceof ApiError ? err.status : "error"}). Retrying with next free fallback model...`
      )
    }
  }
  if (sawRateLimit) {
    throw new ApiError(429, OPENROUTER_BUSY_MESSAGE, true)
  }
  throw lastError
}

function isLocationUnsupportedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.toLowerCase().includes("user location is not supported") &&
    (err instanceof ApiError ? err.status === 400 : true)
  )
}

function getAiConfig() {
  const { aiProvider, apiKeys, models } = useUIStore.getState()
  const envGeminiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
  const envOpenRouterKey =
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? ""

  const resolvedApiKeys = {
    gemini: apiKeys.gemini.trim() || envGeminiKey,
    openrouter: apiKeys.openrouter.trim() || envOpenRouterKey,
    groq: apiKeys.groq.trim(),
  }

  const rawModel = models[aiProvider]?.trim() || ""
  const resolvedModel =
    aiProvider === "gemini" && rawModel === "gemini-2.5-flash-lite"
      ? GEMINI_FALLBACK_MODEL
      : rawModel || DEFAULT_MODELS[aiProvider]

  return {
    provider: aiProvider,
    apiKey: resolvedApiKeys[aiProvider],
    apiKeys: resolvedApiKeys,
    model: resolvedModel,
    models: {
      ...models,
      [aiProvider]: resolvedModel,
    },
  }
}

async function generateWithGemini(
  request: GenerateContentRequest,
  apiKey: string,
  model: string
): Promise<GeneratedContent> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: buildUserPrompt(request) }] }],
    generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = sanitizePlainText(
    parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
  )

  if (!content) {
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? `No content returned from Gemini API (finishReason: ${finishReason}).`
        : "No content returned from Gemini API."
    )
  }

  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content,
    createdAt: new Date().toISOString(),
  }
}

async function generateWithOpenAICompatible(
  request: GenerateContentRequest,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<GeneratedContent> {
  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(request) },
    ],
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 2048,
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "Content Creator SaaS"
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const providerName = provider === "groq" ? "Groq" : "OpenRouter"
    throw parseApiError(providerName, res.status, text)
  }

  const data = await res.json()
  const content = sanitizePlainText(
    data.choices?.[0]?.message?.content ?? ""
  )

  if (!content) {
    throw new Error(`No content returned from ${provider} API.`)
  }

  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    platform: request.platform,
    contentType: request.contentType,
    tone: request.tone,
    content,
    createdAt: new Date().toISOString(),
  }
}

export async function generateContent(
  request: GenerateContentRequest
): Promise<GeneratedContent> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(1000)
    return mockGenerate(request)
  }

  try {
    if (provider === "gemini") {
      const primaryModel = model || GEMINI_MODEL
      try {
        return await generateWithGemini(request, trimmedKey, primaryModel)
      } catch (err) {
        if (isLocationUnsupportedError(err) && apiKeys.openrouter) {
          console.warn("Gemini location unsupported. Falling back to OpenRouter...")
          return await callOpenRouterWithFallback(
            models.openrouter || DEFAULT_MODELS.openrouter,
            (candidateModel) =>
              generateWithOpenAICompatible(request, "openrouter", apiKeys.openrouter, candidateModel),
            { isTextOnly: true }
          )
        }
        const isQuota =
          (err instanceof ApiError && err.isQuotaExceeded) ||
          (err instanceof Error &&
            (err.message === QUOTA_EXCEEDED_MESSAGE ||
              err.message.includes("429") ||
              err.message.includes("RESOURCE_EXHAUSTED") ||
              err.message.toLowerCase().includes("quota")))

        if (isQuota && primaryModel !== GEMINI_FALLBACK_MODEL) {
          console.warn(
            `Gemini quota exceeded for "${primaryModel}". Automatically falling back to "${GEMINI_FALLBACK_MODEL}"...`
          )
          return await generateWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
        }
        throw err
      }
    }

    if (provider === "openrouter") {
      return await callOpenRouterWithFallback(
        model || DEFAULT_MODELS.openrouter,
        (candidateModel) =>
          generateWithOpenAICompatible(request, "openrouter", trimmedKey, candidateModel),
        { isTextOnly: true }
      )
    }

    return await generateWithOpenAICompatible(
      request,
      provider,
      trimmedKey,
      model || "llama-3.3-70b-versatile"
    )
  } catch (err) {
    console.error(`AI generation failed via ${provider}`, err)
    throw err
  }
}

export type PhotoCategoryKey =
  | "tech"
  | "flash_sale"
  | "new_arrival"
  | "fashion"
  | "food"

export interface PhotoSuggestionRequest {
  imageBase64: string
  mimeType: string
  language: "en" | "my"
  category?: PhotoCategoryKey
}

export interface PhotoSuggestionResult {
  headline: string
  spec1: string
  spec2: string
  spec3: string
  suggestedPrice: string
  caption: string
}

function stripMarkdownArtifacts(text: string, allowHashtags = false): string {
  let cleaned = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").replace(/\*/g, "")
  if (allowHashtags) {
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, "")
  } else {
    cleaned = cleaned.replace(/#/g, "")
  }
  return cleaned.trim()
}

function parsePhotoSuggestionResponse(raw: string): PhotoSuggestionResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as {
      headline?: string
      spec1?: string
      spec2?: string
      spec3?: string
      suggestedPrice?: string
      caption?: string
    }
    if (typeof parsed.headline === "string" || typeof parsed.caption === "string") {
      return {
        headline: stripMarkdownArtifacts(parsed.headline ?? ""),
        spec1: stripMarkdownArtifacts(parsed.spec1 ?? ""),
        spec2: stripMarkdownArtifacts(parsed.spec2 ?? ""),
        spec3: stripMarkdownArtifacts(parsed.spec3 ?? ""),
        suggestedPrice: stripMarkdownArtifacts(parsed.suggestedPrice ?? ""),
        caption: stripMarkdownArtifacts(parsed.caption ?? "", true),
      }
    }
  } catch {
    // Fallback if model returned plain text instead of JSON
  }

  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean)
  const headline = stripMarkdownArtifacts(lines[0] ?? "")
  const caption = stripMarkdownArtifacts(lines.slice(1).join("\n") || cleaned, true)
  return {
    headline,
    spec1: "",
    spec2: "",
    spec3: "",
    suggestedPrice: "",
    caption,
  }
}

const PHOTO_CATEGORY_GUIDANCE: Record<PhotoCategoryKey, string> = {
  tech: "Tech & Gadgets (smartphones, laptops, electronics). Focus spec1, spec2, spec3 on concise hardware/warranty specs (e.g., '8GB / 256GB', '5000mAh', '1 Year Warranty').",
  flash_sale:
    "Flash Sale & Discount (limited-time promotion). Emphasize urgency and savings in headline and specs (e.g., 'Save 30%', 'Today Only', 'Free Delivery').",
  new_arrival:
    "New Arrival (newly launched product showcase). Highlight freshness, key feature, and availability.",
  fashion:
    "Fashion & Beauty (apparel, skincare, cosmetics, lifestyle). Highlight style, texture/material, or skin/fit benefits.",
  food: "Food & Drink (cafes, restaurants, snacks, beverages). Highlight taste, freshness, and fast delivery.",
}

function buildPhotoPrompt(
  language: "en" | "my",
  category: PhotoCategoryKey = "new_arrival"
): string {
  const categoryGuide = PHOTO_CATEGORY_GUIDANCE[category]

  if (language === "my") {
    return `You are a Myanmar social media marketing expert. Look at this product photo carefully.
Selected Business Category: ${categoryGuide}

Generate a JSON object with these exact 6 keys:
1. "headline": A short, punchy poster headline (3 to 7 words max) in natural Myanmar (Burmese) Unicode script.
2. "spec1": Short highlight pill #1 (2 to 4 words, max 22 characters).
3. "spec2": Short highlight pill #2 (2 to 4 words, max 22 characters).
4. "spec3": Short highlight pill #3 (2 to 4 words, max 22 characters).
5. "suggestedPrice": A realistic price tag string for Myanmar market (e.g., "45,000 Ks") or "" if unclear.
6. "caption": A ready-to-post Facebook/Instagram caption in natural Myanmar (Burmese) Unicode script with relevant emojis and 3-5 hashtags at the end.

CRITICAL RULES:
- When writing in Burmese, keep ALL international brand names, model names, and technical terms (e.g., Redmi, iPhone, Samsung, Pro Max, 5G, OLED, SPF, Latte) in their original English spelling. NEVER transliterate brand or model names phonetically into Burmese.
- Do NOT use raw Markdown symbols (* or #) in headline, spec1, spec2, spec3, or suggestedPrice.
- Do NOT use Markdown * or # heading syntax in caption (only normal #hashtags at the end).
- Return ONLY valid JSON.`
  }

  return `You are a social media marketing expert. Look at this product photo carefully.
Selected Business Category: ${categoryGuide}

Generate a JSON object with these exact 6 keys:
1. "headline": A short, punchy poster headline (3 to 7 words max) in English.
2. "spec1": Short highlight pill #1 (2 to 4 words, max 22 characters).
3. "spec2": Short highlight pill #2 (2 to 4 words, max 22 characters).
4. "spec3": Short highlight pill #3 (2 to 4 words, max 22 characters).
5. "suggestedPrice": A realistic price tag string (e.g., "45,000 Ks" or "$29.99") or "" if unclear.
6. "caption": A ready-to-post Facebook/Instagram caption in English with relevant emojis and 3-5 hashtags at the end.

CRITICAL RULES:
- Do NOT use raw Markdown symbols (* or #) in headline, spec1, spec2, spec3, or suggestedPrice.
- Do NOT use Markdown * or # heading syntax in caption (only normal #hashtags at the end).
- Return ONLY valid JSON.`
}

async function suggestPhotoWithGemini(
  request: PhotoSuggestionRequest,
  apiKey: string,
  model: string
): Promise<PhotoSuggestionResult> {
  const base64Data = request.imageBase64.replace(/^data:[^;]+;base64,/, "")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: request.mimeType || "image/jpeg",
              data: base64Data,
            },
          },
          { text: buildPhotoPrompt(request.language, request.category) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = sanitizePlainText(
    parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
  )

  if (!content) {
    throw new Error("No content returned from Gemini Vision API.")
  }

  return parsePhotoSuggestionResponse(content)
}

async function suggestPhotoWithOpenAICompatible(
  request: PhotoSuggestionRequest,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<PhotoSuggestionResult> {
  const base64Data = request.imageBase64.replace(/^data:[^;]+;base64,/, "")
  const dataUrl = `data:${request.mimeType || "image/jpeg"};base64,${base64Data}`
  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "Content Creator SaaS"
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPhotoPrompt(request.language, request.category) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const providerName = provider === "groq" ? "Groq" : "OpenRouter"
    throw parseApiError(providerName, res.status, text)
  }

  const data = await res.json()
  const content = sanitizePlainText(
    data.choices?.[0]?.message?.content ?? ""
  )
  if (!content) {
    throw new Error(`No content returned from ${provider} Vision API.`)
  }

  return parsePhotoSuggestionResponse(content)
}

export async function suggestFromPhoto(
  request: PhotoSuggestionRequest
): Promise<PhotoSuggestionResult> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(900)
    const cat = request.category ?? "new_arrival"
    if (request.language === "my") {
      const mockByCategory: Record<PhotoCategoryKey, PhotoSuggestionResult> = {
        tech: {
          headline: "Redmi Note 13 Pro 5G အသစ်ရောက်ရှိ",
          spec1: "8GB / 256GB",
          spec2: "5000mAh Battery",
          spec3: "1 Year Warranty",
          suggestedPrice: "890,000 Ks",
          caption:
            "📱 စွမ်းဆောင်ရည်မြင့် Redmi Note 13 Pro 5G ရောက်ရှိပါပြီ!\n\n8GB RAM / 256GB Storage နှင့် 5000mAh Battery ပါဝင်ပြီး Official Warranty ၁ နှစ် အပြည့်အဝ ရရှိမှာပါ။\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။\n\n#TechMyanmar #Smartphone #NewArrival",
        },
        flash_sale: {
          headline: "ယနေ့တစ်ရက်တည်း အထူးလျှော့ဈေး!",
          spec1: "Save 30%",
          spec2: "Today Only",
          spec3: "Fast Delivery",
          suggestedPrice: "35,000 Ks",
          caption:
            "⚡ Flash Sale! ယနေ့တစ်ရက်တည်းသာ ရရှိမယ့် အထူးလျှော့ဈေး!\n\nပစ္စည်းအရေအတွက် ကန့်သတ်ထားတာမို့ မြန်မြန်လေး မှာယူလိုက်ပါနော်။ 🛍️\n\n#FlashSale #SpecialOffer #OnlineShopMyanmar",
        },
        new_arrival: {
          headline: "အရည်အသွေးမြင့် ပစ္စည်းသစ် ရောက်ရှိပါပြီ",
          spec1: "Premium Quality",
          spec2: "Ready Stock",
          spec3: "Cash on Delivery",
          suggestedPrice: "45,000 Ks",
          caption:
            "✨ သင့်အတွက် အကောင်းဆုံး ရွေးချယ်မှု!\n\nအရည်အသွေးကောင်းမွန်ပြီး စိတ်ချရတဲ့ ပစ္စည်းလေးကို အခုပဲ မှာယူလိုက်ပါ။ 🛍️\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။\n\n#NewArrival #OnlineShopMyanmar #QualityFirst",
        },
        fashion: {
          headline: "စတိုင်ကျလှပတဲ့ Fashion Collection အသစ်",
          spec1: "Soft Fabric",
          spec2: "Free Size / S-XL",
          spec3: "Limited Edition",
          suggestedPrice: "38,000 Ks",
          caption:
            "🌸 နေ့စဉ် စတိုင်ကျကျ ဝတ်ဆင်နိုင်မယ့် Collection အသစ် ရောက်ရှိပါပြီ!\n\nအရောင်အသွေး လှပပြီး ဝတ်ဆင်ရတာ သက်တောင့်သက်သာရှိပါတယ်။\n\n#FashionMyanmar #BeautyStyle #NewCollection",
        },
        food: {
          headline: "လတ်ဆတ်အရသာရှိတဲ့ အထူးမီနူး",
          spec1: "Freshly Made",
          spec2: "100% Halal",
          spec3: "Fast Delivery",
          suggestedPrice: "6,500 Ks",
          caption:
            "☕ နေ့တိုင်း လတ်လတ်ဆတ်ဆတ် ဖန်တီးပေးထားတဲ့ အရသာကောင်းမွန်သော မီနူး!\n\nအိမ်တိုင်ရာရောက် ပို့ဆောင်ပေးနေပါပြီ။ 🛵\n\n#FoodMyanmar #CafeStyle #FreshDelivery",
        },
      }
      return mockByCategory[cat]
    }

    const mockEnByCategory: Record<PhotoCategoryKey, PhotoSuggestionResult> = {
      tech: {
        headline: "Redmi Note 13 Pro 5G In Stock",
        spec1: "8GB / 256GB",
        spec2: "5000mAh Battery",
        spec3: "1 Year Warranty",
        suggestedPrice: "$299",
        caption:
          "📱 Upgrade your daily driver with the Redmi Note 13 Pro 5G!\n\nPacked with 8GB / 256GB, a 5000mAh battery, and a full 1 Year Warranty. Message us to order today!\n\n#TechDeals #Smartphone #NewArrival",
      },
      flash_sale: {
        headline: "24-Hour Flash Sale — Save Big",
        spec1: "Up to 30% Off",
        spec2: "Limited Stock",
        spec3: "Fast Shipping",
        suggestedPrice: "35,000 Ks",
        caption:
          "⚡ Don't miss today's Flash Sale! Grab this deal before stock runs out.\n\nSend us a DM to lock in your promo price! 🛍️\n\n#FlashSale #LimitedOffer #ShopNow",
      },
      new_arrival: {
        headline: "Premium Quality Just Arrived",
        spec1: "Premium Finish",
        spec2: "In Stock Now",
        spec3: "Fast Delivery",
        suggestedPrice: "45,000 Ks",
        caption:
          "✨ Upgrade your everyday style with our latest arrival!\n\nCrafted with care and ready to order today. Limited stock available—send us a message to grab yours! 🛍️\n\n#NewArrival #ShopNow #FeaturedProduct",
      },
      fashion: {
        headline: "Effortless Style New Collection",
        spec1: "Breathable Fit",
        spec2: "All Sizes",
        spec3: "Gift Ready",
        suggestedPrice: "38,000 Ks",
        caption:
          "🌸 Elevate your wardrobe with our latest collection! Soft, comfortable, and effortlessly chic.\n\nDM us to order your favorite shade today! ✨\n\n#FashionStyle #Beauty #NewCollection",
      },
      food: {
        headline: "Freshly Crafted Daily Special",
        spec1: "Fresh Ingredients",
        spec2: "Made to Order",
        spec3: "30 Min Delivery",
        suggestedPrice: "6,500 Ks",
        caption:
          "☕ Treat yourself to our freshly made daily special! Crafted to order and delivered hot & fresh right to your door. 🛵\n\n#FreshFood #CafeVibes #OrderNow",
      },
    }
    return mockEnByCategory[cat]
  }

  if (provider === "gemini") {
    const primaryModel = model || GEMINI_VISION_MODEL
    try {
      return await suggestPhotoWithGemini(request, trimmedKey, primaryModel)
    } catch (err) {
      if (isLocationUnsupportedError(err) && apiKeys.openrouter) {
        console.warn("Gemini location unsupported for vision. Falling back to OpenRouter...")
        return await callOpenRouterWithFallback(
          models.openrouter || DEFAULT_MODELS.openrouter,
          (candidateModel) =>
            suggestPhotoWithOpenAICompatible(request, "openrouter", apiKeys.openrouter, candidateModel)
        )
      }
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (
        (isQuota || (err instanceof ApiError && err.status === 404)) &&
        primaryModel !== GEMINI_FALLBACK_MODEL
      ) {
        return await suggestPhotoWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
      }
      throw err
    }
  }

  if (provider === "openrouter") {
    return await callOpenRouterWithFallback(
      model || DEFAULT_MODELS.openrouter,
      (candidateModel) =>
        suggestPhotoWithOpenAICompatible(request, "openrouter", trimmedKey, candidateModel)
    )
  }

  return await suggestPhotoWithOpenAICompatible(
    request,
    provider,
    trimmedKey,
    resolveGroqVisionModel(model)
  )
}

export type VideoPlatformOption = "TikTok / Reels" | "Facebook Video" | "YouTube Shorts"

export interface GenerateVideoContentParams {
  file: File
  productNote?: string
  platform: VideoPlatformOption | string
  language: "en" | "my"
  onProgress?: (stage: "extracting" | "analyzing") => void
}

export interface VideoContentResult {
  hooks: string[]
  voiceoverScript: string
  caption: string
  coverTitle: string
  analysisMode: "direct" | "keyframes"
  frameCount?: number
}

const VIDEO_DIRECT_MAX_BYTES = 15 * 1024 * 1024

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mkv"]

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
  ".mkv": "video/x-matroska",
}

export function isSupportedVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  if (mime.startsWith("video/")) {
    return true
  }
  const name = (file.name || "").toLowerCase()
  return VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function inferVideoMimeType(file: File): string {
  const mime = (file.type || "").toLowerCase()
  if (mime.startsWith("video/")) {
    return file.type
  }
  const name = (file.name || "").toLowerCase()
  const matchedExt = VIDEO_EXTENSIONS.find((ext) => name.endsWith(ext))
  return (matchedExt && EXTENSION_MIME_MAP[matchedExt]) || "video/mp4"
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read video file as base64."))
        return
      }
      const base64 = reader.result.replace(/^data:[^;]+;base64,/, "")
      resolve(base64)
    }
    reader.onerror = () => reject(new Error("Failed to read video file."))
    reader.readAsDataURL(file)
  })
}

async function extractKeyframesFromVideo(
  file: File,
  frameCount = 5,
  maxWidth = 720,
  quality = 0.75
): Promise<string[]> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  video.src = objectUrl

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        cleanup()
        if (err) reject(err)
        else resolve()
      }

      // 5-second timeout fallback so mobile recordings with slow/missing metadata never hang
      const timer = window.setTimeout(() => {
        finish()
      }, 5000)

      const onLoaded = () => finish()
      const onError = () => finish(new Error("Could not decode video file in browser."))
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("loadeddata", onLoaded)
        video.removeEventListener("error", onError)
      }

      if (video.readyState >= 1) {
        finish()
        return
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("loadeddata", onLoaded)
      video.addEventListener("error", onError)
    })

    const hasValidDuration = Number.isFinite(video.duration) && video.duration > 0
    const timestamps = hasValidDuration
      ? Array.from({ length: frameCount }, (_, i) => ((i + 0.5) / frameCount) * video.duration)
      : [0.5, 1.5, 2.5]

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 2D context is not available.")
    }

    const frames: string[] = []
    for (const time of timestamps) {
      await new Promise<void>((resolve) => {
        const seekTimer = window.setTimeout(() => {
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }, 5000)

        const onSeeked = () => {
          window.clearTimeout(seekTimer)
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }

        video.addEventListener("seeked", onSeeked)
        try {
          video.currentTime = hasValidDuration
            ? Math.min(Math.max(0, time), video.duration)
            : Math.max(0, time)
        } catch {
          window.clearTimeout(seekTimer)
          video.removeEventListener("seeked", onSeeked)
          resolve()
        }
      })

      const srcWidth = video.videoWidth || 720
      const srcHeight = video.videoHeight || 1280
      const scale = Math.min(1, maxWidth / srcWidth)
      canvas.width = Math.max(1, Math.round(srcWidth * scale))
      canvas.height = Math.max(1, Math.round(srcHeight * scale))
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "")
      if (base64) {
        frames.push(base64)
      }
    }

    if (frames.length === 0) {
      throw new Error("Failed to extract keyframes from video.")
    }

    return frames
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

function buildVideoPrompt(params: {
  platform: string
  language: "en" | "my"
  productNote?: string
  analysisMode: "direct" | "keyframes"
}): string {
  const noteBlock = params.productNote?.trim()
    ? `Additional Product Name / Price / Promo Note from seller: "${params.productNote.trim()}"`
    : "No extra product note provided; infer product details from the visuals."
  const mediaContext =
    params.analysisMode === "direct"
      ? "Watch this short product video carefully from start to finish."
      : "Review these 5 evenly spaced keyframes from a short product video in chronological order."

  if (params.language === "my") {
    return `You are a top Myanmar short-form video strategist and copywriter.
${mediaContext}
Target Platform: ${params.platform}
${noteBlock}

Analyze the visual scenes, product details, and pacing, then return ONLY a valid JSON object with these exact 4 keys:
1. "hooks": An array of 3 scroll-stopping hook strings (for on-screen text in the first 3 seconds) in natural Myanmar (Burmese) Unicode script.
2. "voiceoverScript": A natural spoken Burmese voiceover script timed to the video flow (e.g. using short time cues like [0-3s], [3-10s], [10-15s] with spoken lines).
3. "caption": A ready-to-copy-paste ${params.platform} caption in natural Myanmar (Burmese) Unicode script with relevant emojis and 4-6 hashtags at the end.
4. "coverTitle": A short, punchy 4 to 6 word Cover / Thumbnail Title in natural Myanmar (Burmese) Unicode script.

CRITICAL RULES:
- Write in natural, engaging spoken Myanmar (Burmese) Unicode script.
- Keep international brand, product, and platform names (e.g., iPhone, Redmi, Samsung, TikTok, Reels, Facebook, YouTube) in their original English spelling.
- Do NOT use raw Markdown symbols (*, **, # headings) in hooks, voiceoverScript, or coverTitle. Only normal #hashtags are allowed at the end of caption.
- Return ONLY valid JSON.`
  }

  return `You are a top short-form video strategist and social media copywriter.
${mediaContext}
Target Platform: ${params.platform}
${noteBlock}

Analyze the visual scenes, product details, and pacing, then return ONLY a valid JSON object with these exact 4 keys:
1. "hooks": An array of 3 scroll-stopping hook strings (for on-screen text in the first 3 seconds) in natural English.
2. "voiceoverScript": A natural spoken English voiceover script timed to the video flow (e.g. using short time cues like [0-3s], [3-10s], [10-15s] with spoken lines).
3. "caption": A ready-to-copy-paste ${params.platform} caption in English with relevant emojis and 4-6 hashtags at the end.
4. "coverTitle": A short, punchy 4 to 6 word Cover / Thumbnail Title in English.

CRITICAL RULES:
- Do NOT use raw Markdown symbols (*, **, # headings) in hooks, voiceoverScript, or coverTitle. Only normal #hashtags are allowed at the end of caption.
- Return ONLY valid JSON.`
}

function parseVideoContentResponse(
  raw: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number
): VideoContentResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as {
      hooks?: unknown
      voiceoverScript?: unknown
      caption?: unknown
      coverTitle?: unknown
    }

    const hooks = Array.isArray(parsed.hooks)
      ? parsed.hooks
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => stripMarkdownArtifacts(item))
          .slice(0, 3)
      : []

    const voiceoverScript =
      typeof parsed.voiceoverScript === "string"
        ? stripMarkdownArtifacts(parsed.voiceoverScript)
        : ""
    const caption =
      typeof parsed.caption === "string"
        ? stripMarkdownArtifacts(parsed.caption, true)
        : ""
    const coverTitle =
      typeof parsed.coverTitle === "string"
        ? stripMarkdownArtifacts(parsed.coverTitle)
        : ""

    if (hooks.length > 0 || voiceoverScript || caption || coverTitle) {
      return {
        hooks,
        voiceoverScript,
        caption,
        coverTitle,
        analysisMode,
        frameCount,
      }
    }
  } catch {
    // Fallback if model returned plain text
  }

  return {
    hooks: [],
    voiceoverScript: sanitizePlainText(cleaned),
    caption: "",
    coverTitle: "",
    analysisMode,
    frameCount,
  }
}

async function generateVideoWithGemini(
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  prompt: string,
  apiKey: string,
  model: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number
): Promise<VideoContentResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    contents: [
      {
        parts: [...mediaParts, { text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw parseApiError("Gemini", res.status, text)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> =
    data.candidates?.[0]?.content?.parts ?? []
  const content = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()

  if (!content) {
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? `No content returned from Gemini Video API (finishReason: ${finishReason}).`
        : "No content returned from Gemini Video API."
    )
  }

  return parseVideoContentResponse(content, analysisMode, frameCount)
}

function mockGenerateVideoContent(
  params: GenerateVideoContentParams,
  analysisMode: "direct" | "keyframes",
  frameCount?: number
): VideoContentResult {
  const note = params.productNote?.trim()
  if (params.language === "my") {
    return {
      hooks: [
        note ? `ဒါလေးကတော့ ${note} ပဲဖြစ်ပါတယ်!` : "ဒီပစ္စည်းလေးကို မဝယ်ခင် ဒါကိုအရင်ကြည့်!",
        "နေ့တိုင်းသုံးဖို့ အတန်ဆုံးရွေးချယ်မှု 🔥",
        "စက္ကန့် ၁၅ အတွင်း ဘာကြောင့်လူကြိုက်များလဲကြည့်ရအောင်",
      ],
      voiceoverScript:
        "[0-3s] မင်္ဂလာပါ! ဒီနေ့မှာတော့ လူကြိုက်များနေတဲ့ ပစ္စည်းလေးကို လက်တွေ့ပြသပေးသွားပါမယ်။\n\n[3-10s] ဒီဇိုင်းပိုင်းက သပ်ရပ်လှပပြီး နေ့စဉ်အသုံးပြုရတာ အရမ်းအဆင်ပြေပါတယ်။" +
        (note ? ` (${note})` : "") +
        "\n\n[10-15s] ပစ္စည်းအရေအတွက် ကန့်သတ်ထားတာမို့ အခုပဲ Inbox မှာ မှာယူလိုက်ပါနော်!",
      caption: `✨ ${note ? note + " — " : ""}နေ့စဉ်အသုံးပြုဖို့ အရည်အသွေးကောင်းပြီး စိတ်ချရတဲ့ ရွေးချယ်မှု!\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ။\n\n#ProductShowcase #MyanmarOnlineShop #ReelsMyanmar #Trending`,
      coverTitle: "မဖြစ်မနေကြည့်သင့်တဲ့ ပစ္စည်းသစ်",
      analysisMode,
      frameCount,
    }
  }

  return {
    hooks: [
      note ? `Stop scrolling — check out ${note}!` : "Wait until you see this detail!",
      "3 reasons everyone is switching to this 🔥",
      "The everyday upgrade you didn't know you needed",
    ],
    voiceoverScript:
      "[0-3s] If you've been looking for an everyday upgrade, take a quick look at this.\n\n[3-10s] Notice the clean finish and practical design built for daily use." +
      (note ? ` Plus: ${note}.` : "") +
      "\n\n[10-15s] Stock is limited — tap the link or message us to grab yours today!",
    caption: `✨ ${note ? note + " — " : ""}Clean design, everyday performance, ready to order today!\n\n📩 DM us or check the link in bio to get yours.\n\n#ProductShowcase #ShortVideo #MustHave #ShopNow`,
    coverTitle: "Must-See Everyday Product Upgrade",
    analysisMode,
    frameCount,
  }
}

async function generateVideoWithOpenAICompatible(
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  prompt: string,
  provider: "openrouter" | "groq",
  apiKey: string,
  model: string,
  analysisMode: "direct" | "keyframes",
  frameCount?: number
): Promise<VideoContentResult> {
  const imageContentParts = mediaParts.map((part) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
    },
  }))

  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions"
  const providerName = provider === "groq" ? "Groq" : "OpenRouter"

  const sendRequest = async (candidateModel: string): Promise<VideoContentResult> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = window.location.origin
      headers["X-Title"] = "Content Creator SaaS"
    }

    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: candidateModel,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...imageContentParts],
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw parseApiError(providerName, res.status, text)
    }

    const data = await res.json()
    const content = String(data.choices?.[0]?.message?.content ?? "").trim()
    if (!content) {
      throw new Error(`No content returned from ${providerName} Video API.`)
    }

    return parseVideoContentResponse(content, analysisMode, frameCount)
  }

  if (provider === "openrouter") {
    return await callOpenRouterWithFallback(
      model || DEFAULT_MODELS.openrouter,
      sendRequest
    )
  }

  return await sendRequest(resolveGroqVisionModel(model))
}

async function extractKeyframeMedia(params: GenerateVideoContentParams): Promise<{
  mediaParts: Array<{ inlineData: { mimeType: string; data: string } }>
  frameCount: number
  analysisMode: "keyframes"
}> {
  params.onProgress?.("extracting")
  const frames = await extractKeyframesFromVideo(params.file, 5, 720, 0.75)
  params.onProgress?.("analyzing")
  return {
    mediaParts: frames.map((data) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data,
      },
    })),
    frameCount: frames.length,
    analysisMode: "keyframes",
  }
}

export async function generateVideoContent(
  params: GenerateVideoContentParams
): Promise<VideoContentResult> {
  const { provider, apiKey, apiKeys, model, models } = getAiConfig()
  const openRouterKey = apiKeys.openrouter.trim()
  const geminiKey = apiKeys.gemini.trim()
  const groqKey = apiKeys.groq.trim()
  const openRouterModel = models.openrouter || DEFAULT_MODELS.openrouter
  const groqModel = models.groq || DEFAULT_MODELS.groq
  const geminiModel = model || GEMINI_VISION_MODEL

  const useKeyframesOnly = provider !== "gemini"
  const isDirectMode =
    !useKeyframesOnly && params.file.size <= VIDEO_DIRECT_MAX_BYTES
  let analysisMode: "direct" | "keyframes" = isDirectMode ? "direct" : "keyframes"

  let mediaParts: Array<{ inlineData: { mimeType: string; data: string } }> = []
  let frameCount: number | undefined

  if (isDirectMode) {
    params.onProgress?.("analyzing")
    const base64 = await fileToBase64(params.file)
    mediaParts = [
      {
        inlineData: {
          mimeType: inferVideoMimeType(params.file),
          data: base64,
        },
      },
    ]
  } else {
    const extracted = await extractKeyframeMedia(params)
    mediaParts = extracted.mediaParts
    frameCount = extracted.frameCount
    analysisMode = extracted.analysisMode
  }

  const routeViaOpenAICompatible = async (
    targetProvider: "openrouter" | "groq",
    key: string,
    targetModel: string
  ): Promise<VideoContentResult> => {
    if (mediaParts.some((part) => !part.inlineData.mimeType.startsWith("image/"))) {
      const extracted = await extractKeyframeMedia(params)
      mediaParts = extracted.mediaParts
      frameCount = extracted.frameCount
      analysisMode = extracted.analysisMode
    }
    const prompt = buildVideoPrompt({
      platform: params.platform,
      language: params.language,
      productNote: params.productNote,
      analysisMode,
    })
    return await generateVideoWithOpenAICompatible(
      mediaParts,
      prompt,
      targetProvider,
      key,
      targetModel,
      analysisMode,
      frameCount
    )
  }

  const runDirectGemini = async (): Promise<VideoContentResult> => {
    const prompt = buildVideoPrompt({
      platform: params.platform,
      language: params.language,
      productNote: params.productNote,
      analysisMode,
    })
    try {
      return await generateVideoWithGemini(
        mediaParts,
        prompt,
        geminiKey,
        geminiModel,
        analysisMode,
        frameCount
      )
    } catch (err) {
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (
        (isQuota || (err instanceof ApiError && err.status === 404)) &&
        geminiModel !== GEMINI_FALLBACK_MODEL
      ) {
        console.warn(
          `Gemini quota/model fallback for "${geminiModel}". Retrying with "${GEMINI_FALLBACK_MODEL}"...`
        )
        return await generateVideoWithGemini(
          mediaParts,
          prompt,
          geminiKey,
          GEMINI_FALLBACK_MODEL,
          analysisMode,
          frameCount
        )
      }
      throw err
    }
  }

  if (provider === "openrouter") {
    if (!openRouterKey) {
      await delay(900)
      return mockGenerateVideoContent(params, analysisMode, frameCount)
    }
    return await routeViaOpenAICompatible("openrouter", openRouterKey, openRouterModel)
  }

  if (provider === "groq") {
    if (!groqKey) {
      await delay(900)
      return mockGenerateVideoContent(params, analysisMode, frameCount)
    }
    return await routeViaOpenAICompatible("groq", groqKey, groqModel)
  }

  // Active provider is Gemini
  if (!apiKey.trim()) {
    await delay(900)
    return mockGenerateVideoContent(params, analysisMode, frameCount)
  }

  try {
    return await runDirectGemini()
  } catch (err) {
    if (isLocationUnsupportedError(err) && openRouterKey) {
      console.warn(
        "Gemini location unsupported (400). Routing video analysis through OpenRouter..."
      )
      return await routeViaOpenAICompatible("openrouter", openRouterKey, openRouterModel)
    }
    throw err
  }
}

