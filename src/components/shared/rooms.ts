import {
  BookOpen,
  Camera,
  FileText,
  FolderKanban,
  Lightbulb,
  Mic,
  PenLine,
  Scissors,
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
    titleMy: "စာရေးနှင့် ဇာတ်ညွှန်း",
    titleEn: "Writing & Scripts",
    shortMy: "စာရေးမည်",
    shortEn: "Write",
    defaultPageKey: "text",
    icon: PenLine,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "text", labelMy: "Post ရေးမည်", labelEn: "Post Writer", icon: PenLine },
      { key: "video", labelMy: "Video Script", labelEn: "Video Script", icon: Video },
    ],
  },
  {
    id: "audio",
    emoji: "🎙️",
    titleMy: "အသံသွင်းခန်းနှင့် စာသား",
    titleEn: "Recording Booth & Notes",
    shortMy: "အသံသွင်းခန်း",
    shortEn: "Booth",
    defaultPageKey: "voiceover",
    icon: Mic,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "voiceover", labelMy: "အသံသွင်းခန်း", labelEn: "Recording Booth", icon: Mic },
      { key: "transcriber", labelMy: "အသံမှ စာသားသို့", labelEn: "Voice Notes", icon: FileText },
      { key: "audiobook", labelMy: "စာအုပ်ဇာတ်ကြောင်းပြော", labelEn: "Storyteller", icon: BookOpen },
    ],
  },
  {
    id: "media",
    emoji: "🎬",
    titleMy: "ဗီဒီယိုနှင့် ပုံဒီဇိုင်း",
    titleEn: "Video & Photo Studio",
    shortMy: "မီဒီယာ",
    shortEn: "Media",
    defaultPageKey: "autocut",
    icon: Scissors,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "autocut", labelMy: "အကောင်းဆုံး အခန်းဖြတ်ရန်", labelEn: "Highlight Cutter", icon: Scissors },
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
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
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
