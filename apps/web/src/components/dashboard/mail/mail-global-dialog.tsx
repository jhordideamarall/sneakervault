"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Send, Reply, X, Check, CheckCheck, Paperclip, Smile, Bell, MessageCircle, Plus, Search } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { SystemMessageBubble } from "./system-message-bubble";
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  Button,
  Avatar,
  ScrollArea,
  cn
} from "@sneakervault/ui";
import { useInbox, InternalMessage } from "@/lib/use-inbox";
import { usePresence } from "@/lib/use-presence";
import { createClient } from "@sneakervault/supabase/client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";

const QUICK_EMOJIS = [
  "😀", "😂", "🥰", "😍", "😎", "🤔", "😅", "😭",
  "😡", "🥺", "🙏", "👍", "👎", "👌", "👋", "💪",
  "🙌", "👏", "🔥", "✨", "💯", "🎉", "❤️", "💔",
  "😘", "🤗", "😴", "🤝", "👀", "🚀", "✅", "❌",
];

export function MailGlobalDialog({ userId }: { userId: string }) {
  const [open, setOpen] = React.useState(false);
  const activeUserId = open ? userId : undefined;
  const { messages, conversations, contacts, markAsRead, sendMessage } = useInbox(activeUserId);
  const { onlineUsers } = usePresence(activeUserId);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [chatInput, setChatInput] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<InternalMessage | null>(null);
  const [attachments, setAttachments] = React.useState<{ name: string, url: string, type: string }[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "notifications" | "chat">("all");
  const [showNewChat, setShowNewChat] = React.useState(false);
  const [contactSearch, setContactSearch] = React.useState("");
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Deep link: ?openMail=<user_id>
  React.useEffect(() => {
    const openMailId = searchParams.get("openMail");
    if (openMailId) {
      setOpen(true);
      setSelectedId(openMailId);
      // Clean up query param
      const url = new URL(window.location.href);
      url.searchParams.delete("openMail");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router]);

  // Filter conversations based on tab
  const filteredConversations = React.useMemo(() => {
    if (showNewChat) return conversations;
    if (filter === "all") return conversations;
    return conversations.filter(conv => {
      const hasSystem = conv.messages.some(m => m.is_system);
      const hasChat = conv.messages.some(m => !m.is_system);
      if (filter === "notifications") return hasSystem;
      return hasChat || conv.messages.length === 0;
    });
  }, [conversations, filter, showNewChat]);

  const filteredContacts = React.useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!q) return true;
      return contact.full_name.toLowerCase().includes(q);
    });
  }, [contactSearch, contacts]);

  // Autofocus when chat is selected or opened
  React.useEffect(() => {
    if (selectedId && open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedId, open]);

  // Toggle Shortcut 'm'
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };

    const toggleHandler = () => setOpen(prev => !prev);

    window.addEventListener("keydown", handler);
    window.addEventListener("toggle-mail-inbox", toggleHandler);
    
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("toggle-mail-inbox", toggleHandler);
    };
  }, []);

  // Scroll to bottom on new messages or chat change
  React.useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, selectedId, open]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const supabase = createClient();
    const newAttachments = [...attachments];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (error) {
        toast.error(`Gagal mengunggah ${file.name}`);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      newAttachments.push({
        name: file.name,
        url: publicUrl,
        type: file.type
      });
    }

    setAttachments(newAttachments);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const activeChat = conversations.find(c => c.profile.id === selectedId);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedId || (!chatInput.trim() && attachments.length === 0)) return;

    const content = chatInput;
    const parentId = replyingTo?.id;
    const attachmentUrls = attachments.map(a => a.url);
    
    setChatInput("");
    setReplyingTo(null);
    setAttachments([]);
    setShowEmoji(false);

    const { error } = await sendMessage(selectedId, content, { 
      parentId, 
      attachments: attachmentUrls 
    });

    if (error) {
      toast.error("Gagal mengirim");
      setChatInput(content);
      if (parentId) setReplyingTo(replyingTo);
      setAttachments(attachments);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <DialogContent forceMount hideClose className="max-w-none w-[95vw] md:w-[1000px] h-[95vh] md:h-[700px] bg-transparent border-0 p-0 overflow-visible shadow-none">
            <DialogTitle className="sr-only">Messaging Center</DialogTitle>
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.96, y: 10, filter: "blur(6px)" }}
              transition={{
                duration: 0.4,
                ease: [0.32, 0.72, 0, 1],
                filter: { duration: 0.3 },
              }}
              className="w-full h-full bg-[#262626] border border-white/[0.05] rounded-[20px] md:rounded-[32px] flex flex-col overflow-hidden shadow-2xl"
            >
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Sidebar */}
          <div className={cn(
            "w-full md:w-[320px] border-r border-white/[0.05] flex flex-col bg-[#262626]",
            selectedId && "hidden md:flex"
          )}>
            <div className="px-6 py-6 border-b border-white/[0.05] flex items-center justify-between">
              <h2 className="text-lg font-bold text-white/90">{showNewChat ? "Chat Baru" : "Pesan"}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowNewChat((prev) => !prev);
                  setContactSearch("");
                }}
                className="size-8 rounded-full bg-white/[0.05] flex items-center justify-center text-white/40 transition-colors hover:bg-white/[0.1] hover:text-white"
                aria-label={showNewChat ? "Tutup chat baru" : "Mulai chat baru"}
              >
                {showNewChat ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>

            {/* Tab Filter */}
            {!showNewChat && <div className="flex items-center gap-1 px-4 py-3 border-b border-white/[0.05]">
              {([
                { key: "all", label: "Semua" },
                { key: "notifications", label: "Notifikasi", icon: Bell },
                { key: "chat", label: "Chat", icon: MessageCircle },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all outline-none",
                    filter === tab.key
                      ? "bg-white/[0.1] text-white"
                      : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"
                  )}
                >
                  {"icon" in tab && tab.icon && <tab.icon size={12} />}
                  {tab.label}
                </button>
              ))}
            </div>}

            {showNewChat && (
              <div className="border-b border-white/[0.05] p-4">
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1F1F1E] px-3 py-2">
                  <Search size={14} className="text-white/25" />
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Cari karyawan..."
                    className="w-full bg-transparent text-sm text-white/80 outline-none placeholder:text-white/20"
                  />
                </div>
              </div>
            )}
            
            <ScrollArea className="flex-1">
              {showNewChat ? (
                filteredContacts.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center gap-3">
                    <p className="text-[11px] font-medium text-white/20 uppercase tracking-widest">Karyawan tidak ditemukan</p>
                  </div>
                ) : (
                  <div className="flex flex-col py-2">
                    {filteredContacts.map((contact) => {
                      const isOnline = onlineUsers.includes(contact.id);
                      return (
                        <button
                          key={contact.id}
                          onClick={() => {
                            setSelectedId(contact.id);
                            setShowNewChat(false);
                            setFilter("chat");
                            markAsRead(contact.id);
                          }}
                          className="group relative flex items-center gap-4 px-6 py-4 text-left transition-all outline-none hover:bg-white/[0.02]"
                        >
                          <Avatar
                            src={contact.avatar_url}
                            fallback={contact.full_name?.slice(0, 2)}
                            size="md"
                            className="bg-white/[0.03]"
                            isOnline={isOnline}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white/75 group-hover:text-white">
                              {contact.full_name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-white/25">
                              {isOnline ? "Online" : "Offline"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : filteredConversations.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="size-12 rounded-2xl bg-white/[0.02] flex items-center justify-center text-white/10">
                    <Mail size={24} strokeWidth={1} />
                  </div>
                  <p className="text-[11px] font-medium text-white/20 uppercase tracking-widest">Belum ada obrolan</p>
                </div>
              ) : (
                <div className="flex flex-col py-2">
                  {filteredConversations.map((conv) => {
                    const isSelected = selectedId === conv.profile.id;
                    const isOnline = onlineUsers.includes(conv.profile.id);
                    return (
                      <button
                        key={conv.profile.id}
                        onClick={() => {
                          setSelectedId(conv.profile.id);
                          markAsRead(conv.profile.id);
                        }}
                        className={cn(
                          "group relative flex items-center gap-4 px-6 py-4 text-left transition-all outline-none",
                          isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                        <Avatar 
                          src={conv.profile.avatar_url} 
                          fallback={conv.profile.full_name?.slice(0, 2)} 
                          size="md"
                          className="bg-white/[0.03]"
                          isOnline={isOnline}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={cn(
                              "text-sm truncate",
                              conv.unreadCount > 0 ? "text-white font-bold" : "text-white/60 font-medium"
                            )}>
                              {conv.profile.full_name}
                            </span>
                            {conv.lastMessage ? (
                              <span className="text-[10px] text-white/20">
                                {format(new Date(conv.lastMessage.created_at!), "HH:mm")}
                              </span>
                            ) : null}
                          </div>
                          <p className={cn(
                            "text-[12px] truncate",
                            conv.unreadCount > 0 ? "text-white/70 font-medium" : "text-white/30"
                          )}>
                            {conv.lastMessage ? (
                              <>
                                {conv.lastMessage.sender_id === userId && "Anda: "}
                                {conv.lastMessage.content}
                              </>
                            ) : (
                              "Mulai obrolan"
                            )}
                          </p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <div className="size-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center shrink-0 shadow-lg">
                            {conv.unreadCount}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right: Chat Thread */}
          <div className={cn(
            "flex-1 flex flex-col bg-[#1F1F1E] relative overflow-hidden",
            !selectedId && "hidden md:flex"
          )}>
            {activeChat ? (
              <>
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 h-20 z-20 flex items-center justify-between px-4 md:px-8 bg-[#1F1F1E]/60 backdrop-blur-2xl border-b border-white/[0.03]">
                  <div className="flex items-center gap-3 md:gap-4">
                    <button onClick={() => setSelectedId(null)} className="md:hidden text-white/40 hover:text-white p-1">
                      <Reply size={18} className="rotate-180" />
                    </button>
                    <Avatar 
                      src={activeChat.profile.avatar_url} 
                      fallback={activeChat.profile.full_name?.slice(0, 2)} 
                      size="md"
                      isOnline={onlineUsers.includes(activeChat.profile.id)}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-white/90 leading-none mb-1">{activeChat.profile.full_name}</h4>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        onlineUsers.includes(activeChat.profile.id) ? "text-emerald-500" : "text-white/20"
                      )}>
                        {onlineUsers.includes(activeChat.profile.id) ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="text-white/20 hover:text-white transition-all p-2">
                    <X size={18} />
                  </Button>
                </div>

                {/* Messages with Gradient Fade (Top Only) */}
                <ScrollArea 
                  ref={scrollRef} 
                  className="flex-1"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 100px)',
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 100px)'
                  }}
                >
                  <div className="flex flex-col gap-3 px-8 pt-28 pb-40">
                    {activeChat.messages.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center py-24 text-center">
                        <div>
                          <p className="text-sm font-semibold text-white/35">Belum ada pesan</p>
                          <p className="mt-1 text-xs text-white/18">Kirim pesan pertama ke {activeChat.profile.full_name}.</p>
                        </div>
                      </div>
                    ) : activeChat.messages.map((msg, idx) => {
                      // System notification — render differently
                      if (msg.is_system) {
                        return <SystemMessageBubble key={msg.id} msg={msg} />;
                      }

                      const isMe = msg.sender_id === userId;
                      const isLastInGroup = idx === activeChat.messages.length - 1 || activeChat.messages[idx + 1]?.sender_id !== msg.sender_id;
                      const showTime = idx === 0 || 
                        new Date(msg.created_at!).getTime() - new Date(activeChat.messages[idx-1]!.created_at!).getTime() > 1000 * 60 * 30;

                      return (
                        <div key={msg.id} className={cn("flex flex-col", showTime && "mt-10")}>
                          {showTime && (
                            <div className="flex justify-center mb-8">
                              <span className="text-[10px] font-black text-white/5 uppercase tracking-[0.3em] px-3 py-1 rounded-full border border-white/[0.02]">
                                {format(new Date(msg.created_at!), "d MMM, HH:mm", { locale: id })}
                              </span>
                            </div>
                          )}
                          <div className={cn(
                            "flex flex-col max-w-[75%] transition-all duration-300",
                            isMe ? "self-end items-end" : "self-start items-start"
                          )}>
                            {/* Threading UI */}
                            {msg.parent_message && (
                              <div className={cn(
                                "mb-[-12px] pb-3 px-3 pt-2 rounded-t-2xl text-[11px] border border-white/[0.05] max-w-[90%] opacity-30 truncate",
                                isMe ? "bg-white/[0.1] mr-2" : "bg-white/[0.06] ml-2"
                              )}>
                                <span className="font-bold block mb-0.5 text-[9px] uppercase opacity-50">
                                  {msg.parent_message.sender_id === userId ? "Anda" : msg.parent_message.sender?.full_name}
                                </span>
                                {msg.parent_message.content}
                              </div>
                            )}

                            <div className={cn(
                              "relative group px-4 py-2.5 rounded-[1.25rem] text-[14px] leading-relaxed shadow-sm transition-all duration-300",
                              isMe 
                                ? "bg-white text-black font-medium rounded-tr-none hover:bg-white/90" 
                                : "bg-white/[0.08] text-white/90 rounded-tl-none border border-white/[0.05] hover:bg-white/[0.12]"
                            )}>
                              {msg.content}

                              {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {msg.attachment_urls.map((url, i) => {
                                    const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                                    return (
                                      <a 
                                        key={i} 
                                        href={url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="block rounded-lg overflow-hidden border border-white/10 hover:opacity-80 transition-opacity"
                                      >
                                        {isImage ? (
                                          <img src={url} alt="attachment" className="max-w-[200px] max-h-[200px] object-cover" />
                                        ) : (
                                          <div className={cn("p-3 flex items-center gap-2", isMe ? "bg-black/5" : "bg-white/5")}>
                                            <Paperclip size={14} className={isMe ? "text-black/40" : "text-white/40"} />
                                            <span className={cn("text-[10px] truncate max-w-[120px]", isMe ? "text-black/60" : "text-white/60")}>Lihat Dokumen</span>
                                          </div>
                                        )}
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                              
                              <button 
                                onClick={() => setReplyingTo(msg)}
                                className={cn(
                                  "absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-[#1F1F1E] text-white/60 opacity-0 group-hover:opacity-100 transition-all hover:text-white border border-white/10 shadow-xl z-10",
                                  isMe ? "-left-12" : "-right-12"
                                )}
                              >
                                <Reply size={14} />
                              </button>
                            </div>

                            {isLastInGroup && (
                              <div className="flex items-center gap-1.5 mt-1 px-1">
                                <span className="text-[9px] text-white/20 font-bold uppercase tracking-tighter">
                                  {format(new Date(msg.created_at!), "HH:mm")}
                                </span>
                                {isMe && (
                                  <div className="text-white/20">
                                    {msg.is_read ? <CheckCheck size={10} className="text-blue-500" /> : <Check size={10} />}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Floating Input Area with Dynamic Width - EXACTLY LIKE TURN 37 BUT TRIGGER ONLY ON CONTENT */}
                <div className="absolute bottom-0 left-0 right-0 p-8 pointer-events-none flex justify-center">
                  <motion.div 
                    initial={false}
                    animate={{ 
                      width: (chatInput.length > 0 || attachments.length > 0 || showEmoji) ? "100%" : "65%",
                      maxWidth: "800px"
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="pointer-events-auto w-full px-4"
                  >
                    <AnimatePresence>
                      {showEmoji && (
                        <motion.div
                          initial={{ opacity: 0, y: 12, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 12, scale: 0.96 }}
                          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                          className="mb-3 bg-[#262626]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                        >
                          <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.04]">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Emoji</span>
                            <button onClick={() => setShowEmoji(false)} className="text-white/30 hover:text-white transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                          <div className="p-3 grid grid-cols-8 gap-1">
                            {QUICK_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  setChatInput(prev => prev + emoji);
                                  inputRef.current?.focus();
                                }}
                                className="size-10 flex items-center justify-center text-xl hover:bg-white/[0.06] rounded-xl transition-all active:scale-90"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {replyingTo && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="mb-2 flex items-center justify-between px-5 py-2.5 rounded-t-[1.5rem] bg-white/[0.08] border-x border-t border-white/10 backdrop-blur-3xl"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Reply size={12} className="text-white/30 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Balas {replyingTo.sender?.full_name}</p>
                              <p className="text-[11px] text-white/50 truncate">{replyingTo.content}</p>
                            </div>
                          </div>
                          <button onClick={() => setReplyingTo(null)} className="text-white/20 hover:text-white transition-colors">
                            <X size={14} />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className={cn(
                      "bg-white/[0.03] backdrop-blur-3xl border border-white/10 p-2 transition-all duration-500",
                      "shadow-[0_10px_30px_-5px_rgba(0,0,0,0.5)]",
                      replyingTo ? "rounded-b-[2rem]" : "rounded-[2.5rem]",
                      isFocused && "border-white/20 bg-white/[0.06]"
                    )}>
                      <AnimatePresence>
                        {attachments.length > 0 && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 py-3 flex flex-wrap gap-2 border-b border-white/5 mb-2 overflow-hidden"
                          >
                            {attachments.map((file, i) => (
                              <div key={i} className="relative group rounded-xl overflow-hidden border border-white/10 bg-white/[0.03] p-1.5 pr-8 flex items-center gap-2">
                                {file.type.startsWith('image/') ? (
                                  <img src={file.url} className="size-8 rounded-lg object-cover" alt="" />
                                ) : (
                                  <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center"><Paperclip size={14} className="text-white/40" /></div>
                                )}
                                <span className="text-[10px] text-white/60 font-bold truncate max-w-[80px]">{file.name}</span>
                                <button onClick={() => removeAttachment(i)} className="absolute right-1 text-white/20 hover:text-red-400"><X size={14} /></button>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <form 
                        onSubmit={handleSend} 
                        className="flex items-center gap-2"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                      >
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          type="button" 
                          onClick={() => fileInputRef.current?.click()}
                          className="size-11 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all shrink-0"
                        >
                          <Paperclip size={20} />
                        </motion.button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />
                        
                        <div className="flex-1 relative flex items-center min-h-[44px]">
                          <textarea 
                            ref={inputRef}
                            value={chatInput}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder={isUploading ? "Mengunggah..." : "Tulis pesan..."}
                            rows={1}
                            disabled={isUploading}
                            className="w-full bg-transparent py-3 text-[14px] text-white/90 placeholder:text-white/20 outline-none resize-none max-h-[120px] leading-tight"
                            style={{ height: 'auto' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                            }}
                          />
                          <motion.button 
                            animate={{ 
                              opacity: (isFocused || chatInput.length > 0 || showEmoji) ? 1 : 0.5,
                              scale: showEmoji ? 1.2 : 1
                            }}
                            type="button" 
                            onClick={() => setShowEmoji(!showEmoji)}
                            className={cn(
                              "px-3 transition-colors shrink-0",
                              showEmoji ? "text-white" : "text-white/30"
                            )}
                          >
                            <Smile size={20} />
                          </motion.button>
                        </div>

                        <motion.div
                          className="shrink-0"
                          animate={{ 
                            scale: (chatInput || attachments.length > 0) ? 1 : 0.8,
                            opacity: (chatInput || attachments.length > 0) ? 1 : 0.3 
                          }}
                        >
                          <Button 
                            type="submit"
                            disabled={(!chatInput.trim() && attachments.length === 0) || isUploading}
                            className="size-11 rounded-full bg-white text-black hover:bg-white/90 transition-all p-0 shadow-lg overflow-hidden flex items-center justify-center"
                          >
                            <motion.div whileTap={{ x: 20, opacity: 0 }} className="flex items-center justify-center">
                              <Send size={18} fill="currentColor" />
                            </motion.div>
                          </Button>
                        </motion.div>
                      </form>
                    </div>
                  </motion.div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-white/5 gap-4">
                <div className="size-20 rounded-[32px] bg-white/[0.01] border border-white/[0.02] flex items-center justify-center">
                  <Mail size={40} strokeWidth={1} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black uppercase tracking-[0.4em] mb-1">Pilih Obrolan</p>
                  <p className="text-[10px] font-medium text-white/20">Tekan 'm' untuk menutup jendela ini</p>
                </div>
              </div>
            )}
          </div>
        </div>
        </motion.div>
          </DialogContent>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
