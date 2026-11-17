import { createClient } from "@supabase/supabase-js"

export interface Database {
  public: {
    Tables: {
      vault_items: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          platform: string
          tags: string[]
          status: "idea" | "draft" | "scheduled" | "posted"
          scheduled_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          platform: string
          tags?: string[]
          status?: "idea" | "draft" | "scheduled" | "posted"
          scheduled_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          content?: string
          platform?: string
          tags?: string[]
          status?: "idea" | "draft" | "scheduled" | "posted"
          scheduled_date?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ""
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ""

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables; Supabase features are disabled.",
  )
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
)
