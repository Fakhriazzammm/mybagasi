import { Outlet } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { Input } from "@/components/ui/input";

export const AdminLayout = () => (
  <SidebarProvider defaultOpen>
    <div className="min-h-screen flex w-full bg-background">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
          <SidebarTrigger />
          <div className="hidden md:flex items-center gap-2 max-w-md flex-1 ml-2">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari order, customer, atau scraper…" className="pl-9 h-10 rounded-full bg-secondary/60 border-border/60" />
            </div>
          </div>
          <div className="flex-1 md:hidden" />
          <button className="rounded-full h-10 w-10 grid place-items-center hover:bg-secondary relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1">
            <div className="h-9 w-9 rounded-full bg-gradient-coral text-primary-foreground grid place-items-center font-bold text-sm">OP</div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold">Ops Admin</p>
              <p className="text-[11px] text-muted-foreground">ops@mybagasi.id</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  </SidebarProvider>
);
