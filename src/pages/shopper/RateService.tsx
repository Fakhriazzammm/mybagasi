import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BadgePercent, DollarSign, Save } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { shopperService } from "@/services/shopper.service";
import type { FeeSetting } from "@/services/shopper.service";
import { toast } from "sonner";

const KEY_LABELS: Record<string, { label: string; icon: React.ComponentType<any> }> = {
  service_fee_rate: { label: "Fee Jasa", icon: BadgePercent },
  shipping_rate_per_kg: { label: "Ongkos Kirim per Kg", icon: DollarSign },
  tax_rate: { label: "Pajak", icon: BadgePercent },
  jpy_to_idr_rate: { label: "Kurs JPY ke IDR", icon: DollarSign },
  min_service_fee: { label: "Minimal Fee Jasa", icon: DollarSign },
};

const KEY_KEYS = Object.keys(KEY_LABELS);

export default function RateServicePage() {
  const [feeSettings, setFeeSettings] = useState<FeeSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFeeSettings();
  }, []);

  async function fetchFeeSettings() {
    setLoading(true);
    setError(null);
    try {
      const data = await shopperService.getFeeSettings();
      setFeeSettings(data);

      // Populate editedValues
      const initial: Record<string, string> = {};
      for (const fs of data) {
        initial[fs.key] = fs.value;
      }
      setEditedValues(initial);
    } catch (err) {
      console.error("Gagal memuat rate jasa:", err);
      setError("Gagal memuat data rate jasa. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function handleValueChange(key: string, value: string) {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(key: string) {
    const newValue = editedValues[key];
    if (newValue === undefined) return;

    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await shopperService.updateFeeSetting(key, newValue);
      setFeeSettings((prev) =>
        prev.map((fs) =>
          fs.key === key ? { ...fs, value: newValue } : fs
        )
      );
      toast.success(`Rate ${KEY_LABELS[key]?.label ?? key} berhasil diperbarui`);
    } catch (err) {
      console.error("Gagal menyimpan rate:", err);
      toast.error("Gagal menyimpan rate. Silakan coba lagi.");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleSaveAll() {
    // Collect dirty keys
    const dirtyKeys = feeSettings.filter(
      (fs) => editedValues[fs.key] !== undefined && editedValues[fs.key] !== fs.value
    );

    if (dirtyKeys.length === 0) {
      toast.info("Tidak ada perubahan yang perlu disimpan");
      return;
    }

    for (const fs of dirtyKeys) {
      setSaving((prev) => ({ ...prev, [fs.key]: true }));
    }

    let successCount = 0;
    let failCount = 0;

    for (const fs of dirtyKeys) {
      try {
        await shopperService.updateFeeSetting(fs.key, editedValues[fs.key]);
        setFeeSettings((prev) =>
          prev.map((f) =>
            f.key === fs.key ? { ...f, value: editedValues[fs.key] } : f
          )
        );
        successCount++;
      } catch (err) {
        console.error(`Gagal menyimpan ${fs.key}:`, err);
        failCount++;
      } finally {
        setSaving((prev) => ({ ...prev, [fs.key]: false }));
      }
    }

    if (failCount === 0) {
      toast.success(`Semua rate (${successCount}) berhasil diperbarui`);
    } else {
      toast.error(`${failCount} rate gagal diperbarui, ${successCount} berhasil`);
    }
  }

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="Personal Shopper"
          title="Rate Jasa"
          description="Atur tarif fee jasa, ongkos kirim, dan kurs."
        />
        <Card className="border-border/60 mt-6">
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-secondary rounded-lg" />
              <div className="h-10 bg-secondary rounded-lg" />
              <div className="h-10 bg-secondary rounded-lg" />
              <div className="h-10 bg-secondary rounded-lg" />
              <div className="h-10 bg-secondary rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeader
          eyebrow="Personal Shopper"
          title="Rate Jasa"
          description="Atur tarif fee jasa, ongkos kirim, dan kurs."
        />
        <Card className="border-border/60 mt-6">
          <CardContent className="p-6 text-center py-12">
            <div className="h-16 w-16 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4">
              <BadgePercent className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-lg font-semibold mb-1">Gagal Memuat Data</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={fetchFeeSettings}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  // Empty state
  if (feeSettings.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Personal Shopper"
          title="Rate Jasa"
          description="Atur tarif fee jasa, ongkos kirim, dan kurs."
        />
        <Card className="border-border/60 mt-6">
          <CardContent className="p-6 text-center py-12">
            <div className="h-16 w-16 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <BadgePercent className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold mb-1">Belum ada pengaturan rate</p>
            <p className="text-sm text-muted-foreground">
              Belum ada pengaturan rate jasa yang tersedia.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Personal Shopper"
        title="Rate Jasa"
        description="Atur tarif fee jasa, ongkos kirim, dan kurs untuk perhitungan biaya."
      />

      <Card className="border-border/60 mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Daftar Rate</CardTitle>
          <Button variant="hero" size="sm" onClick={handleSaveAll}>
            <Save className="h-4 w-4 mr-1.5" />
            Simpan Semua
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Rate</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="w-[200px]">Nilai</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeSettings
                .filter((fs) => KEY_KEYS.includes(fs.key))
                .map((fs) => {
                  const meta = KEY_LABELS[fs.key] ?? { label: fs.key, icon: BadgePercent };
                  const Icon = meta.icon;
                  const isDirty =
                    editedValues[fs.key] !== undefined &&
                    editedValues[fs.key] !== fs.value;

                  return (
                    <TableRow key={fs.key}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary-soft grid place-items-center shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <span>{meta.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fs.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editedValues[fs.key] ?? fs.value}
                          onChange={(e) => handleValueChange(fs.key, e.target.value)}
                          className={`h-9 text-sm ${isDirty ? "border-yellow-400" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={isDirty ? "hero" : "ghost"}
                          size="sm"
                          onClick={() => handleSave(fs.key)}
                          disabled={saving[fs.key]}
                        >
                          {saving[fs.key] ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Simpan
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
