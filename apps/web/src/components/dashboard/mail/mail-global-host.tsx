"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const LazyMailGlobalDialog = dynamic(
  () => import("./mail-global-dialog").then((mod) => mod.MailGlobalDialog),
  { ssr: false },
);

export function MailGlobalHost({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  const openMailId = searchParams.get("openMail");
  const [openedManually, setOpenedManually] = useState(false);
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);
  const shouldLoad = openedManually || Boolean(openMailId);

  useEffect(() => {
    if (shouldLoad) return;

    const loadAndOpen = (selectedId: string | null = null) => {
      setManualSelectedId(selectedId);
      setOpenedManually(true);
    };

    const keyHandler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      loadAndOpen();
    };

    const toggleHandler = () => loadAndOpen();

    window.addEventListener("keydown", keyHandler);
    window.addEventListener("toggle-mail-inbox", toggleHandler);

    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("toggle-mail-inbox", toggleHandler);
    };
  }, [shouldLoad]);

  if (!shouldLoad) return null;

  return (
    <LazyMailGlobalDialog
      userId={userId}
      initialOpen
      initialSelectedId={openMailId ?? manualSelectedId}
    />
  );
}
