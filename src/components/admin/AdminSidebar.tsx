import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, Truck, ClipboardCheck, MessageSquare, Calendar, ArrowLeft } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/site/Logo";

const ops = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "Procurement", url: "/admin/procurement", icon: ListChecks },
  { title: "Tracking Exceptions", url: "/admin/tracking", icon: Truck },
  { title: "Approval Quote", url: "/admin/approvals", icon: ClipboardCheck },
  { title: "Support Notes", url: "/admin/support", icon: MessageSquare },
  { title: "Jadwal", url: "/admin/jadwal", icon: Calendar },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarContent className="bg-background/60 backdrop-blur">
        <div className="px-4 py-5 flex items-center gap-2">
          <Logo showText={!collapsed} />
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest bg-primary-soft text-primary px-2 py-0.5 rounded-full">Ops</span>}
        </div>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase">Operations</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {ops.map((item) => {
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
                  <NavLink to="/">
                    <ArrowLeft className="h-4 w-4" />
                    {!collapsed && <span>Kembali ke Site</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
