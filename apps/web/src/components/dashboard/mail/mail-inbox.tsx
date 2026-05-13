"use client";

import * as React from "react";
import { Mail } from "lucide-react";
import { 
  Popover, 
  PopoverTrigger, 
  PopoverContent,
  Button,
  Avatar,
  ScrollArea,
  Badge,
  cn
} from "@sneakervault/ui";
import { useInbox } from "@/lib/use-inbox";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

export function MailInbox({ userId }: { userId: string }) {
  const { conversations, unreadCount, loading } = useInbox(userId);
  const [open, setOpen] = React.useState(false);

  const openFull = () => {
    window.dispatchEvent(new CustomEvent("toggle-mail-inbox"));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex items-center justify-center size-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all duration-200">
          <Mail size={19} strokeWidth={1.7} />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] min-w-[18px] justify-center bg-red-500 border-none text-white shadow-lg">
              {unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        side="right" 
        sideOffset={20} 
        align="end" 
        className="w-[380px] p-0 overflow-hidden border-white/[0.08] bg-[#262626] shadow-2xl z-[9999]"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
          <h3 className="text-sm font-semibold text-white/90">Kotak Masuk</h3>
        </div>

        <ScrollArea className="h-[420px]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-white/20 text-xs">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/20 gap-2 py-10">
              <Mail size={32} strokeWidth={1} />
              <p className="text-xs">Belum ada pesan</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {conversations.map((conv) => {
                const msg = conv.lastMessage;
                const otherProfile = conv.profile;
                return (
                  <button
                    key={conv.profile.id}
                    onClick={() => {
                      openFull();
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-start gap-4 p-4 text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]",
                      conv.unreadCount > 0 && "bg-white/[0.02]"
                    )}
                  >
                    <Avatar 
                      src={otherProfile?.avatar_url} 
                      fallback={otherProfile?.full_name?.slice(0, 2)} 
                      size="sm"
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-white/90 truncate">
                          {otherProfile?.full_name}
                        </span>
                        {msg ? (
                          <span className="text-[10px] text-white/30 whitespace-nowrap">
                            {formatDistanceToNow(new Date(msg.created_at!), { addSuffix: true, locale: id })}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[12px] text-white/40 line-clamp-2 leading-relaxed">
                        {msg ? (
                          <>
                            {msg.sender_id === userId && "Anda: "}
                            {msg.content}
                          </>
                        ) : (
                          "Mulai obrolan"
                        )}
                      </p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="size-2 rounded-full bg-blue-500 mt-2 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        <div className="p-3 bg-white/[0.02] border-t border-white/[0.04]">
          <Button 
            variant="ghost" 
            onClick={() => {
              setOpen(false);
              openFull();
            }} 
            className="w-full justify-start text-[11px] h-8 text-white/30 hover:text-white/60"
          >
            Tampilkan semua pesan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
