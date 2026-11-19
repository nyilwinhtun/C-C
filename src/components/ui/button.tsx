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
          "bg-[#007AFF] dark:bg-[#0A84FF] text-white hover:bg-[#0071EB] dark:hover:bg-[#1E8EFF] shadow-sm shadow-[#007AFF]/20",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-[0.5px] border-[rgba(60,60,67,0.16)] dark:border-[rgba(84,84,88,0.4)] bg-card/80 hover:bg-accent/70 hover:text-accent-foreground",
        secondary:
          "bg-[#E5E5EA] dark:bg-[#2C2C2E] text-foreground hover:bg-[#D8D8DF] dark:hover:bg-[#3A3A3C]",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-[#007AFF] dark:text-[#0A84FF] underline-offset-4 hover:underline",
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
