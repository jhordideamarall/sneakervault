"use client"

import { GripVertical } from "lucide-react"
// @ts-ignore
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

import * as React from "react"

import { cn } from "./cn"

const ResizablePanelGroup = ({
  className,
  ...props
// @ts-ignore
}: React.ComponentProps<typeof PanelGroup>) => (
  // @ts-ignore
  <PanelGroup
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
// @ts-ignore
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  // @ts-ignore
  <PanelResizeHandle
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
  </PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }


