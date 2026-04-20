import { Outlet } from "react-router-dom";
import { ShieldCheck, LayoutDashboard, Users, Crown, Store, Brain } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { BottomNav } from "@/components/site/BottomNav";

const superNav = [
  { to: "/super-admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/super-admin/users", label: "Users", icon: Users },
  { to: "/super-admin/plans", label: "Plans", icon: Crown },
  { to: "/super-admin/marketplaces", label: "Market", icon: Store },
  { to: "/super-admin/ai", label: "AI", icon: Brain },
];

export const SuperAdminLayout = () => (
  <SidebarProvider defaultOpen>
    <div className="min-h-screen flex w-full bg-background">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold bg-success/15 text-success px-3 py-1.5 rounded-full">
            <ShieldCheck className="h-3.5 w-3.5" />System healthy
          </span>
          <div className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1">
            <div className="h-9 w-9 rounded-full bg-foreground text-background grid place-items-center font-bold text-sm">SA</div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold">Super Admin</p>
              <p className="text-[11px] text-muted-foreground">root@mybagasi.id</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <BottomNav items={superNav} />
      </div>
    </div>
  </SidebarProvider>
);
