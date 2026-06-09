import { Outlet, Link, useParams, Navigate } from "react-router-dom";
import { Bell, MessageCircle, LayoutDashboard, Package, Heart, Crown, User, LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CustomerSidebar } from "./CustomerSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/site/BottomNav";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

export const DashboardLayout = () => {
  const { profile, signOut, getDashboardRoute } = useAuth();
  const { username } = useParams();
  const dash = getDashboardRoute();

  // Security: ensure URL username matches logged-in user's username
  if (profile && username && username !== profile.username) {
    return <Navigate to={dash} replace />;
  }

  const customerNav = [
    { to: dash, label: "Beranda", icon: LayoutDashboard, end: true },
    { to: `${dash}/orders`, label: "Pesanan", icon: Package },
    { to: `${dash}/wishlist`, label: "Wishlist", icon: Heart },
    { to: `${dash}/membership`, label: "Member", icon: Crown },
    { to: `${dash}/addresses`, label: "Akun", icon: User },
  ];

  if (!profile) return null;

  const name = profile?.name || "User";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";
  const email = profile?.email || "";

  return (
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
              <Link to={`${dash}/ai-shopper`}><MessageCircle className="h-4 w-4" />Chat MyBagasi</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1 hover:bg-secondary/50 rounded-full px-2 py-1 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-gradient-coral text-primary-foreground grid place-items-center font-bold text-sm">
                    {initials}
                  </div>
                  <div className="hidden sm:block leading-tight text-left">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{email}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> Profil Saya
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-red-500 cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>
          <BottomNav items={customerNav} />
        </div>
      </div>
    </SidebarProvider>
  );
};
