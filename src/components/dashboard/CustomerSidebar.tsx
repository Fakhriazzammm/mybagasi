import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Package, Heart, Bell, MapPin, Crown, Coins, Sparkles } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/site/Logo";

const main = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Quotations", url: "/dashboard/quotations", icon: FileText },
  { title: "Orders", url: "/dashboard/orders", icon: Package },
];

const collection = [
  { title: "Wishlist", url: "/dashboard/wishlist", icon: Heart },
  { title: "Price Alerts", url: "/dashboard/price-alerts", icon: Bell },
  { title: "AI Shopper", url: "/dashboard/ai-shopper", icon: Sparkles },
];

const account = [
  { title: "Membership", url: "/dashboard/membership", icon: Crown },
  { title: "Poin", url: "/dashboard/points", icon: Coins },
  { title: "Alamat", url: "/dashboard/addresses", icon: MapPin },
];

export function CustomerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const renderItems = (items: typeof main) => (
    <SidebarMenu>
      {items.map((item) => {
        const active = item.end ? pathname === item.url : pathname === item.url || pathname.startsWith(item.url + "/");
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild className={active ? "bg-primary-soft text-primary font-semibold" : "hover:bg-secondary"}>
              <NavLink to={item.url} end={item.end}>
                <item.icon className="h-4 w-4" />
                {!collapsed && <span>{item.title}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent className="bg-background/60 backdrop-blur">
        <div className="px-4 py-5">
          <Logo showText={!collapsed} />
        </div>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">Belanja</SidebarGroupLabel>}
          <SidebarGroupContent>{renderItems(main)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">Koleksi</SidebarGroupLabel>}
          <SidebarGroupContent>{renderItems(collection)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">Akun</SidebarGroupLabel>}
          <SidebarGroupContent>{renderItems(account)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
