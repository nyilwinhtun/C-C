import { z } from "zod"

export const generatorSchema = z.object({
  topic: z.string().min(5, {
    message: "Topic must be at least 5 characters.",
  }),
  platform: z.enum(["facebook", "tiktok", "youtube", "instagram"]),
  contentType: z.enum([
    "post_caption",
    "video_script",
    "hook_ideas",
    "thread",
  ]),
  tone: z.enum([
    "engaging",
    "educational",
    "funny",
    "storytelling",
    "sales",
  ]),
  salesAngle: z
    .enum([
      "viral_story",
      "quick_tips",
      "honest_review",
      "promo_showcase",
      "short_reel",
    ])
    .default("viral_story"),
  language: z.enum(["myanmar", "english", "bilingual"]),
  includeHashtags: z.boolean().default(true),
  targetDurationSeconds: z.number().int().positive().default(15),
})

export type GeneratorFormValues = z.infer<typeof generatorSchema>
export type GeneratorFormInput = z.input<typeof generatorSchema>
