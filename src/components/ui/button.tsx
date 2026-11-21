"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn, triggerHaptic } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[14px] text-sm font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B] hover:bg-[#292524] dark:hover:bg-[#E7E5E4]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FFFFFF] dark:bg-[#27272A] hover:bg-[#F5F2ED] dark:hover:bg-[#3F3F46]/60 hover:text-foreground",
        secondary:
          "bg-[#F0EDE8] dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] dark:hover:bg-[#3F3F46]",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-[#1C1917] dark:text-[#F5F5F4] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[44px] px-4 py-2",
        sm: "h-9 rounded-[11px] px-3",
        lg: "min-h-[48px] rounded-[16px] px-8",
        icon: "h-10 w-10 rounded-[12px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
  size?: "default" | "sm" | "lg" | "icon"
  disableHaptic?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, disableHaptic = false, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disableHaptic && !props.disabled) {
        triggerHaptic(10)
      }
      onClick?.(e)
    }

    return (
      <button
        ref={ref}
        onClick={handleClick}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
