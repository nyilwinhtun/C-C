import {
  AudioLines,
  BookOpen,
  Camera,
  Clapperboard,
  FileText,
  FolderKanban,
  Lightbulb,
  Mic,
  Scissors,
  SquarePen,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { Language } from "@/store/useUIStore"
import type { SquircleTone } from "@/components/shared/squircle-icon"

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
  shortMy: string
  shortEn: string
  defaultPageKey: string
  icon: LucideIcon
  tone: SquircleTone
  activeColorClass: string
  activePillClass: string
  tabs: RoomTab[]
}

export const WORKSPACE_ROOMS: WorkspaceRoom[] = [
  {
    id: "write",
    emoji: "✍️",
    titleMy: "စာနှင့် ဇာတ်ညွှန်း",
    titleEn: "Writing & Scripts",
    shortMy: "စာရေးမည်",
    shortEn: "Write",
    defaultPageKey: "text",
    icon: SquarePen,
    tone: "blue",
    activeColorClass: "text-[#007AFF] dark:text-[#0A84FF]",
    activePillClass: "bg-[#007AFF]/12 dark:bg-[#0A84FF]/18",
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
    shortMy: "အသံစတူဒီယို",
    shortEn: "Audio",
    defaultPageKey: "voiceover",
    icon: Mic,
    tone: "purple",
    activeColorClass: "text-[#AF52DE] dark:text-[#BF5AF2]",
    activePillClass: "bg-[#AF52DE]/12 dark:bg-[#BF5AF2]/18",
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
    shortMy: "မီဒီယာ",
    shortEn: "Media",
    defaultPageKey: "autocut",
    icon: Clapperboard,
    tone: "orange",
    activeColorClass: "text-[#FF9500] dark:text-[#FF9F0A]",
    activePillClass: "bg-[#FF9500]/12 dark:bg-[#FF9F0A]/18",
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
    shortMy: "မှတ်စု",
    shortEn: "Vault",
    defaultPageKey: "vault",
    icon: Lightbulb,
    tone: "emerald",
    activeColorClass: "text-[#34C759] dark:text-[#30D158]",
    activePillClass: "bg-[#34C759]/12 dark:bg-[#30D158]/18",
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
  return language === "my" ? room.titleMy : room.titleEn
}
