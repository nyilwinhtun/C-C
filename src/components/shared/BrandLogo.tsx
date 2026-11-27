import React, { useId } from "react"
import { cn } from "@/lib/utils"

export interface BrandLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

/**
 * Reusable Content Creator (CC) vector brand mark.
 * Editorial matte charcoal / obsidian rounded-squircle badge with brushed
 * warm-gold & crisp-silver studio framing, subtle camera aperture hairline,
 * and stylized geometric "CC" monogram with a precision play accent.
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
  const glowSilverId = `cc-glow-silver-${uid}`
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
        {/* Matte Charcoal / Obsidian Studio Squircle Base */}
        <linearGradient id={bgGradId} x1="8" y1="6" x2="92" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232220" />
          <stop offset="52%" stopColor="#161514" />
          <stop offset="100%" stopColor="#0C0B0A" />
        </linearGradient>

        {/* Subtle Top-Left Editorial Satin Sheen */}
        <linearGradient id={glassSheenId} x1="10" y1="4" x2="72" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="38%" stopColor="#E7E0D3" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Brushed Warm Gold -> Neutral Silver -> Warm Gold Border Rim */}
        <linearGradient id={rimGradId} x1="6" y1="6" x2="94" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E6C98B" stopOpacity="0.72" />
          <stop offset="50%" stopColor="#A8A29E" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#C8A45D" stopOpacity="0.72" />
        </linearGradient>

        {/* Subtle Camera Aperture Ring Gradient (Warm Gold & Silver) */}
        <linearGradient id={apertureGradId} x1="16" y1="16" x2="84" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E5E5E4" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#A8A29E" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#D6B46C" stopOpacity="0.52" />
        </linearGradient>

        {/* Stylized Left "C" — Crisp Brushed Silver */}
        <linearGradient id={leftCGradId} x1="20" y1="30" x2="48" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FAFAF9" />
          <stop offset="55%" stopColor="#E7E5E4" />
          <stop offset="100%" stopColor="#B8B3AC" />
        </linearGradient>

        {/* Stylized Right "C" — Warm Editorial Gold */}
        <linearGradient id={rightCGradId} x1="49" y1="30" x2="77" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5E6C4" />
          <stop offset="52%" stopColor="#DFBE7A" />
          <stop offset="100%" stopColor="#B5893D" />
        </linearGradient>

        {/* Precision Play Prism Accent — Warm Brushed Gold */}
        <linearGradient id={accentGradId} x1="61" y1="43" x2="75" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F6E8C8" />
          <stop offset="55%" stopColor="#D8B36A" />
          <stop offset="100%" stopColor="#A87E34" />
        </linearGradient>

        {/* Subtle Editorial Studio Ambient Lighting */}
        <radialGradient id={glowSilverId} cx="20" cy="18" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5F5F4" stopOpacity="0.14" />
          <stop offset="55%" stopColor="#D6D3D1" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#D6D3D1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowGoldId} cx="82" cy="84" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.2" />
          <stop offset="55%" stopColor="#B88E44" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#B88E44" stopOpacity="0" />
        </radialGradient>

        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="24" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Matte Obsidian Squircle Base */}
        <rect x="2" y="2" width="96" height="96" rx="24" fill={`url(#${bgGradId})`} />

        {/* Soft Editorial Studio Highlights */}
        <rect x="2" y="2" width="96" height="96" fill={`url(#${glowSilverId})`} />
        <rect x="2" y="2" width="96" height="96" fill={`url(#${glowGoldId})`} />

        {/* Satin Top Specular Reflection */}
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
          strokeWidth="1.25"
          strokeDasharray="17 6.5 7 6.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <circle
          cx="50"
          cy="50"
          r="29.5"
          stroke="#FFFFFF"
          strokeOpacity="0.07"
          strokeWidth="1"
        />

        {/* Minimalist Viewfinder Corner Ticks */}
        <path
          d="M16.5 24.5V20C16.5 18.067 18.067 16.5 20 16.5H24.5"
          stroke="#E7E5E4"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M83.5 75.5V80C83.5 81.933 81.933 83.5 80 83.5H75.5"
          stroke="#E6C98B"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Stylized Geometric "CC" Monogram (Custom Vector Paths) */}
        {/* Left C — Crisp Silver */}
        <path
          d="M46.2 36.2C43.5 33.8 40 32.3 36 32.3C27 32.3 20.5 39.5 20.5 50C20.5 60.5 27 67.7 36 67.7C40.1 67.7 43.6 66.2 46.3 63.7"
          stroke={`url(#${leftCGradId})`}
          strokeWidth="6.8"
          strokeLinecap="round"
        />

        {/* Right C — Warm Gold */}
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
      </g>

      {/* Outer Brushed Gold & Silver Studio Rim */}
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
 * warm-gold & brushed-silver border shimmer and soft breathing ambient glow
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
            ? "bg-gradient-to-tr from-stone-300/40 via-amber-200/32 to-stone-400/40 dark:from-stone-300/32 dark:via-amber-300/28 dark:to-stone-400/32"
            : focusedField === "email"
            ? "bg-gradient-to-tr from-amber-300/42 via-yellow-200/32 to-stone-300/38 dark:from-amber-400/38 dark:via-amber-200/30 dark:to-stone-300/30"
            : "bg-gradient-to-tr from-amber-300/30 via-stone-300/25 to-amber-400/30 dark:from-amber-400/30 dark:via-stone-400/24 dark:to-amber-300/28"
        )}
      />

      {/* Rotating Conic-Gradient Border Shimmer Frame (GPU-accelerated) */}
      <div
        className={cn(
          "relative rounded-[20px] p-[2px] overflow-hidden shadow-lg transition-transform duration-500",
          isFocused
            ? "scale-[1.04] shadow-amber-950/20 dark:shadow-black/65"
            : "shadow-stone-900/15 dark:shadow-black/55"
        )}
      >
        {/* Static Fallback Gradient Rim (always crisp under prefers-reduced-motion) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-br from-[#E6C98B]/75 via-[#A8A29E]/50 to-[#C8A45D]/75 opacity-75"
        />

        {/* Smooth Rotating Warm-Gold & Silver Border Shimmer */}
        <div
          aria-hidden="true"
          className="studio-emblem-halo-spin pointer-events-none absolute -inset-[65%]"
          style={{
            background:
              focusedField === "password"
                ? "conic-gradient(from 0deg, transparent 0deg, rgba(245,245,244,0.95) 50deg, rgba(214,211,209,0.85) 115deg, rgba(216,179,106,0.92) 175deg, transparent 235deg, rgba(231,229,228,0.72) 305deg, transparent 360deg)"
                : "conic-gradient(from 0deg, transparent 0deg, rgba(230,201,139,0.96) 55deg, rgba(245,245,244,0.92) 120deg, rgba(200,164,93,0.94) 185deg, transparent 245deg, rgba(214,211,209,0.75) 310deg, transparent 360deg)",
          }}
        />

        {/* Inner Matte Obsidian Bezel + Crisp BrandLogo */}
        <div className="relative rounded-[18px] bg-[#121110]/94 p-[2px] backdrop-blur-md">
          <BrandLogo
            size={size}
            className="block rounded-[16px]"
          />
        </div>
      </div>
    </div>
  )
}
