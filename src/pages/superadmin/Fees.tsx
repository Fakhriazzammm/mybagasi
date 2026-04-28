import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useFeeSettings, useUpdateFeeSetting } from "@/hooks";
import { Save } from "lucide-react";

export default function Fees() {
  const { data: feeSettings = {}, isLoading, error } = useFeeSettings();
  const updateMutation = useUpdateFeeSetting();

  const entries = Object.entries(feeSettings);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(Object.fromEntries(entries));
  }, [feeSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyKeys = entries.filter(([k, v]) => draft[k] !== undefined && draft[k] !== v);

  const handleSaveAll = async () => {
    await Promise.all(
      dirtyKeys.map(([key]) => updateMutation.mutateAsync({ key, value: draft[key] }))
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Fee Settings"
        description="Konfigurasi kurs, payment gateway, asuransi, customs, dan storage."
        action={
          <Button
            variant="hero"
            size="sm"
            onClick={handleSaveAll}
            disabled={!dirtyKeys.length || updateMutation.isPending}
          >
            <Save className="h-4 w-4" />
            Simpan {dirtyKeys.length ? `(${dirtyKeys.length})` : ""}
          </Button>
        }
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat fee settings...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Gagal memuat fee settings.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada fee setting.</p>
      ) : (
        <div className="grid gap-3">
          {entries.map(([key, value]) => (
            <Card key={key} className="border-border/60">
              <CardContent className="p-5">
                <div className="grid md:grid-cols-3 gap-4 items-center">
                  <div>
                    <Label className="font-semibold">{key}</Label>
                  </div>
                  <Input
                    value={draft[key] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="md:col-span-2"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
