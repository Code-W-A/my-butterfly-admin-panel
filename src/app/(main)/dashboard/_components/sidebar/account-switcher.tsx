"use client";

import { BadgeCheck, Bell, CreditCard, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser } from "@/hooks/use-auth-user";
import { getInitials } from "@/lib/utils";

export function AccountSwitcher() {
  const { user } = useAuthUser();

  const displayName = "Admin System";
  const displayEmail = user?.email ?? "—";
  const displayAvatar = user?.photoURL ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 rounded-lg">
          <AvatarImage src={displayAvatar || undefined} alt={displayName} />
          <AvatarFallback className="rounded-lg">{getInitials(displayName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuItem className="p-0">
          <div className="flex w-full items-center justify-between gap-2 px-1 py-1.5">
            <Avatar className="size-9 rounded-lg">
              <AvatarImage src={displayAvatar || undefined} alt={displayName} />
              <AvatarFallback className="rounded-lg">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{displayName}</span>
              <span className="truncate text-xs">{displayEmail}</span>
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck />
            Cont
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard />
            Facturare
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell />
            Notificări
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut />
          Deconectare
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
