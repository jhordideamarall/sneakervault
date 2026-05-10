"use client";

import * as React from "react";
import { cn } from "./cn";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  isOnline?: boolean;
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

export function Avatar({
  src,
  alt,
  fallback,
  size = "md",
  isOnline,
  className,
  ...props
}: AvatarProps) {
  const [error, setError] = React.useState(false);

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          "relative flex shrink-0 overflow-hidden rounded-full bg-white/[0.05] border border-white/[0.08]",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src && !error ? (
          <img
            src={src}
            alt={alt}
            onError={() => setError(true)}
            className="aspect-square h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-medium text-white/40 uppercase">
            {fallback || alt?.slice(0, 2) || "??"}
          </div>
        )}
      </div>
      
      {isOnline !== undefined && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-[#262626]",
            isOnline ? "bg-emerald-500" : "bg-white/20",
            size === "sm" ? "size-2.5" : "size-3"
          )} 
        />
      )}
    </div>
  );
}
