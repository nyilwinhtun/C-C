import {
  BookOpen,
  Camera,
  FileText,
  FolderKanban,
  Lightbulb,
  Mic,
  PenLine,
  Scissors,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { Language } from "@/store/useUIStore"
import type { SquircleTone } from "@/components/shared/squircle-icon"
import { t } from "@/locales/translations"

export interface RoomTab {
  key: string
  labelKey: string
  labelMy: string
  labelEn: string
  icon: LucideIcon
}

export interface WorkspaceRoom {
  id: "write" | "audio" | "media" | "vault"
  emoji: string
  titleKey: string
  shortKey: string
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
    titleKey: "rooms.write.title",
    shortKey: "rooms.write.short",
    titleMy: "ပို့စ်ရေးရန်နှင့် ဇာတ်ညွှန်း",
    titleEn: "Writing & Scripts",
    shortMy: "စာရေးမည်",
    shortEn: "Write",
    defaultPageKey: "text",
    icon: PenLine,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "text", labelKey: "nav.text", labelMy: "ပို့စ်ရေးရန်", labelEn: "Post Writer", icon: PenLine },
      { key: "video", labelKey: "nav.video", labelMy: "ဗီဒီယို ဇာတ်ညွှန်း", labelEn: "Video Script", icon: Video },
    ],
  },
  {
    id: "audio",
    emoji: "🎙️",
    titleKey: "rooms.audio.title",
    shortKey: "rooms.audio.short",
    titleMy: "အသံသွင်းခန်းနှင့် မှတ်စု",
    titleEn: "Recording Booth & Notes",
    shortMy: "အသံသွင်းခန်း",
    shortEn: "Booth",
    defaultPageKey: "voiceover",
    icon: Mic,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "voiceover", labelKey: "nav.voiceover", labelMy: "အသံသွင်းခန်း", labelEn: "Recording Booth", icon: Mic },
      { key: "transcriber", labelKey: "nav.transcriber", labelMy: "အသံမှတ်စု", labelEn: "Voice Notes", icon: FileText },
      { key: "audiobook", labelKey: "nav.audiobook", labelMy: "စာအုပ်ဖတ်ပြစက်", labelEn: "Storyteller", icon: BookOpen },
    ],
  },
  {
    id: "media",
    emoji: "🎬",
    titleKey: "rooms.media.title",
    shortKey: "rooms.media.short",
    titleMy: "ဓာတ်ပုံစတူဒီယိုနှင့် ဗီဒီယို",
    titleEn: "Video & Photo Studio",
    shortMy: "စတူဒီယို",
    shortEn: "Media",
    defaultPageKey: "studio",
    icon: Scissors,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      { key: "studio", labelKey: "nav.studio", labelMy: "ဓာတ်ပုံစတူဒီယို", labelEn: "Photo Studio", icon: Camera },
      { key: "presenter3d", labelKey: "nav.presenter3d", labelMy: "3D တင်ဆက်သူ", labelEn: "3D Presenter", icon: Sparkles },
      { key: "autocut", labelKey: "nav.autocut", labelMy: "ဗီဒီယို အသံတိတ်ဖြတ်စက်", labelEn: "Highlight Cutter", icon: Scissors },
    ],
  },
  {
    id: "vault",
    emoji: "📁",
    titleKey: "rooms.vault.title",
    shortKey: "rooms.vault.short",
    titleMy: "မှတ်စုနှင့် အချိန်ဇယား",
    titleEn: "Vault & Calendar",
    shortMy: "မှတ်စု",
    shortEn: "Vault",
    defaultPageKey: "vault",
    icon: Lightbulb,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [{ key: "vault", labelKey: "nav.vault", labelMy: "မှတ်စုနှင့် အချိန်ဇယား", labelEn: "Vault & Calendar", icon: FolderKanban }],
  },
]

export function getRoomForPageKey(pageKey: string): WorkspaceRoom {
  return (
    WORKSPACE_ROOMS.find((room) => room.tabs.some((tab) => tab.key === pageKey)) ??
    WORKSPACE_ROOMS[0]
  )
}

export function getRoomTitle(room: WorkspaceRoom, language: Language): string {
  return t(language, room.titleKey)
}

export function getRoomShort(room: WorkspaceRoom, language: Language): string {
  return t(language, room.shortKey)
}

export function getTabLabel(tab: RoomTab, language: Language): string {
  return t(language, tab.labelKey)
}
