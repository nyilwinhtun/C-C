export type ContentLanguage = 'English' | 'Myanmar'

export interface GenerateContentRequest {
  topic: string
  platform: string
  tone: string
  language: ContentLanguage
}

export interface GeneratedContent {
  id: string
  topic: string
  content: string
  createdAt: string
}

export interface SavedIdea {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const generateContent = async (
  request: GenerateContentRequest
): Promise<GeneratedContent> => {
  await delay(1200)
  return {
    id: crypto.randomUUID(),
    topic: request.topic,
    content: [
      `Draft content for "${request.topic}"`,
      ``,
      `Platform: ${request.platform}`,
      `Tone: ${request.tone}`,
      `Language: ${request.language}`,
      ``,
      `This is a mock AI response. Connect a real AI service in src/api/index.ts.`,
    ].join('\n'),
    createdAt: new Date().toISOString(),
  }
}

export const saveIdea = async (idea: Omit<SavedIdea, 'id' | 'createdAt'>) => {
  await delay(600)
  return {
    ...idea,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  } satisfies SavedIdea
}

export const fetchIdeas = async (): Promise<SavedIdea[]> => {
  await delay(400)
  return []
}