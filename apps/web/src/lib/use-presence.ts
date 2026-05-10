"use client";

import { useEffect, useState } from "react";
import { createClient } from "@sneakervault/supabase/client";
import type { RealtimePresenceState } from "@supabase/supabase-js";

export type OnlineUser = {
  user_id: string;
  online_at: string;
};

export function usePresence(userId?: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as RealtimePresenceState<OnlineUser>;
        const userIds = Object.keys(state);
        setOnlineUsers(userIds);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        console.log("Joined:", newPresences);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        console.log("Left:", leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return { onlineUsers };
}
