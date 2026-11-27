import React, { useId } from "react"
import { cn } from "@/lib/utils"

export interface BrandLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

/**
 * Reusable Content Creator (CC) vector brand mark.
 * Features a dark-glass rounded-squircle studio badge, subtle camera aperture &
 * play/sparkle accent, and stylized geometric "CC" monogram with luminous
 * cyan-to-violet/gold studio gradients.
 */
export function BrandLogo({ className, size = 36, ...props }: BrandLogoProps) {
  const uid = useId().replace(/:/g, "")
  const bgGradId = `cc-bg-${uid}`
  const glassSheenId = `cc-sheen-${uid}`
  const rimGradId = `cc-rim-${uid}`
  const apertureGradId = `cc-aperture-${uid}`
  const leftCGradId = `cc-left-${uid}`
  const rightCGradId = `cc-right-${uid}`
  const accentGradId = `cc-accent-${uid}`
  const sparkleGradId = `cc-sparkle-${uid}`
  const glowCyanId = `cc-glow-cyan-${uid}`
  const glowVioletId = `cc-glow-violet-${uid}`
  const glowGoldId = `cc-glow-gold-${uid}`
  const clipId = `cc-clip-${uid}`

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
      <defs>
        {/* Deep Dark-Glass Obsidian Studio Squircle Base */}
        <linearGradient id={bgGradId} x1="8" y1="6" x2="92" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B1E2E" />
          <stop offset="50%" stopColor="#12131D" />
          <stop offset="100%" stopColor="#090A10" />
        </linearGradient>

        {/* Top-Left Diagonal Frosted Glass Specular Sheen */}
        <linearGradient id={glassSheenId} x1="10" y1="4" x2="74" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
          <stop offset="35%" stopColor="#67E8F9" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Luminous Cyan -> Violet -> Gold Border Rim */}
        <linearGradient id={rimGradId} x1="6" y1="6" x2="94" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.82" />
          <stop offset="50%" stopColor="#A855F7" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.82" />
        </linearGradient>

        {/* Subtle Camera Aperture Ring Gradient */}
        <linearGradient id={apertureGradId} x1="16" y1="16" x2="84" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.72" />
          <stop offset="52%" stopColor="#C084FC" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.72" />
        </linearGradient>

        {/* Stylized Left "C" — Luminous Cyan to Pearl-Violet */}
        <linearGradient id={leftCGradId} x1="20" y1="30" x2="48" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="52%" stopColor="#F0F9FF" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>

        {/* Stylized Right "C" — Pearl-Violet to Warm Studio Gold */}
        <linearGradient id={rightCGradId} x1="49" y1="30" x2="77" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="52%" stopColor="#F5F3FF" />
          <stop offset="100%" stopColor="#FDE68A" />
        </linearGradient>

        {/* Play Prism Accent — Cyan -> Violet -> Gold */}
        <linearGradient id={accentGradId} x1="61" y1="43" x2="75" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>

        {/* Studio Sparkle Accent — Gold to Cyan */}
        <linearGradient id={sparkleGradId} x1="72" y1="16" x2="84" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#67E8F9" />
        </linearGradient>

        {/* Smooth Radial Ambient Studio Glows */}
        <radialGradient id={glowCyanId} cx="20" cy="18" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.32" />
          <stop offset="55%" stopColor="#06B6D4" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowVioletId} cx="82" cy="84" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A855F7" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowGoldId} cx="80" cy="20" r="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.24" />
          <stop offset="60%" stopColor="#F59E0B" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>

        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="24" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Dark-Glass Squircle Studio Fill */}
        <rect x="2" y="2" width="96" height="96" rx="24" fill={`url(#${bgGradId})`} />

        {/* Soft Ambient Internal Studio Glows */}
        <rect x="2" y="2" width="96" height="96" fill={`url(#${glowCyanId})`} />
        <rect x="2" y="2" width="96" height="96" fill={`url(#${glowVioletId})`} />
        <rect x="2" y="2" width="96" height="96" fill={`url(#${glowGoldId})`} />

        {/* Frosted Top-Glass Specular Reflection */}
        <path
          d="M2 26C2 12.7452 12.7452 2 26 2H74C87.2548 2 98 12.7452 98 26V35C73 46.5 37 48.5 2 37.5V26Z"
          fill={`url(#${glassSheenId})`}
        />

        {/* Subtle Camera Aperture Ring & Inner Lens Hairline */}
        <circle
          cx="50"
          cy="50"
          r="36"
          stroke={`url(#${apertureGradId})`}
          strokeWidth="1.3"
          strokeDasharray="17 6.5 7 6.5"
          strokeLinecap="round"
          opacity="0.82"
        />
        <circle
          cx="50"
          cy="50"
          r="29.5"
          stroke="#FFFFFF"
          strokeOpacity="0.08"
          strokeWidth="1"
        />

        {/* Minimalist Viewfinder Corner Ticks */}
        <path
          d="M16.5 24.5V20C16.5 18.067 18.067 16.5 20 16.5H24.5"
          stroke="#67E8F9"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M83.5 75.5V80C83.5 81.933 81.933 83.5 80 83.5H75.5"
          stroke="#FDE68A"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Stylized Geometric "CC" Monogram (Custom Vector Paths) */}
        {/* Left C */}
        <path
          d="M46.2 36.2C43.5 33.8 40 32.3 36 32.3C27 32.3 20.5 39.5 20.5 50C20.5 60.5 27 67.7 36 67.7C40.1 67.7 43.6 66.2 46.3 63.7"
          stroke={`url(#${leftCGradId})`}
          strokeWidth="6.8"
          strokeLinecap="round"
        />

        {/* Right C */}
        <path
          d="M75.8 36.2C73.1 33.8 69.6 32.3 65.6 32.3C56.6 32.3 50.1 39.5 50.1 50C50.1 60.5 56.6 67.7 65.6 67.7C69.7 67.7 73.2 66.2 75.9 63.7"
          stroke={`url(#${rightCGradId})`}
          strokeWidth="6.8"
          strokeLinecap="round"
        />

        {/* Play Prism Accent Nestled in Right C Focus */}
        <path
          d="M64.4 44.1L74.1 49.3C75 49.8 75 51.1 74.1 51.6L64.4 56.8C63.5 57.3 62.4 56.6 62.4 55.6V45.3C62.4 44.3 63.5 43.6 64.4 44.1Z"
          fill={`url(#${accentGradId})`}
        />

        {/* 4-Point Studio Sparkle Accent (Top-Right) */}
        <path
          d="M78 16.5L79.35 20.65L83.5 22L79.35 23.35L78 27.5L76.65 23.35L72.5 22L76.65 20.65L78 16.5Z"
          fill={`url(#${sparkleGradId})`}
        />
      </g>

      {/* Outer Crisp Glass Rim */}
      <rect
        x="2.75"
        y="2.75"
        width="94.5"
        height="94.5"
        rx="23.25"
        stroke={`url(#${rimGradId})`}
        strokeWidth="1.5"
      />
    </svg>
  )
}

export interface AnimatedBrandEmblemProps {
  size?: number
  focusedField?: "email" | "password" | null
  className?: string
}

/**
 * Animated Login Emblem wrapping BrandLogo in a GPU-accelerated rotating
 * cyan-violet-gold gradient border shimmer and soft breathing ambient glow
 * (respecting prefers-reduced-motion via CSS).
 */
export function AnimatedBrandEmblem({
  size = 54,
  focusedField = null,
  className,
}: AnimatedBrandEmblemProps) {
  const isFocused = focusedField !== null

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        className
      )}
    >
      {/* Soft Breathing Ambient Glow (GPU-accelerated) */}
      <div
        aria-hidden="true"
        className={cn(
          "studio-emblem-breathe pointer-events-none absolute -inset-3 rounded-[28px] blur-xl transition-colors duration-500",
          focusedField === "password"
            ? "bg-gradient-to-tr from-cyan-400/45 via-violet-500/40 to-indigo-500/45 dark:from-cyan-400/50 dark:via-violet-500/45 dark:to-indigo-400/50"
            : focusedField === "email"
            ? "bg-gradient-to-tr from-cyan-400/45 via-amber-400/40 to-violet-500/45 dark:from-cyan-400/50 dark:via-amber-400/45 dark:to-violet-500/50"
            : "bg-gradient-to-tr from-cyan-400/35 via-violet-500/30 to-amber-400/35 dark:from-cyan-400/40 dark:via-violet-500/35 dark:to-amber-400/35"
        )}
      />

      {/* Rotating Conic-Gradient Border Shimmer Frame (GPU-accelerated) */}
      <div
        className={cn(
          "relative rounded-[20px] p-[2px] overflow-hidden shadow-lg transition-transform duration-500",
          isFocused
            ? "scale-[1.04] shadow-cyan-900/20 dark:shadow-violet-950/60"
            : "shadow-stone-900/15 dark:shadow-black/55"
        )}
      >
        {/* Static Fallback Gradient Rim (always crisp under prefers-reduced-motion) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-br from-cyan-400/75 via-violet-500/55 to-amber-400/75 opacity-75"
        />

        {/* Smooth Rotating Gradient Border Shimmer */}
        <div
          aria-hidden="true"
          className="studio-emblem-halo-spin pointer-events-none absolute -inset-[65%]"
          style={{
            background:
              focusedField === "password"
                ? "conic-gradient(from 0deg, transparent 0deg, rgba(34,211,238,0.98) 50deg, rgba(168,85,247,0.95) 115deg, rgba(99,102,241,0.92) 175deg, transparent 235deg, rgba(251,191,36,0.75) 305deg, transparent 360deg)"
                : "conic-gradient(from 0deg, transparent 0deg, rgba(34,211,238,0.98) 55deg, rgba(168,85,247,0.95) 120deg, rgba(251,191,36,0.96) 185deg, transparent 245deg, rgba(103,232,249,0.75) 310deg, transparent 360deg)",
          }}
        />

        {/* Inner Dark-Glass Bezel + Crisp BrandLogo */}
        <div className="relative rounded-[18px] bg-[#0E1018]/92 p-[2px] backdrop-blur-md">
          <BrandLogo
            size={size}
            className="block rounded-[16px]"
          />
        </div>
      </div>
    </div>
  )
}
