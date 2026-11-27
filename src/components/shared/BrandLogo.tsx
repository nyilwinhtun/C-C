import React from "react"
import { cn } from "@/lib/utils"

export interface BrandLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number | string
}

/**
 * Ultra-simple minimalist Content Creator (CC) brand mark.
 * Flat matte charcoal (#141414) rounded-square badge with subtle 1px border
 * and crisp white (#FFFFFF) bold geometric "CC" monogram.
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
        stroke="#FFFFFF"
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <path
        d="M44.77 40.97A13.5 13.5 0 1 0 44.77 59.03"
        stroke="#FFFFFF"
        strokeWidth="7.8"
        strokeLinecap="round"
      />
      <path
        d="M78.77 40.97A13.5 13.5 0 1 0 78.77 59.03"
        stroke="#FFFFFF"
        strokeWidth="7.8"
        strokeLinecap="round"
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
