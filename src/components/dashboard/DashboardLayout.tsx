import { Outlet, Link } from "react-router-dom";
import { Bell, MessageCircle, LayoutDashboard, Package, Heart, Crown, User } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CustomerSidebar } from "./CustomerSidebar";
import { Button } from "@/components/ui/button";
import { customer } from "@/lib/customer-mock";
import { BottomNav } from "@/components/site/BottomNav";

const customerNav = [
  { to: "/dashboard", label: "Beranda", icon: LayoutDashboard, end: true },
  { to: "/dashboard/orders", label: "Pesanan", icon: Package },
  { to: "/dashboard/wishlist", label: "Wishlist", icon: Heart },
  { to: "/dashboard/membership", label: "Member", icon: Crown },
  { to: "/dashboard/addresses", label: "Akun", icon: User },
];

export const DashboardLayout = () => (
  <SidebarProvider defaultOpen>
    <div className="min-h-screen flex w-full bg-background">
      <CustomerSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="rounded-full relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          </Button>
          <Button variant="hero" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/whatsapp-demo"><MessageCircle className="h-4 w-4" />Chat MyBagasi</Link>
          </Button>
          <div className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1">
            <div className="h-9 w-9 rounded-full bg-gradient-coral text-primary-foreground grid place-items-center font-bold text-sm">
              {customer.initials}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold">{customer.name}</p>
              <p className="text-[11px] text-muted-foreground">{customer.email}</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <BottomNav items={customerNav} />
      </div>
    </div>
  </SidebarProvider>
);
