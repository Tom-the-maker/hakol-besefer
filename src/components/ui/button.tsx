import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary CTA - brand yellow background, dark text
        primary: [
          "bg-brandYellow text-textPrimary font-bold",
          "border border-transparent",
          "shadow-md hover:shadow-lg",
          "hover:-translate-y-0.5", // 2px lift on hover
          "active:translate-y-0",
          "transition-all duration-200",
        ].join(" "),
        
        // Secondary - white background, primary text, subtle border
        secondary: [
          "bg-white text-textPrimary font-semibold",
          "border border-gray-300",
          "hover:bg-surfaceLight",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5", // 2px lift on hover
          "transition-all duration-200",
        ].join(" "),
        
        // Outline - border style, similar to secondary but with different styling
        outline: [
          "bg-transparent text-textPrimary font-semibold",
          "border border-gray-300",
          "hover:bg-surfaceLight",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          "transition-all duration-200",
        ].join(" "),
        
        // Ghost - minimal styling with primary text
        ghost: [
          "bg-transparent text-textPrimary",
          "hover:bg-surfaceLight",
          "border border-transparent",
          "hover:-translate-y-0.5", // 2px lift on hover
          "transition-all duration-200",
        ].join(" "),
        
        // Destructive - for dangerous actions
        destructive: [
          "bg-red-500 text-white font-semibold",
          "border border-transparent",
          "hover:bg-red-600",
          "shadow-md hover:shadow-lg",
          "hover:-translate-y-0.5", // 2px lift on hover
          "transition-all duration-200",
        ].join(" "),

        // Dark variant for darker buttons
        dark: [
          "bg-textPrimary text-white font-semibold",
          "border border-transparent",
          "hover:bg-textSecondary",
          "shadow-md hover:shadow-lg",
          "hover:-translate-y-0.5", // 2px lift on hover
          "transition-all duration-200",
        ].join(" "),
      },
      size: {
        default: "h-12 px-6 py-4 text-base", // Updated to use 48px height
        sm: "h-10 px-4 py-3 text-sm",
        lg: "h-14 px-8 py-5 text-lg", // Updated to use 56px height
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          "rounded-pill", // Use the new design token for pill shape
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
