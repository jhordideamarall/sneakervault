"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@sneakervault/supabase/client";
import type { Database } from "@sneakervault/supabase";

export type InternalMessage = Database["public"]["Tables"]["internal_messages"]["Row"] & {
  sender?: { full_name: string; avatar_url: string | null };
  receiver?: { full_name: string; avatar_url: string | null };
  parent_message?: { content: string; sender_id: string; sender: { full_name: string } | null } | null;
};

export type Conversation = {
  profile: { id: string; full_name: string; avatar_url: string | null };
  lastMessage: InternalMessage | null;
  messages: InternalMessage[];
  unreadCount: number;
};

type StaffContact = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

export function useInbox(userId?: string) {
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [contacts, setContacts] = useState<StaffContact[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const conversations = useMemo(() => {
    if (!userId) return [];
    const groups: Record<string, Conversation> = {};

    contacts.forEach((contact) => {
      groups[contact.id] = {
        profile: contact,
        lastMessage: null,
        messages: [],
        unreadCount: 0,
      };
    });
    
    messages.forEach(msg => {
      if (msg.sender_id === userId && msg.receiver_id === userId) return;

      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      const otherProfile = (msg.sender_id === userId ? msg.receiver : msg.sender) as any;
      
      if (!groups[otherId]) {
        groups[otherId] = {
          profile: { id: otherId, ...otherProfile },
          lastMessage: msg,
          messages: [],
          unreadCount: 0
        };
      }
      groups[otherId].messages.push(msg);
      if (!groups[otherId].lastMessage || new Date(msg.created_at!) > new Date(groups[otherId].lastMessage.created_at!)) {
        groups[otherId].lastMessage = msg;
      }
      if (!msg.is_read && msg.receiver_id === userId) {
        groups[otherId].unreadCount++;
      }
    });

    return Object.values(groups).sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.created_at!).getTime() - new Date(a.lastMessage.created_at!).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.profile.full_name.localeCompare(b.profile.full_name);
    });
  }, [contacts, messages, userId]);

  const fetchContacts = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("is_active", true)
      .neq("id", userId)
      .order("full_name");

    if (!error && data) {
      setContacts(data as StaffContact[]);
    } else if (error) {
      console.error("Error fetching contacts:", error);
    }
  }, [userId]);

  const fetchMessages = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from("internal_messages")
      .select(`
        *,
        sender:sender_id (full_name, avatar_url),
        receiver:receiver_id (full_name, avatar_url),
        parent_message:parent_id (
          content,
          sender_id,
          sender:sender_id (full_name)
        )
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      // Reverse back to ascending for display
      setMessages((data as any).reverse());
      setUnreadCount(data.filter((m) => m.receiver_id === userId && !m.is_read).length);
    } else if (error) {
      console.error("Error fetching messages:", error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchContacts();
    fetchMessages();

    const supabase = createClient();
    const channelName = `inbox:${userId}:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages",
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          // Fetch full message info for the new incoming message
          const { data } = await supabase
            .from("internal_messages")
            .select(`
              *,
              sender:sender_id (full_name, avatar_url),
              receiver:receiver_id (full_name, avatar_url),
              parent_message:parent_id (
                content,
                sender_id,
                sender:sender_id (full_name)
              )
            `)
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data as any];
            });
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "internal_messages",
          filter: `sender_id=eq.${userId}`,
        },
        () => fetchMessages() // Refresh for read receipts
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchContacts, fetchMessages]);

  const markAsRead = async (senderId: string) => {
    // Optimistic: update local state immediately
    setMessages(prev => prev.map(m => 
      m.receiver_id === userId && m.sender_id === senderId && !m.is_read
        ? { ...m, is_read: true }
        : m
    ));
    setUnreadCount(prev => {
      const readCount = messages.filter(m => m.receiver_id === userId && m.sender_id === senderId && !m.is_read).length;
      return Math.max(0, prev - readCount);
    });

    const supabase = createClient();
    await supabase
      .from("internal_messages")
      .update({ is_read: true })
      .eq("receiver_id", userId)
      .eq("sender_id", senderId)
      .eq("is_read", false);
  };

  const sendMessage = async (receiverId: string, content: string, options?: { subject?: string, parentId?: string, attachments?: string[] }) => {
    if (!userId) return { error: "Not logged in" };
    const supabase = createClient();
    
    // 1. Optimistic Update: Add message immediately to UI
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: InternalMessage = {
      id: tempId,
      sender_id: userId,
      receiver_id: receiverId,
      content,
      subject: options?.subject || null,
      parent_id: options?.parentId || null,
      attachment_urls: options?.attachments || [],
      is_read: false,
      is_system: false,
      created_at: new Date().toISOString(),
      metadata: {},
      related_entity_id: null,
      related_entity_type: null,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    // 2. Real send
    const { data, error } = await supabase.from("internal_messages").insert({
      sender_id: userId,
      receiver_id: receiverId,
      content,
      subject: options?.subject,
      parent_id: options?.parentId,
      attachment_urls: options?.attachments || [],
    }).select().single();

    if (error) {
      // Rollback on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return { error };
    }

    // Replace temp message with real one from DB (with correct ID and created_at)
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, ...data } : m));
    }
    
    return { error: null };
  };

  return { messages, conversations, contacts, unreadCount, loading, markAsRead, sendMessage, refresh: fetchMessages };
}
