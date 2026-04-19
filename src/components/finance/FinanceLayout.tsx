import { Outlet } from "react-router-dom";
import { Download } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { FinanceSidebar } from "./FinanceSidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const FinanceLayout = () => (
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
          <div className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1">
            <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground grid place-items-center font-bold text-sm">FN</div>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-semibold">Dewi Finance</p>
              <p className="text-[11px] text-muted-foreground">finance@mybagasi.id</p>
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
