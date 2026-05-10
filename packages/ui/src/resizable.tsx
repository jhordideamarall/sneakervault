"use client"

import { GripVertical } from "lucide-react"
import { Panel, Group, Separator } from "react-resizable-panels"

import * as React from "react"

import { cn } from "./cn"

const ResizablePanelGroup = ({
  className,
  direction,
  ...props
}: Omit<React.ComponentProps<typeof Group>, 'orientation'> & {
  direction: "horizontal" | "vertical"
}) => (
  <Group
    orientation={direction}
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) => (
  <Separator
    className={cn(
      "relative flex w-3 items-center justify-center bg-transparent transition-all focus-visible:outline-none data-[panel-group-direction=vertical]:h-3 data-[panel-group-direction=vertical]:w-full cursor-col-resize data-[panel-group-direction=vertical]:cursor-row-resize",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="absolute z-10 flex h-6 w-4 items-center justify-center rounded-md border border-white/10 bg-[#262626] shadow-xl group-hover:scale-110 transition-transform">
        <GripVertical className="h-3 w-3 text-white/40" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
