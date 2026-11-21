"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SquircleTone =
  | "blue"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "purple"
  | "cyan"
  | "slate"

const TONE_CLASSES: Record<SquircleTone, string> = {
  blue: "bg-blue-500/12 text-blue-600 dark:bg-[#0A84FF]/18 dark:text-[#0A84FF]",
  indigo: "bg-indigo-500/12 text-indigo-600 dark:bg-indigo-400/18 dark:text-indigo-400",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/18 dark:text-emerald-400",
  amber: "bg-amber-500/12 text-amber-600 dark:bg-amber-400/18 dark:text-amber-400",
  rose: "bg-rose-500/12 text-rose-600 dark:bg-rose-400/18 dark:text-rose-400",
  purple: "bg-purple-500/12 text-purple-600 dark:bg-purple-400/18 dark:text-purple-400",
  cyan: "bg-cyan-500/12 text-cyan-600 dark:bg-cyan-400/18 dark:text-cyan-400",
  slate: "bg-neutral-500/12 text-neutral-600 dark:bg-neutral-400/18 dark:text-neutral-300",
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
          ? "bg-white/20 text-white"
          : TONE_CLASSES[tone],
        className
      )}
      aria-hidden="true"
    >
      <Icon className={cn(iconSizeClass, iconClassName)} strokeWidth={1.75} />
    </span>
  )
}

