"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createClient } from "@sneakervault/supabase/client";
import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";

export type OnlineUser = {
  user_id: string;
  online_at: string;
};

type PresenceListener = () => void;

const TEARDOWN_DELAY_MS = 1_000;
const EMPTY_ONLINE_USERS: string[] = [];

const listeners = new Set<PresenceListener>();

let channel: RealtimeChannel | null = null;
let channelUserId: string | null = null;
let removeCurrentChannel: (() => void) | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let currentOnlineUsers: string[] = [];

function publishOnlineUsers(nextOnlineUsers: string[]) {
  currentOnlineUsers = nextOnlineUsers;
  listeners.forEach((listener) => listener());
}

function syncPresenceState(activeChannel: RealtimeChannel) {
  const state = activeChannel.presenceState() as RealtimePresenceState<OnlineUser>;
  publishOnlineUsers(Object.keys(state));
}

function clearTeardownTimer() {
  if (!teardownTimer) return;
  clearTimeout(teardownTimer);
  teardownTimer = null;
}

function teardownPresenceChannel() {
  clearTeardownTimer();

  const removeChannel = removeCurrentChannel;
  channel = null;
  channelUserId = null;
  removeCurrentChannel = null;
  publishOnlineUsers([]);

  removeChannel?.();
}

function ensurePresenceChannel(userId: string) {
  clearTeardownTimer();

  if (channel && channelUserId === userId) {
    return;
  }

  if (channel) {
    teardownPresenceChannel();
  }

  const supabase = createClient();
  const activeChannel = supabase.channel("online-users", {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel = activeChannel;
  channelUserId = userId;
  removeCurrentChannel = () => {
    void supabase.removeChannel(activeChannel);
  };

  activeChannel
    .on("presence", { event: "sync" }, () => {
      syncPresenceState(activeChannel);
    })
    .on("presence", { event: "join" }, () => {
      syncPresenceState(activeChannel);
    })
    .on("presence", { event: "leave" }, () => {
      syncPresenceState(activeChannel);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED" && channel === activeChannel) {
        await activeChannel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    });
}

function schedulePresenceTeardown() {
  clearTeardownTimer();

  if (listeners.size > 0) return;

  teardownTimer = setTimeout(() => {
    if (listeners.size === 0) {
      teardownPresenceChannel();
    }
  }, TEARDOWN_DELAY_MS);
}

export function usePresence(userId?: string) {
  const subscribe = useCallback(
    (onStoreChange: PresenceListener) => {
      if (!userId) {
        return () => {};
      }

      listeners.add(onStoreChange);
      ensurePresenceChannel(userId);

      return () => {
        listeners.delete(onStoreChange);
        schedulePresenceTeardown();
      };
    },
    [userId],
  );

  const onlineUsers = useSyncExternalStore(
    subscribe,
    () => currentOnlineUsers,
    () => EMPTY_ONLINE_USERS,
  );

  return { onlineUsers };
}
