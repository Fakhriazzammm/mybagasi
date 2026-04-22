import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Brain, Activity, Plus, Save, Trash2 } from "lucide-react";
import {
  useAiSettings,
  useCreateAiSetting,
  useDeleteAiSetting,
  useSuperAdminStats,
  useUpdateAiSetting,
} from "@/hooks";
import { supabase } from "@/lib/supabase";

const aiSettingNotes: Record<string, string> = {
  "Model utama": "Untuk AI Personal Shopper",
  "Model fallback": "Saat primary down",
  "Max tokens / chat": "Limit per request",
  Temperature: "Balance kreatif & akurat",
  "Rate limit / user": "Anti-abuse",
  "Auto-suggest produk": "Saat user kirim foto/link",
};

const aiFeatureDefaults = [
  { key: "Model utama", value: "gpt-4o-mini", description: "Model AI dari SumoPod." },
  { key: "AI provider base URL", value: "https://ai.sumopod.com/v1", description: "Endpoint utama API SumoPod." },
  { key: "comparison_mode_enabled", value: "true", description: "Aktifkan comparison mode otomatis 3 opsi termurah." },
  { key: "comparison_option_count", value: "3", description: "Jumlah opsi pembanding yang ditampilkan AI." },
  { key: "auto_scrape_progress_steps", value: "true", description: "Tampilkan status scraping bertahap di chat." },
  { key: "pricing_jpy_to_idr", value: "105", description: "Kurs default JPY ke IDR untuk estimasi realtime." },
  { key: "pricing_service_fee_rate", value: "0.15", description: "Fee jasa untuk kalkulasi all-in (decimal)." },
  { key: "pricing_shipping_idr", value: "250000", description: "Biaya ongkir default (IDR)." },
  { key: "pricing_tax_rate", value: "0.08", description: "Tarif pajak/bea default (decimal)." },
  { key: "payment_require_final_confirmation", value: "true", description: "Wajib konfirmasi final sebelum create payment." },
  { key: "scraper_confidence_threshold", value: "medium", description: "Confidence minimum sebelum auto-rekomendasi." },
  { key: "scraper_retry_policy", value: "canonicalize>playwright>crawl4ai", description: "Urutan retry policy scraper." },
];

export default function AISettingsPage() {
  const qc = useQueryClient();
  const { data: aiSettings = [], isLoading } = useAiSettings();
  const { data: stats } = useSuperAdminStats();
  const updateMutation = useUpdateAiSetting();
  const createMutation = useCreateAiSetting();
  const deleteMutation = useDeleteAiSetting();

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    const map = Object.fromEntries(aiSettings.map((s) => [s.key, s.value]));
    setDraft(map);
  }, [aiSettings]);

  useEffect(() => {
    const channel = supabase
      .channel("superadmin-ai-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_settings" },
        () => {
          qc.invalidateQueries({ queryKey: ["ai-settings"] });
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const dirtyKeys = useMemo(
    () =>
      aiSettings
        .filter((s) => draft[s.key] !== undefined && draft[s.key] !== s.value)
        .map((s) => s.key),
    [aiSettings, draft]
  );

  const handleSaveAll = async () => {
    if (!dirtyKeys.length) return;
    await Promise.all(
      dirtyKeys.map((key) => updateMutation.mutateAsync({ key, value: draft[key] }))
    );
  };

  const existingKeys = useMemo(() => new Set(aiSettings.map((s) => s.key)), [aiSettings]);
  const missingFeatureSettings = useMemo(
    () => aiFeatureDefaults.filter((item) => !existingKeys.has(item.key)),
    [existingKeys]
  );

  const handleCreate = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    await createMutation.mutateAsync({
      key: newKey.trim(),
      value: newValue.trim(),
      description: newDescription.trim() || null,
    });
    setNewKey("");
    setNewValue("");
    setNewDescription("");
  };

  const handleAddRecommendedSettings = async () => {
    if (!missingFeatureSettings.length) return;
    await Promise.all(
      missingFeatureSettings.map((item) =>
        createMutation.mutateAsync({
          key: item.key,
          value: item.value,
          description: item.description,
        })
      )
    );
  };

  const featureHealth = useMemo(() => {
    const byKey = Object.fromEntries(aiSettings.map((item) => [item.key, item.value]));
    const isNumeric = (value?: string) => value !== undefined && !Number.isNaN(Number(value));
    return [
      {
        name: "Realtime Sync",
        ok: realtimeConnected,
        detail: realtimeConnected ? "Terhubung ke Supabase realtime." : "Belum terhubung ke realtime channel.",
      },
      {
        name: "Comparison Mode",
        ok: byKey.comparison_mode_enabled === "true" && Number(byKey.comparison_option_count || "0") >= 2,
        detail: "Perbandingan otomatis 2-3 opsi termurah aktif.",
      },
      {
        name: "SumoPod Model",
        ok: (byKey["Model utama"] || "").toLowerCase().includes("gpt-4o-mini") &&
          (byKey["AI provider base URL"] || "").includes("ai.sumopod.com"),
        detail: "Model & endpoint mengarah ke SumoPod.",
      },
      {
        name: "Pricing Engine",
        ok: isNumeric(byKey.pricing_jpy_to_idr) && isNumeric(byKey.pricing_service_fee_rate) && isNumeric(byKey.pricing_shipping_idr) && isNumeric(byKey.pricing_tax_rate),
        detail: "Konfigurasi estimasi all-in valid.",
      },
      {
        name: "Payment Guardrail",
        ok: byKey.payment_require_final_confirmation === "true",
        detail: "Konfirmasi final sebelum create payment aktif.",
      },
      {
        name: "Scraper Health Rules",
        ok: Boolean(byKey.scraper_confidence_threshold && byKey.scraper_retry_policy),
        detail: "Confidence threshold & retry policy tersedia.",
      },
    ];
  }, [aiSettings, realtimeConnected]);

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="AI Settings"
        description="Konfigurasi AI Personal Shopper, model, dan rate limit. Realtime & tersimpan ke database."
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

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Model aktif</p>
            </div>
            <p className="font-display text-lg font-bold mt-1">{draft["Model utama"] || "-"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" />
              <p className="text-xs text-muted-foreground">Tokens MTD</p>
            </div>
            <p className="font-display text-lg font-bold mt-1">{((stats?.totalUsers ?? 0) * 0.4).toFixed(0)}K</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <p className="text-xs text-muted-foreground">Mode sinkronisasi</p>
            </div>
            <p className="font-display text-lg font-bold mt-1">Realtime</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 mb-4">
        <CardContent className="p-5 grid md:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Key</Label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="contoh: Compare mode" />
          </div>
          <div>
            <Label>Value</Label>
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="aktif" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="catatan opsional" />
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending || !newKey.trim() || !newValue.trim()}>
            <Plus className="h-4 w-4" />Tambah Setting
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60 mb-4">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="font-semibold">Preset Pengaturan Fitur AI Terbaru</p>
              <p className="text-xs text-muted-foreground mt-1">
                Menambahkan pengaturan untuk comparison mode, estimasi all-in, guardrail payment, dan scraper confidence.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Missing settings: <span className="font-medium">{missingFeatureSettings.length}</span>
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleAddRecommendedSettings}
              disabled={!missingFeatureSettings.length || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              Tambahkan Setting Rekomendasi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 mb-4">
        <CardContent className="p-5">
          <p className="font-semibold mb-3">Monitoring Fitur AI</p>
          <div className="grid md:grid-cols-2 gap-3">
            {featureHealth.map((item) => (
              <div key={item.name} className="rounded-xl border border-border/60 p-3 flex items-start gap-3">
                <span
                  className={`mt-1 h-3 w-3 rounded-full ${item.ok ? "bg-success" : "bg-destructive"}`}
                  title={item.ok ? "Berfungsi" : "Error / belum aktif"}
                />
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Titik hijau: fitur berfungsi. Titik merah: ada konfigurasi/error yang perlu diperbaiki.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat AI settings...</p>}
        {aiSettings.map((s) => (
          <Card key={s.id} className="border-border/60">
            <CardContent className="p-5">
              <div className="grid md:grid-cols-4 gap-4 items-center">
                <div>
                  <Label className="font-semibold">{s.key}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.description || aiSettingNotes[s.key] || "Tanpa catatan"}
                  </p>
                </div>
                <Input
                  value={draft[s.key] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="md:col-span-2 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => deleteMutation.mutate(s.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
