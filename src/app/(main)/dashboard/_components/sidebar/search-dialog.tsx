"use client";
import * as React from "react";

import { useRouter } from "next/navigation";

import { ChartBar, FlaskConical, Forklift, Gauge, LayoutDashboard, Search, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const searchItems = [
  { group: "My Butterfly", icon: LayoutDashboard, label: "Panou", url: "/dashboard" },
  { group: "My Butterfly", icon: ChartBar, label: "Chestionare", url: "/dashboard/questionnaires" },
  { group: "My Butterfly", icon: ShoppingBag, label: "Produse", url: "/dashboard/products" },
  { group: "My Butterfly", icon: Gauge, label: "Reguli", url: "/dashboard/products" },
  { group: "My Butterfly", icon: Forklift, label: "Cereri", url: "/dashboard/requests" },
  { group: "My Butterfly", icon: FlaskConical, label: "Test recomandări", url: "/dashboard/recommendations/test" },
];

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <Button
        variant="link"
        className="!px-0 font-normal text-muted-foreground hover:no-underline"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Căutare
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Caută în panou…" />
        <CommandList>
          <CommandEmpty>Nu s-au găsit rezultate.</CommandEmpty>
          {[...new Set(searchItems.map((item) => item.group))].map((group, i) => (
            <React.Fragment key={group}>
              {i !== 0 && <CommandSeparator />}
              <CommandGroup heading={group} key={group}>
                {searchItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      className="!py-1.5"
                      key={item.label}
                      onSelect={() => {
                        setOpen(false);
                        router.push(item.url);
                      }}
                    >
                      {item.icon && <item.icon />}
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
