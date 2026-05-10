"use client";

import * as React from "react";
import { 
  Avatar, 
  Tooltip, 
  TooltipTrigger, 
  TooltipContent, 
  TooltipProvider,
  cn
} from "@sneakervault/ui";
import { usePresence } from "@/lib/use-presence";
import { getAllProfiles } from "@/lib/actions/admin";

export function OnlineUsers({ userId }: { userId: string }) {
  const { onlineUsers } = usePresence(userId);
  const [profiles, setProfiles] = React.useState<any[]>([]);

  React.useEffect(() => {
    getAllProfiles().then(({ data }) => {
      if (data) setProfiles(data);
    });
  }, []);

  const activeProfiles = profiles.filter(p => onlineUsers.includes(p.id));

  if (activeProfiles.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center -space-x-2 overflow-hidden">
        {activeProfiles.map((profile, i) => (
          <Tooltip key={profile.id}>
            <TooltipTrigger asChild>
              <div 
                className={cn(
                  "relative transition-transform hover:scale-110 hover:z-10",
                  i === 0 ? "z-[5]" : i === 1 ? "z-[4]" : i === 2 ? "z-[3]" : "z-[2]"
                )}
              >
                <Avatar 
                  src={profile.avatar_url} 
                  fallback={profile.full_name.slice(0, 2)} 
                  size="sm"
                  className="ring-2 ring-[#1F1F1E] bg-[#262626]"
                  isOnline={true}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex flex-col gap-0.5">
              <span className="font-semibold">{profile.full_name}</span>
              <span className="text-[10px] text-white/50 uppercase tracking-tighter">
                {(profile.roles as string[]).join(", ")}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}
        {onlineUsers.length > activeProfiles.length && (
          <div className="z-0 flex size-8 items-center justify-center rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-white/40 ring-2 ring-[#1F1F1E] ml-2">
            +{onlineUsers.length - activeProfiles.length}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
