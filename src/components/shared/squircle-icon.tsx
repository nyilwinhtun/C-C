"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SquircleTone =
  | "blue"
  | "indigo"
  | "emerald"
  | "amber"
  | "orange"
  | "rose"
  | "purple"
  | "cyan"
  | "slate"

const TONE_CLASSES: Record<SquircleTone, string> = {
  blue: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  indigo: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  emerald: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  amber: "bg-amber-700/10 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300",
  orange: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  rose: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  purple: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  cyan: "bg-[#1C1917]/[0.06] text-[#1C1917] dark:bg-[#F5F5F4]/[0.08] dark:text-[#F5F5F4]",
  slate: "bg-[#1C1917]/[0.06] text-[#57534E] dark:bg-[#F5F5F4]/[0.08] dark:text-[#A1A1AA]",
}

interface SquircleIconProps {
  icon: LucideIcon
  tone?: SquircleTone
  size?: "sm" | "md" | "lg"
  active?: boolean
  className?: string
  iconClassName?: string
}

export function SquircleIcon({
  icon: Icon,
  tone = "blue",
  size = "md",
  active = false,
  className,
  iconClassName,
}: SquircleIconProps) {
  const sizeClass =
    size === "sm"
      ? "w-7 h-7 rounded-[8px]"
      : size === "lg"
        ? "w-10 h-10 rounded-[12px]"
        : "w-8 h-8 rounded-[10px]"

  const iconSizeClass =
    size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors",
        sizeClass,
        active
          ? "bg-[#FAF8F5]/15 text-[#FAF8F5] dark:bg-[#18181B]/15 dark:text-[#18181B]"
          : TONE_CLASSES[tone],
        className
      )}
      aria-hidden="true"
    >
      <Icon className={cn(iconSizeClass, iconClassName)} strokeWidth={1.75} />
    </span>
  )
}

