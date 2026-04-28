import { Outlet, Link } from "react-router-dom";
import { Download, LayoutDashboard, Wallet, Undo2, Coins, Crown, User, LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { FinanceSidebar } from "./FinanceSidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BottomNav } from "@/components/site/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const financeNav = [
  { to: "/finance", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/finance/payments", label: "Payment", icon: Wallet },
  { to: "/finance/refunds", label: "Refund", icon: Undo2 },
  { to: "/finance/points", label: "Poin", icon: Coins },
  { to: "/finance/membership", label: "Member", icon: Crown },
];

export const FinanceLayout = () => {
  const { profile, signOut } = useAuth();
  const name = profile?.name || "Finance";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "FN";
  const email = profile?.email || "";

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <FinanceSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
            <SidebarTrigger />
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => toast.success("Laporan diekspor", { description: "File CSV akan terkirim ke email." })}>
              <Download className="h-4 w-4" />Export laporan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1 hover:bg-secondary/50 rounded-full px-2 py-1 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground grid place-items-center font-bold text-sm">
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
          <BottomNav items={financeNav} />
        </div>
      </div>
    </SidebarProvider>
  );
};
