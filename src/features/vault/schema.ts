import { z } from "zod"

export const vaultItemSchema = z.object({
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  platform: z.enum(["facebook", "tiktok", "youtube", "instagram"]),
  content: z.string().min(5, { message: "Content must be at least 5 characters." }),
  tags: z.string().min(1, { message: "Add at least one tag." }),
})

export type VaultItemFormValues = z.infer<typeof vaultItemSchema>
