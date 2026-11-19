import {
  AudioLines,
  BookOpen,
  Camera,
  FileText,
  FolderKanban,
  Mic,
  PenLine,
  Scissors,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { Language } from "@/store/useUIStore"

export interface RoomTab {
  key: string
  labelMy: string
  labelEn: string
  icon: LucideIcon
}

export interface WorkspaceRoom {
  id: "write" | "audio" | "media" | "vault"
  emoji: string
  titleMy: string
  titleEn: string
  defaultPageKey: string
  icon: LucideIcon
  tabs: RoomTab[]
}

export const WORKSPACE_ROOMS: WorkspaceRoom[] = [
  {
    id: "write",
    emoji: "✍️",
    titleMy: "စာနှင့် ဇာတ်ညွှန်း",
    titleEn: "Writing & Scripts",
    defaultPageKey: "text",
    icon: PenLine,
    tabs: [
      { key: "text", labelMy: "Post ရေးမည်", labelEn: "Text Post", icon: FileText },
      { key: "video", labelMy: "Video Script", labelEn: "Video Script", icon: Video },
    ],
  },
  {
    id: "audio",
    emoji: "🎙️",
    titleMy: "AI အသံနှင့် စာပြောင်းစက်",
    titleEn: "AI Voice & Transcriber",
    defaultPageKey: "voiceover",
    icon: Mic,
    tabs: [
      { key: "voiceover", labelMy: "AI အသံထည့်မည်", labelEn: "AI Voiceover", icon: Mic },
      { key: "transcriber", labelMy: "အသံမှ စာပြောင်းမည်", labelEn: "Voice-to-Text", icon: AudioLines },
      { key: "audiobook", labelMy: "စာအုပ် အသံပြောင်းမည်", labelEn: "Book to Audio", icon: BookOpen },
    ],
  },
  {
    id: "media",
    emoji: "🎬",
    titleMy: "ဗီဒီယို Auto-Cut & ပုံဒီဇိုင်း",
    titleEn: "Video Auto-Cut & Studio",
    defaultPageKey: "autocut",
    icon: Scissors,
    tabs: [
      { key: "autocut", labelMy: "ဗီဒီယို Auto-Cut", labelEn: "Video Auto-Cut", icon: Scissors },
      { key: "studio", labelMy: "ပုံဒီဇိုင်း Studio", labelEn: "Photo Studio", icon: Camera },
    ],
  },
  {
    id: "vault",
    emoji: "📁",
    titleMy: "မှတ်စုနှင့် အချိန်ဇယား",
    titleEn: "Vault & Calendar",
    defaultPageKey: "vault",
    icon: FolderKanban,
    tabs: [{ key: "vault", labelMy: "Idea Vault & Calendar", labelEn: "Idea Vault & Calendar", icon: FolderKanban }],
  },
]

export function getRoomForPageKey(pageKey: string): WorkspaceRoom {
  return (
    WORKSPACE_ROOMS.find((room) => room.tabs.some((tab) => tab.key === pageKey)) ??
    WORKSPACE_ROOMS[0]
  )
}

export function getRoomTitle(room: WorkspaceRoom, language: Language): string {
  return language === "my" ? `${room.emoji} ${room.titleMy}` : `${room.emoji} ${room.titleEn}`
}
