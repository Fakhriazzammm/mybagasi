import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Crown, Calculator, Settings2, Truck, Store, Share2, Brain, ArrowLeft } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/site/Logo";

const items = [
  { title: "Overview", url: "/super-admin", icon: LayoutDashboard, end: true },
  { title: "Users", url: "/super-admin/users", icon: Users },
  { title: "Membership Plans", url: "/super-admin/plans", icon: Crown },
  { title: "Pricing Rules", url: "/super-admin/pricing", icon: Calculator },
  { title: "Fee Settings", url: "/super-admin/fees", icon: Settings2 },
  { title: "Shipping Rules", url: "/super-admin/shipping", icon: Truck },
  { title: "Marketplaces", url: "/super-admin/marketplaces", icon: Store },
  { title: "Referral Commission", url: "/super-admin/commission", icon: Share2 },
  { title: "AI Settings", url: "/super-admin/ai", icon: Brain },
];

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent className="bg-background/60 backdrop-blur">
        <div className="px-4 py-5 flex items-center gap-2">
          <Logo showText={!collapsed} />
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest bg-foreground text-background px-2 py-0.5 rounded-full">Super</span>}
        </div>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">System</SidebarGroupLabel>}
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
