import React, { useId } from "react"
import { cn } from "@/lib/utils"

interface CCLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

export function CCLogo({ className, size = 36, ...props }: CCLogoProps) {
  const uid = useId().replace(/:/g, "")
  const bgGradId = `cc-bg-${uid}`
  const glassSheenId = `cc-sheen-${uid}`
  const rimGradId = `cc-rim-${uid}`
  const apertureGradId = `cc-aperture-${uid}`
  const monogramGradId = `cc-mono-${uid}`
  const accentGradId = `cc-accent-${uid}`
  const clipId = `cc-clip-${uid}`

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
      <defs>
        {/* Deep Obsidian-Studio Glass Squircle Base */}
        <linearGradient id={bgGradId} x1="10" y1="6" x2="90" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#26232B" />
          <stop offset="48%" stopColor="#19181F" />
          <stop offset="100%" stopColor="#111116" />
        </linearGradient>

        {/* Top-Left Diagonal Frosted Glass Specular Sheen */}
        <linearGradient id={glassSheenId} x1="12" y1="4" x2="72" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="38%" stopColor="#FDE68A" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Subtle Iridescent Studio Border Rim */}
        <linearGradient id={rimGradId} x1="8" y1="8" x2="92" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCD34D" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#FB7185" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.55" />
        </linearGradient>

        {/* Camera / Studio Aperture Ring Gradient */}
        <linearGradient id={apertureGradId} x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#F472B6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#818CF8" stopOpacity="0.6" />
        </linearGradient>

        {/* Crisp Luminous Pearl-Silver Monogram Fill */}
        <linearGradient id={monogramGradId} x1="22" y1="26" x2="76" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="55%" stopColor="#F5F5F4" />
          <stop offset="100%" stopColor="#D6D3D1" />
        </linearGradient>

        {/* Warm Studio Amber-Rose Play / Rec Accent */}
        <linearGradient id={accentGradId} x1="66" y1="22" x2="82" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="55%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>

        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="25" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Squircle Studio Glass Fill */}
        <rect x="2" y="2" width="96" height="96" rx="25" fill={`url(#${bgGradId})`} />

        {/* Soft Ambient Internal Studio Glows */}
        <circle cx="24" cy="22" r="32" fill="#F59E0B" fillOpacity="0.14" />
        <circle cx="80" cy="80" r="34" fill="#8B5CF6" fillOpacity="0.18" />

        {/* Frosted Top Glass Reflection */}
        <path
          d="M2 27C2 13.1929 13.1929 2 27 2H73C86.8071 2 98 13.1929 98 27V36C74 47 38 49 2 38V27Z"
          fill={`url(#${glassSheenId})`}
        />

        {/* Subtle Camera / Lens Aperture Ring & Viewfinder Arcs */}
        <circle
          cx="50"
          cy="50"
          r="35.5"
          stroke={`url(#${apertureGradId})`}
          strokeWidth="1.25"
          strokeDasharray="18 7 8 7"
          strokeLinecap="round"
          opacity="0.78"
        />
        <circle
          cx="50"
          cy="50"
          r="29.5"
          stroke="#FFFFFF"
          strokeOpacity="0.09"
          strokeWidth="1"
        />

        {/* Corner Viewfinder Framing Ticks */}
        <path
          d="M17 25V20.5C17 18.567 18.567 17 20.5 17H25"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M83 75V79.5C83 81.433 81.433 83 79.5 83H75"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Stylized Geometric "CC" Monogram (Custom Vector Paths) */}
        {/* Left C */}
        <path
          d="M46.5 36.2C43.8 33.9 40.3 32.5 36.4 32.5C27.5 32.5 21 39.6 21 50C21 60.4 27.5 67.5 36.4 67.5C40.4 67.5 43.9 66.1 46.6 63.7"
          stroke={`url(#${monogramGradId})`}
          strokeWidth="6.4"
          strokeLinecap="round"
        />

        {/* Right C (optically paired with subtle studio depth) */}
        <path
          d="M75.5 36.2C72.8 33.9 69.3 32.5 65.4 32.5C56.5 32.5 50 39.6 50 50C50 60.4 56.5 67.5 65.4 67.5C69.4 67.5 72.9 66.1 75.6 63.7"
          stroke={`url(#${monogramGradId})`}
          strokeWidth="6.4"
          strokeLinecap="round"
        />

        {/* Play / Aperture Prism Accent Nestled in Right C Focus */}
        <path
          d="M64.2 44.3L73.6 49.4C74.5 49.9 74.5 51.1 73.6 51.6L64.2 56.7C63.3 57.2 62.2 56.5 62.2 55.5V45.5C62.2 44.5 63.3 43.8 64.2 44.3Z"
          fill={`url(#${accentGradId})`}
        />

        {/* Subtle Top-Right Studio Live Beacon Dot */}
        <circle cx="78.5" cy="21.5" r="3" fill={`url(#${accentGradId})`} />
      </g>

      {/* Outer Crisp Glass Rim */}
      <rect
        x="2.75"
        y="2.75"
        width="94.5"
        height="94.5"
        rx="24.25"
        stroke={`url(#${rimGradId})`}
        strokeWidth="1.5"
      />
    </svg>
  )
}

interface StudioEmblemProps {
  size?: number
  focusedField?: "email" | "password" | null
  className?: string
}

export function StudioEmblem({
  size = 60,
  focusedField = null,
  className,
}: StudioEmblemProps) {
  const isFocused = focusedField !== null

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        className
      )}
    >
      {/* Soft Ambient Breathing Glow (GPU-accelerated) */}
      <div
        aria-hidden="true"
        className={cn(
          "studio-emblem-breathe pointer-events-none absolute -inset-3 rounded-[28px] blur-xl transition-colors duration-500",
          focusedField === "password"
            ? "bg-gradient-to-tr from-indigo-500/45 via-violet-500/35 to-emerald-400/40 dark:from-indigo-500/50 dark:via-violet-500/40 dark:to-emerald-400/45"
            : focusedField === "email"
            ? "bg-gradient-to-tr from-amber-500/50 via-rose-500/40 to-violet-500/40 dark:from-amber-400/50 dark:via-rose-500/45 dark:to-violet-500/45"
            : "bg-gradient-to-tr from-amber-400/35 via-rose-400/28 to-violet-500/35 dark:from-amber-400/35 dark:via-rose-500/30 dark:to-violet-500/40"
        )}
      />

      {/* Rotating Conic-Gradient Halo Ring Frame (GPU-accelerated transform rotate) */}
      <div
        className={cn(
          "relative rounded-[20px] p-[2px] overflow-hidden shadow-lg transition-transform duration-500",
          isFocused
            ? "scale-[1.04] shadow-amber-900/15 dark:shadow-violet-950/50"
            : "shadow-stone-900/15 dark:shadow-black/50"
        )}
      >
        {/* Static subtle base rim so reduced-motion still has a crisp gradient halo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-br from-amber-400/60 via-rose-400/45 to-violet-500/60 opacity-65"
        />

        {/* Rotating Gradient Border Shimmer Layer */}
        <div
          aria-hidden="true"
          className="studio-emblem-halo-spin pointer-events-none absolute -inset-[65%]"
          style={{
            background:
              focusedField === "password"
                ? "conic-gradient(from 0deg, transparent 0deg, rgba(99,102,241,0.95) 55deg, rgba(168,85,247,0.9) 115deg, rgba(52,211,153,0.9) 170deg, transparent 235deg, rgba(56,189,248,0.75) 305deg, transparent 360deg)"
                : "conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,0.95) 55deg, rgba(251,113,133,0.92) 115deg, rgba(167,139,250,0.95) 175deg, transparent 240deg, rgba(56,189,248,0.7) 305deg, transparent 360deg)",
          }}
        />

        {/* Inner Frosted Bezel + Bespoke SVG Brand Mark */}
        <div className="relative rounded-[18px] bg-[#141418]/90 p-[2px] backdrop-blur-md">
          <CCLogo
            size={size}
            className="block rounded-[16px]"
          />
        </div>
      </div>
    </div>
  )
}
