import { useUIStore } from "@/store/useUIStore"

export const GEMINI_MODEL = "gemini-3.5-flash-lite"
export const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite"
export const QUOTA_EXCEEDED_MESSAGE =
  "Daily/minute API quota exceeded. Please switch model in Settings or wait a moment."

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
- Write naturally for the selected platform (Facebook, TikTok, YouTube, Instagram).
- Match the requested tone exactly.
- If the language is "myanmar", write entirely in natural Myanmar (Burmese) Unicode script.
- If the language is "bilingual", blend Myanmar and English naturally.
- When includeHashtags is true, append relevant hashtags at the end.
- Keep formatting clean with short paragraphs and emoji where appropriate.
- Output only the final content, no preamble or meta commentary.`

function buildUserPrompt(request: GenerateContentRequest): string {
  const hashtagInstruction = request.includeHashtags
    ? "Include relevant hashtags at the end."
    : "Do not include hashtags."

  if (request.instruction && request.currentContent) {
    return `Task: ${request.instruction}
Target Platform: ${request.platform}
Target Content Type: ${request.contentType}
Tone: ${request.tone}
Output Language: ${request.language}
${hashtagInstruction}

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
${hashtagInstruction}
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

function getAiConfig() {
  const { aiProvider, aiApiKey, aiModel } = useUIStore.getState()
  const envGeminiKey =
    aiProvider === "gemini"
      ? ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "")
      : ""
  return {
    provider: aiProvider,
    apiKey: aiApiKey || envGeminiKey,
    model: aiModel === "gemini-2.5-flash-lite" ? GEMINI_FALLBACK_MODEL : aiModel,
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
  const content = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()

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
  const content = data.choices?.[0]?.message?.content?.trim() ?? ""

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
  const { provider, apiKey, model } = getAiConfig()
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
    const fallbackModel =
      provider === "groq" ? "llama-3.3-70b-versatile" : "openrouter/auto"
    return await generateWithOpenAICompatible(
      request,
      provider,
      trimmedKey,
      model || fallbackModel
    )
  } catch (err) {
    console.error(`AI generation failed via ${provider}`, err)
    throw err
  }
}

export interface PhotoSuggestionRequest {
  imageBase64: string
  mimeType: string
  language: "en" | "my"
}

export interface PhotoSuggestionResult {
  headline: string
  caption: string
}

function stripMarkdownAsterisks(text: string): string {
  return text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").replace(/\*/g, "").trim()
}

function parsePhotoSuggestionResponse(raw: string): PhotoSuggestionResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as { headline?: string; caption?: string }
    if (typeof parsed.headline === "string" || typeof parsed.caption === "string") {
      return {
        headline: stripMarkdownAsterisks(parsed.headline ?? ""),
        caption: stripMarkdownAsterisks(parsed.caption ?? ""),
      }
    }
  } catch {
    // Fallback if model returned plain text instead of JSON
  }

  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean)
  const headline = stripMarkdownAsterisks(lines[0] ?? "")
  const caption = stripMarkdownAsterisks(lines.slice(1).join("\n") || cleaned)
  return { headline, caption }
}

function buildPhotoPrompt(language: "en" | "my"): string {
  if (language === "my") {
    return `You are a Myanmar social media marketing expert. Look at this product photo carefully and generate:
1. "headline": A short, punchy poster headline (3 to 7 words max) in natural Myanmar (Burmese) Unicode script. Do NOT use Markdown asterisks (*) or quotes.
2. "caption": A ready-to-post Facebook/Instagram social media caption in natural Myanmar (Burmese) Unicode script with relevant emojis and 3-5 hashtags at the end. Do NOT use Markdown asterisks (*).

Return ONLY a valid JSON object with keys "headline" and "caption".`
  }

  return `You are a social media marketing expert. Look at this product photo carefully and generate:
1. "headline": A short, punchy poster headline (3 to 7 words max) in English. Do NOT use Markdown asterisks (*) or quotes.
2. "caption": A ready-to-post Facebook/Instagram social media caption in English with relevant emojis and 3-5 hashtags at the end. Do NOT use Markdown asterisks (*).

Return ONLY a valid JSON object with keys "headline" and "caption".`
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
          { text: buildPhotoPrompt(request.language) },
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
  const content = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim()

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
            { type: "text", text: buildPhotoPrompt(request.language) },
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
  const content = data.choices?.[0]?.message?.content?.trim() ?? ""
  if (!content) {
    throw new Error(`No content returned from ${provider} Vision API.`)
  }

  return parsePhotoSuggestionResponse(content)
}

export async function suggestFromPhoto(
  request: PhotoSuggestionRequest
): Promise<PhotoSuggestionResult> {
  const { provider, apiKey, model } = getAiConfig()
  const trimmedKey = apiKey.trim()

  if (!trimmedKey) {
    await delay(900)
    if (request.language === "my") {
      return {
        headline: "အရည်အသွေးမြင့် ပစ္စည်းသစ် ရောက်ရှိပါပြီ",
        caption:
          "✨ သင့်အတွက် အကောင်းဆုံး ရွေးချယ်မှု!\n\nအရည်အသွေးကောင်းမွန်ပြီး စိတ်ချရတဲ့ ပစ္စည်းလေးကို အခုပဲ မှာယူလိုက်ပါ။ 🛍️\n\n📩 မှာယူလိုပါက Inbox မှတစ်ဆင့် ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ။\n\n#NewArrival #OnlineShopMyanmar #QualityFirst",
      }
    }
    return {
      headline: "Premium Quality Just Arrived",
      caption:
        "✨ Upgrade your everyday style with our latest arrival!\n\nCrafted with care and ready to order today. Limited stock available—send us a message to grab yours! 🛍️\n\n#NewArrival #ShopNow #FeaturedProduct",
    }
  }

  if (provider === "gemini") {
    const primaryModel = model || GEMINI_MODEL
    try {
      return await suggestPhotoWithGemini(request, trimmedKey, primaryModel)
    } catch (err) {
      const isQuota =
        (err instanceof ApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.message === QUOTA_EXCEEDED_MESSAGE ||
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.toLowerCase().includes("quota")))

      if (isQuota && primaryModel !== GEMINI_FALLBACK_MODEL) {
        return await suggestPhotoWithGemini(request, trimmedKey, GEMINI_FALLBACK_MODEL)
      }
      throw err
    }
  }

  const fallbackModel =
    provider === "groq" ? "llama-3.3-70b-versatile" : "openrouter/auto"
  return await suggestPhotoWithOpenAICompatible(
    request,
    provider,
    trimmedKey,
    model || fallbackModel
  )
}

