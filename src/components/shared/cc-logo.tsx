import React from "react"
import { cn } from "@/lib/utils"

interface CCLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

export function CCLogo({ className, size = 36, ...props }: CCLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-label="Content Creator Studio Logo"
      role="img"
      {...props}
    >
      {/* Warm Editorial Paper Backdrop */}
      <rect width="100" height="100" rx="22" fill="#FAF8F5" />
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx="21"
        stroke="#E7E5E4"
        strokeWidth="1.5"
      />
      {/* Subtle Inner Hairline Frame */}
      <rect
        x="7"
        y="7"
        width="86"
        height="86"
        rx="16"
        stroke="#E7E5E4"
        strokeWidth="1"
      />

      {/* Centered Classic Editorial Serif Monogram "CC" */}
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fill="#1C1917"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="40"
        letterSpacing="-1.5"
      >
        CC
      </text>

      {/* Minimalist Horizontal Ink Stroke & Subtle Acoustic Line */}
      <line
        x1="28"
        y1="71"
        x2="44"
        y2="71"
        stroke="#1C1917"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="45.5,71 47,68.5 49,73.5 51,67.5 53,72.5 54.5,71"
        stroke="#57534E"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="56"
        y1="71"
        x2="72"
        y2="71"
        stroke="#1C1917"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
