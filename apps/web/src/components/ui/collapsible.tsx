"use client";

import * as React from "react";
import { cn } from "@sneakervault/ui";

type CollapsibleContextType = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextType | null>(null);

function useCollapsible() {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error("Collapsible components must be used within a Collapsible");
  }
  return context;
}

const Collapsible = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(({ className, open: openProp, onOpenChange: setOpenProp, children, ...props }, ref) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  
  const isOpen = openProp !== undefined ? openProp : internalOpen;
  
  const handleOpenChange = React.useCallback((val: boolean) => {
    if (openProp === undefined) {
      setInternalOpen(val);
    }
    setOpenProp?.(val);
  }, [openProp, setOpenProp]);

  const contextValue = React.useMemo(() => ({
    open: isOpen,
    onOpenChange: handleOpenChange
  }), [isOpen, handleOpenChange]);

  return (
    <CollapsibleContext.Provider value={contextValue}>
      <div
        ref={ref}
        className={cn("w-full", className)}
        {...props}
        data-state={isOpen ? "open" : "closed"}
      >
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
});
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    asChild?: boolean;
  }
>(({ className, children, asChild, ...props }, ref) => {
  const { open, onOpenChange } = useCollapsible();
  
  const onClick = (e: React.MouseEvent) => {
    onOpenChange(!open);
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        if (child.props.onClick) child.props.onClick(e);
        onClick(e);
      },
    });
  }

  return (
    <div
      ref={ref}
      className={cn("cursor-pointer", className)}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open } = useCollapsible();
  
  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn("overflow-hidden transition-all", className)}
      {...props}
    >
      {children}
    </div>
  );
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
