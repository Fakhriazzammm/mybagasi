import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Wallet, Clock, Undo2, Coins, Users, Crown, ArrowLeft } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/site/Logo";

const items = [
  { title: "Overview", url: "/finance", icon: LayoutDashboard, end: true },
  { title: "Pembayaran", url: "/finance/payments", icon: Wallet },
  { title: "Pending", url: "/finance/pending", icon: Clock },
  { title: "Refund Queue", url: "/finance/refunds", icon: Undo2 },
  { title: "Point Ledger", url: "/finance/points", icon: Coins },
  { title: "Affiliate Payout", url: "/finance/affiliate", icon: Users },
  { title: "Membership", url: "/finance/membership", icon: Crown },
];

export function FinanceSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent className="bg-background/60 backdrop-blur">
        <div className="px-4 py-5 flex items-center gap-2">
          <Logo showText={!collapsed} />
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest bg-accent/15 text-accent px-2 py-0.5 rounded-full">Finance</span>}
        </div>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">Finance</SidebarGroupLabel>}
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="hover:bg-secondary">
                  <NavLink to="/"><ArrowLeft className="h-4 w-4" />{!collapsed && <span>Kembali ke Site</span>}</NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
