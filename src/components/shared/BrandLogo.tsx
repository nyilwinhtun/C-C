import React from "react"
import { cn } from "@/lib/utils"

export interface BrandLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

/**
 * Bespoke minimalist single-C editorial brand mark.
 * Matte charcoal (#141414) rounded-square badge with 1px #2A2A2A border,
 * two interlocking architectural white (#FFFFFF) C strokes, a crisp silver (#A1A1AA)
 * inner link accent, and a balanced circular focal dot in the C opening.
 */
export function BrandLogo({ className, size = 36, ...props }: BrandLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-label="Content Creator Brand Logo"
      role="img"
      {...props}
    >
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx="22"
        fill="#141414"
        stroke="#2A2A2A"
        strokeWidth="1"
      />
      {/* Upper architectural stroke ("Connect") */}
      <path
        d="M 68.70 31.94 A 26 26 0 0 0 24.32 45.93"
        stroke="#FFFFFF"
        strokeWidth="8.5"
        strokeLinecap="butt"
      />
      {/* Lower architectural stroke ("Create") */}
      <path
        d="M 24.32 54.07 A 26 26 0 0 0 68.70 68.06"
        stroke="#FFFFFF"
        strokeWidth="8.5"
        strokeLinecap="butt"
      />
      {/* Crisp silver inner link accent bridging the two strokes */}
      <path
        d="M 42.25 36.58 A 15.5 15.5 0 0 0 42.25 63.42"
        stroke="#A1A1AA"
        strokeWidth="4.8"
        strokeLinecap="butt"
      />
      {/* Clean circular focal dot in the C opening */}
      <circle cx="66.5" cy="50" r="4.5" fill="#FFFFFF" />
    </svg>
  )
}

export interface AnimatedBrandEmblemProps {
  size?: number
  focusedField?: "email" | "password" | null
  className?: string
}

/**
 * Clean minimalist emblem container rendering BrandLogo without spinning rings or glows.
 */
export function AnimatedBrandEmblem({
  size = 52,
  className,
}: AnimatedBrandEmblemProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center select-none",
        className
      )}
    >
      <BrandLogo size={size} className="block" />
    </div>
  )
}
