import {
  BookOpen,
  Camera,
  FileText,
  FolderKanban,
  Home,
  Mic,
  PenLine,
  QrCode,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { Language } from "@/store/useUIStore"
import type { SquircleTone } from "@/components/shared/squircle-icon"
import { t } from "@/locales/translations"

export type ToolBadgeKind = "instant" | "noApi"

export interface RoomTab {
  key: string
  labelKey: string
  labelMy: string
  labelEn: string
  icon: LucideIcon
  badge?: ToolBadgeKind
}

export interface WorkspaceRoom {
  id: "home" | "media" | "audio" | "write" | "vault"
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

export interface StudioToolItem {
  id: "socialQr" | "studio" | "voiceover" | "presenter3d" | "text"
  pageKey: string
  matchPageKeys: string[]
  titleKey: string
  shortTitleKey: string
  descKey: string
  icon: LucideIcon
  tone: SquircleTone
  badges?: ToolBadgeKind[]
}

/**
 * Primary studio tools ordered to prioritize instant, zero-API browser-native tools first.
 * Shared by the Dashboard/Home cards and Desktop Sidebar navigation.
 */
export const STUDIO_TOOLS: StudioToolItem[] = [
  {
    id: "socialQr",
    pageKey: "socialQr",
    matchPageKeys: ["socialQr"],
    titleKey: "home.tool.socialQr.title",
    shortTitleKey: "nav.socialQr",
    descKey: "home.tool.socialQr.desc",
    icon: QrCode,
    tone: "emerald",
    badges: ["instant", "noApi"],
  },
  {
    id: "studio",
    pageKey: "studio",
    matchPageKeys: ["studio"],
    titleKey: "home.tool.studio.title",
    shortTitleKey: "nav.studio",
    descKey: "home.tool.studio.desc",
    icon: Camera,
    tone: "amber",
    badges: ["noApi"],
  },
  {
    id: "voiceover",
    pageKey: "voiceover",
    matchPageKeys: ["voiceover", "transcriber", "audiobook"],
    titleKey: "home.tool.voiceover.title",
    shortTitleKey: "nav.voiceover",
    descKey: "home.tool.voiceover.desc",
    icon: Mic,
    tone: "slate",
  },
  {
    id: "presenter3d",
    pageKey: "presenter3d",
    matchPageKeys: ["presenter3d"],
    titleKey: "home.tool.presenter3d.title",
    shortTitleKey: "nav.presenter3d",
    descKey: "home.tool.presenter3d.desc",
    icon: Sparkles,
    tone: "slate",
  },
  {
    id: "text",
    pageKey: "text",
    matchPageKeys: ["text", "video"],
    titleKey: "home.tool.text.title",
    shortTitleKey: "nav.text",
    descKey: "home.tool.text.desc",
    icon: PenLine,
    tone: "slate",
  },
]

/**
 * 5 uncluttered primary rooms for mobile bottom tab navigation and room header/segmented control.
 * Instant zero-API tools (Studio: Social Link & QR, Photo & Poster) come immediately after Home.
 */
export const WORKSPACE_ROOMS: WorkspaceRoom[] = [
  {
    id: "home",
    emoji: "🏠",
    titleKey: "rooms.home.title",
    shortKey: "rooms.home.short",
    titleMy: "ပင်မ စတူဒီယို",
    titleEn: "Creator Home",
    shortMy: "ပင်မ",
    shortEn: "Home",
    defaultPageKey: "home",
    icon: Home,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [{ key: "home", labelKey: "nav.home", labelMy: "ပင်မ", labelEn: "Home", icon: Home }],
  },
  {
    id: "media",
    emoji: "🎨",
    titleKey: "rooms.media.title",
    shortKey: "rooms.media.short",
    titleMy: "QR နှင့် ဓာတ်ပုံစတူဒီယို",
    titleEn: "Visual & QR Studio",
    shortMy: "စတူဒီယို",
    shortEn: "Studio",
    defaultPageKey: "socialQr",
    icon: Camera,
    tone: "slate",
    activeColorClass: "text-[#1C1917] dark:text-[#F5F5F4]",
    activePillClass: "bg-[#1C1917]/10 dark:bg-[#F5F5F4]/12",
    tabs: [
      {
        key: "socialQr",
        labelKey: "nav.socialQr",
        labelMy: "Social QR",
        labelEn: "Social Link & QR",
        icon: QrCode,
        badge: "instant",
      },
      {
        key: "studio",
        labelKey: "nav.studio",
        labelMy: "ဓာတ်ပုံနှင့် ပိုစတာ",
        labelEn: "Photo & Poster",
        icon: Camera,
        badge: "noApi",
      },
      {
        key: "presenter3d",
        labelKey: "nav.presenter3d",
        labelMy: "2D/3D တင်ဆက်သူ",
        labelEn: "Presenter (2D/3D)",
        icon: Sparkles,
      },
    ],
  },
  {
    id: "audio",
    emoji: "🎙️",
    titleKey: "rooms.audio.title",
    shortKey: "rooms.audio.short",
    titleMy: "အသံသွင်းခန်းနှင့် မှတ်စု",
    titleEn: "Voiceover & Booth",
    shortMy: "အသံ",
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
    id: "write",
    emoji: "✍️",
    titleKey: "rooms.write.title",
    shortKey: "rooms.write.short",
    titleMy: "စာသားနှင့် ဇာတ်ညွှန်းရေးမည်",
    titleEn: "Script & Caption Writer",
    shortMy: "စာရေး",
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
    id: "vault",
    emoji: "📁",
    titleKey: "rooms.vault.title",
    shortKey: "rooms.vault.short",
    titleMy: "မှတ်စုနှင့် အချိန်ဇယား",
    titleEn: "Vault & Calendar",
    shortMy: "မှတ်စု",
    shortEn: "Vault",
    defaultPageKey: "vault",
    icon: FolderKanban,
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
