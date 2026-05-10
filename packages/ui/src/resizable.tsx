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
      "relative flex w-px items-center justify-center bg-white/[0.04] transition-colors hover:bg-white/[0.1] focus-visible:outline-none data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-white/10 bg-[#262626]">
        <GripVertical className="h-2.5 w-2.5 text-white/40" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }


