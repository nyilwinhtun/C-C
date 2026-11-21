"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"

export interface SegmentedOption<T extends string = string> {
  value: T
  label: string
  icon?: LucideIcon
  badge?: React.ReactNode
}

interface IosSegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
  fullWidthOnMobile?: boolean
}

export function IosSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  fullWidthOnMobile = true,
}: IosSegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [thumbStyle, setThumbStyle] = useState<{ left: number; width: number; top: number; height: number } | null>(
    null
  )

  const updateThumb = () => {
    const activeBtn = buttonRefs.current[value]
    const container = containerRef.current
    if (!activeBtn || !container) return
    setThumbStyle({
      left: activeBtn.offsetLeft,
      top: activeBtn.offsetTop,
      width: activeBtn.offsetWidth,
      height: activeBtn.offsetHeight,
    })
  }

  useLayoutEffect(() => {
    updateThumb()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length])

  useEffect(() => {
    const handleResize = () => updateThumb()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex flex-wrap sm:flex-nowrap items-center gap-0.5 rounded-[14px] bg-[#F0EDE8] dark:bg-[#27272A] p-1 border border-[#E7E5E4] dark:border-[#3F3F46]",
        fullWidthOnMobile ? "w-full sm:w-auto" : "w-auto",
        className
      )}
    >
      {thumbStyle && (
        <span
          aria-hidden="true"
          className="absolute rounded-[11px] bg-white dark:bg-[#3F3F46] shadow-xs transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] pointer-events-none"
          style={{
            left: thumbStyle.left,
            top: thumbStyle.top,
            width: thumbStyle.width,
            height: thumbStyle.height,
          }}
        />
      )}

      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[opt.value] = el
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (opt.value !== value) {
                triggerHaptic(8)
                onChange(opt.value)
              }
            }}
            className={cn(
              "relative z-10 flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-[11px] px-3 py-1.5 text-xs sm:text-[13px] font-medium transition-colors duration-150 cursor-pointer font-myanmar whitespace-nowrap select-none active:scale-[0.98]",
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-colors",
                  isActive ? "text-[#1C1917] dark:text-[#F5F5F4]" : "text-muted-foreground"
                )}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            <span>{opt.label}</span>
            {opt.badge}
          </button>
        )
      })}
    </div>
  )
}

