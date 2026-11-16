import { useUIStore } from "@/store/useUIStore"

export const GEMINI_MODEL = "gemini-2.5-flash"

export type AIProvider = "gemini" | "groq" | "openrouter"

export interface GenerateContentRequest {
  topic: string
  platform: string
  contentType: string
  tone: string
  language: string
  includeHashtags: boolean
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
    ? " Include relevant hashtags at the end."
    : " Do not include hashtags."
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
  return { provider: aiProvider, apiKey: aiApiKey, model: aiModel }
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
    generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 2048 },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Gemini API error (${res.status}): ${text}`)
  }

  const data = await res.json()
  const content =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ""

  if (!content) {
    throw new Error("No content returned from Gemini API.")
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
    throw new Error(`${provider} API error (${res.status}): ${text}`)
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

  if (!apiKey) {
    await delay(1000)
    return mockGenerate(request)
  }

  try {
    if (provider === "gemini") {
      return generateWithGemini(request, apiKey, model || GEMINI_MODEL)
    }
    return generateWithOpenAICompatible(request, provider, apiKey, model)
  } catch (err) {
    console.error(`AI generation failed via ${provider}`, err)
    throw err
  }
}

