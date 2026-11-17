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
      aria-label="Content Creator Logo"
      role="img"
      {...props}
    >
      <defs>
        {/* Outer Background Gradient */}
        <linearGradient id="cc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="50%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Paper & Border Gradients */}
        <linearGradient id="cc-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.3" />
        </linearGradient>

        <linearGradient id="cc-paper" x1="15%" y1="15%" x2="85%" y2="85%">
          <stop offset="0%" stopColor="#312E81" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1E293B" stopOpacity="0.85" />
        </linearGradient>

        {/* Dynamic Pen & Writing Gradients */}
        <linearGradient id="cc-c1-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="40%" stopColor="#818CF8" />
          <stop offset="70%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>

        <linearGradient id="cc-c2-flow" x1="0%" y1="30%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>

        <linearGradient id="cc-pen-barrel" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="40%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>

        {/* Glow Filters */}
        <filter id="cc-filter-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="cc-spark-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Rounded Squircle Backdrop */}
      <rect width="100" height="100" rx="22" fill="url(#cc-bg)" />
      <rect
        width="98"
        height="98"
        x="1"
        y="1"
        rx="21"
        fill="none"
        stroke="url(#cc-border)"
        strokeWidth="1.5"
      />

      {/* Stylized Angled Document Sheet */}
      <g transform="translate(4, 2)">
        <path
          d="M24 20 C24 17.5 26 15.5 28.5 15.5 H55 L70 30.5 V73.5 C70 76 68 78 65.5 78 H28.5 C26 78 24 76 24 73.5 Z"
          fill="url(#cc-paper)"
          stroke="#4338CA"
          strokeWidth="1.2"
        />
        {/* Folded paper corner */}
        <path
          d="M55 15.5 V28 C55 29.5 56.5 30.5 58 30.5 H70 Z"
          fill="#4F46E5"
          fillOpacity="0.8"
          stroke="#6366F1"
          strokeWidth="1"
        />
        {/* Subtle document grid / lines */}
        <line x1="32" y1="33" x2="48" y2="33" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="32" y1="41" x2="44" y2="41" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.25" />
      </g>

      {/* Second 'C' curving dynamically outward from the paper/lines */}
      <path
        d="M68 45 C65.5 36.5 57 32 46.5 34 C33.5 36.5 26.5 48.5 27.5 61 C28.5 72.5 38 80.5 50.5 79.5 C59.5 78.5 66.5 72.5 69.5 63.5"
        fill="none"
        stroke="url(#cc-c2-flow)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* First 'C' drafted cleanly with glowing pencil stroke */}
      <path
        d="M58 37 C49 30 37.5 32 30.5 40.5 C22 51 23.5 66 33.5 73.5 C41.5 79 51.5 77 58 70"
        fill="none"
        stroke="url(#cc-c1-glow)"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#cc-filter-glow)"
      />

      {/* Glowing Drafting Pen/Pencil */}
      <g transform="translate(5, -2) rotate(6 57 36)">
        {/* Pen barrel */}
        <path
          d="M58 19 L77 38 L72 43 L53 24 Z"
          fill="url(#cc-pen-barrel)"
        />
        {/* Pen top tip/accent */}
        <path
          d="M77 38 L81 42 L77.5 45.5 L72 43 Z"
          fill="#FDE047"
        />
        {/* Pen nib cone */}
        <path
          d="M53 24 L46 20.5 L58 19 Z"
          fill="#F1F5F9"
        />
        {/* Glowing pen nib point spark */}
        <circle cx="46" cy="20.5" r="2.2" fill="#F97316" filter="url(#cc-spark-glow)" />
      </g>

      {/* Spark / Star Accents */}
      {/* Top Right Star Accent */}
      <path
        d="M82 17 Q82 22 87 22 Q82 22 82 27 Q82 22 77 22 Q82 22 82 17 Z"
        fill="#FDE047"
        filter="url(#cc-spark-glow)"
      />
      {/* Lower Left Star Accent */}
      <path
        d="M17 76 Q17 80 21 80 Q17 80 17 84 Q17 80 13 80 Q17 80 17 76 Z"
        fill="#38BDF8"
        filter="url(#cc-spark-glow)"
      />

      {/* Tiny Sparkle Specks */}
      <circle cx="78" cy="66" r="1.5" fill="#FB923C" opacity="0.85" />
      <circle cx="21" cy="28" r="1.2" fill="#C084FC" opacity="0.75" />
      <circle cx="49" cy="20" r="1" fill="#FEF08A" opacity="0.9" />
    </svg>
  )
}

