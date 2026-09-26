"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, MenuItem, Popover } from "@/components/ui";

/** User card (name, email, avatar) with a Logout menu – top of the sidebar, as in the Figma. */
export function UserMenu() {
  const { data } = useSession();
  const user = data?.user;
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-full"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-lg bg-ink-100 px-2.5 py-2 text-left hover:bg-ink-200/70"
        >
          <Avatar src={user?.image} name={user?.name} className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-ink-900">{user?.name ?? "—"}</p>
            <p className="truncate text-2xs text-ink-500">{user?.email}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      }
    >
      <div className="py-1">
        <MenuItem danger onClick={() => signOut({ callbackUrl: "/" })}>
          <LogOut className="h-4 w-4" /> Logout
        </MenuItem>
      </div>
    </Popover>
  );
}
