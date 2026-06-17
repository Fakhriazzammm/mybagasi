import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Calendar, Clock, Plane, Users } from "lucide-react";
import {
  shopperService,
  type ShopperScheduleWithShipment,
} from "@/services/shopper.service";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-border/60",
  },
  open: {
    label: "Open",
    className: "bg-success/15 text-success border-transparent",
  },
  closing_soon: {
    label: "Closing Soon",
    className: "bg-warning/15 text-warning border-transparent",
  },
  closed: {
    label: "Closed",
    className: "bg-destructive/15 text-destructive border-transparent",
  },
  shipping: {
    label: "Shipping",
    className: "bg-blue-500/15 text-blue-500 border-transparent",
  },
};

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

function InfoRow({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium ml-auto">{value}</span>
    </div>
  );
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ShopperScheduleWithShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Ambil shopper MyBagasi berdasarkan slug
        const shopper = await shopperService.getShopperBySlug(
          "mybagasi-jastip"
        );
        if (!shopper) {
          setError("Profil Personal Shopper MyBagasi tidak ditemukan.");
          return;
        }

        const data = await shopperService.getSchedules(shopper.id);
        setSchedules(data);
      } catch (err: any) {
        console.error("Gagal memuat jadwal:", err);
        setError(err?.message || "Gagal memuat data jadwal.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-64 bg-secondary rounded-3xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeader
          eyebrow="Personal Shopper"
          title="Jadwal Pengiriman"
          description="MyBagasi — Jepang ke Indonesia"
        />
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <div className="h-12 w-12 rounded-full bg-destructive/10 grid place-items-center">
              <Plane className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Jadwal Pengiriman"
        description="MyBagasi — Jepang ke Indonesia"
      />

      {schedules.length === 0 ? (
        // Empty state
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <div className="h-14 w-14 rounded-full bg-muted grid place-items-center">
              <Calendar className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">Belum ada jadwal</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Belum ada jadwal pengiriman yang tersedia untuk MyBagasi. Silakan
              cek kembali nanti.
            </p>
          </CardContent>
        </Card>
      ) : (
        // Table of schedules
        <Card className="border-border/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Plane className="h-4 w-4" />
              Daftar Jadwal Pengiriman
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Jadwal</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Departure
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Capacity
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const ship = s.batch_shipment;
                  const status = statusConfig[ship.status] ?? statusConfig.draft;
                  return (
                    <TableRow key={ship.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{ship.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.is_primary ? "Primary" : "Secondary"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{ship.route}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {formatDate(ship.departure_date)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {ship.capacity} kg
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium text-xs",
                            status.className
                          )}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Mobile-friendly schedule cards */}
      <div className="mt-6 grid gap-3 md:hidden">
        {schedules.map((s) => {
          const ship = s.batch_shipment;
          const status = statusConfig[ship.status] ?? statusConfig.draft;
          return (
            <Card key={ship.id} className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{ship.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.is_primary ? "Primary" : "Secondary"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("font-medium text-xs", status.className)}
                  >
                    {status.label}
                  </Badge>
                </div>
                <InfoRow icon={Plane} label="Route" value={ship.route} />
                <InfoRow
                  icon={Calendar}
                  label="Departure"
                  value={formatDate(ship.departure_date)}
                />
                <InfoRow icon={Users} label="Kapasitas" value={`${ship.capacity} kg`} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
