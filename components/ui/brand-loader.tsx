"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface BrandLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "md" | "lg" | "xl" | "xs"
}

export function BrandLoader({ size = "md", className, ...props }: BrandLoaderProps) {
    const sizeClasses = {
        xs: "h-4 w-4",
        sm: "h-8 w-8",
        md: "h-12 w-12",
        lg: "h-20 w-20",
        xl: "h-32 w-32",
    }

    const borderSizes = {
        xs: "border",
        sm: "border-2",
        md: "border-2",
        lg: "border-4",
        xl: "border-4",
    }

    return (
        <div
            className={cn("relative flex items-center justify-center", sizeClasses[size], className)}
            role="status"
            aria-label="Loading..."
            {...props}
        >
            {/* Outer Shell Red Ring */}
            <div
                className={cn(
                    "absolute inset-0 rounded-full animate-spin border-t-[#DD1D21] border-r-transparent border-b-transparent border-l-transparent",
                    borderSizes[size]
                )}
            />
            {/* Middle Shell Yellow Ring (Slower reverse spin) */}
            <div
                className={cn(
                    "absolute inset-[15%] rounded-full animate-spin border-t-[#FFD500] border-r-transparent border-b-transparent border-l-transparent [animation-direction:reverse] [animation-duration:1.5s]",
                    borderSizes[size]
                )}
            />
            {/* Inner White Ring */}
            <div
                className={cn(
                    "absolute inset-[30%] rounded-full animate-spin border-t-white border-r-transparent border-b-transparent border-l-transparent [animation-duration:0.8s]",
                    borderSizes[size]
                )}
            />
        </div>
    )
}
