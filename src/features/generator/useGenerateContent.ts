import { useMutation, type MutateOptions } from "@tanstack/react-query"
import {
  generateContent,
  type GenerateContentRequest,
  type GeneratedContent,
} from "@/api/aiService"

export function useGenerateContent(
  options?: MutateOptions<GeneratedContent, Error, GenerateContentRequest>
) {
  return useMutation<GeneratedContent, Error, GenerateContentRequest>({
    mutationFn: generateContent,
    ...options,
  })
}