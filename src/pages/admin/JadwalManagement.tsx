import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  useBatchShipments,
  useCreateBatch,
  useUpdateBatch,
  useDeleteBatch,
} from "@/hooks";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import type { BatchShipment, BatchStatus } from "@/types/database.types";

const STATUS_LABELS: Record<BatchStatus, string> = {
  draft: "Draft",
  open: "Open",
  closing_soon: "Closing Soon",
  closed: "Closed",
  shipping: "Shipping",
};

const STATUS_COLORS: Record<BatchStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-success/15 text-success",
  closing_soon: "bg-warning/15 text-warning",
  closed: "bg-destructive/15 text-destructive",
  shipping: "bg-info/15 text-info",
};

const DIRECTION_LABELS: Record<string, string> = {
  indonesia_to_japan: "Indonesia → Jepang",
  japan_to_indonesia: "Jepang → Indonesia",
};

type FormFields = {
  name: string;
  direction: "indonesia_to_japan" | "japan_to_indonesia";
  departure_date: string;
  arrives_at: string;
  closes_at: string;
  capacity: number;
  max_weight_kg: number;
  price_per_kg: number;
  savings_percent: number;
  status: BatchStatus;
};

const EMPTY_FORM: FormFields = {
  name: "",
  direction: "indonesia_to_japan",
  departure_date: "",
  arrives_at: "",
  closes_at: "",
  capacity: 10,
  max_weight_kg: 100,
  price_per_kg: 0,
  savings_percent: 0,
  status: "draft",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function JadwalManagementPage() {
  const { data: batches = [], isLoading, error } = useBatchShipments();
  const createBatch = useCreateBatch();
  const updateBatch = useUpdateBatch();
  const deleteBatch = useDeleteBatch();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BatchShipment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BatchShipment | null>(null);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);

  const isPending =
    createBatch.isPending || updateBatch.isPending || deleteBatch.isPending;

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(batch: BatchShipment) {
    setForm({
      name: batch.name,
      direction: batch.direction,
      departure_date: toDateInput(batch.departure_date),
      arrives_at: toDateInput(batch.arrives_at),
      closes_at: toDatetimeLocal(batch.closes_at),
      capacity: batch.capacity,
      max_weight_kg: batch.max_weight_kg,
      price_per_kg: batch.price_per_kg,
      savings_percent: batch.savings_percent,
      status: batch.status,
    });
    setEditTarget(batch);
  }

  function handleCreate() {
    createBatch.mutate(
      {
        name: form.name,
        direction: form.direction,
        departure_date: form.departure_date,
        arrives_at: form.arrives_at || null,
        closes_at: form.closes_at,
        capacity: form.capacity,
        max_weight_kg: form.max_weight_kg,
        price_per_kg: form.price_per_kg,
        savings_percent: form.savings_percent,
        status: form.status,
      },
      { onSuccess: () => setCreateOpen(false) },
    );
  }

  function handleUpdate() {
    if (!editTarget) return;
    updateBatch.mutate(
      {
        id: editTarget.id,
        name: form.name,
        direction: form.direction,
        departure_date: form.departure_date,
        arrives_at: form.arrives_at || null,
        closes_at: form.closes_at,
        capacity: form.capacity,
        max_weight_kg: form.max_weight_kg,
        price_per_kg: form.price_per_kg,
        savings_percent: form.savings_percent,
        status: form.status,
      },
      { onSuccess: () => setEditTarget(null) },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteBatch.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  if (isLoading)
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-20 bg-secondary rounded-3xl" />
        <div className="h-20 bg-secondary rounded-3xl" />
      </div>
    );
  if (error)
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Gagal memuat</p>
        <p className="text-xs text-muted-foreground">
          {(error as Error).message}
        </p>
      </div>
    );

  const statActive = batches.filter(
    (b: any) => b.status === "open" || b.status === "closing_soon",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Jadwal Batch Shipping"
        description="Kelola jadwal keberangkatan batch shipping, kapasitas, dan harga."
        action={
          <Button variant="hero" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Jadwal
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Jadwal</p>
            <p className="font-display text-2xl font-bold mt-1">
              {batches.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aktif</p>
            <p className="font-display text-2xl font-bold mt-1 text-success">
              {statActive}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="font-display text-2xl font-bold mt-1 text-muted-foreground">
              {batches.filter((b: any) => b.status === "draft").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Closed / Shipping</p>
            <p className="font-display text-2xl font-bold mt-1">
              {
                batches.filter(
                  (b: any) =>
                    b.status === "closed" || b.status === "shipping",
                ).length
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Keberangkatan</TableHead>
                <TableHead>Tiba</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead className="text-right">Max Weight</TableHead>
                <TableHead className="text-right">Price/kg</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center text-muted-foreground py-8"
                  >
                    Belum ada jadwal batch shipping
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {b.route || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {DIRECTION_LABELS[b.direction] || b.direction}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDate(b.departure_date)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDate(b.arrives_at)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {b.capacity}{" "}
                      <span className="text-xs text-muted-foreground">org</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {b.max_weight_kg}{" "}
                      <span className="text-xs text-muted-foreground">kg</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      Rp {b.price_per_kg.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[b.status]}>
                        {STATUS_LABELS[b.status] || b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => openEdit(b)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/5"
                          disabled={isPending}
                          onClick={() => setDeleteTarget(b)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Jadwal Baru</DialogTitle>
            <DialogDescription>
              Isi detail jadwal batch shipping baru.
            </DialogDescription>
          </DialogHeader>
          <FormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              variant="hero"
              onClick={handleCreate}
              disabled={isPending || !form.name}
            >
              {createBatch.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Jadwal</DialogTitle>
            <DialogDescription>
              Ubah detail jadwal batch shipping.
            </DialogDescription>
          </DialogHeader>
          <FormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              variant="hero"
              onClick={handleUpdate}
              disabled={isPending || !form.name}
            >
              {updateBatch.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Jadwal</DialogTitle>
            <DialogDescription>
              Apakah kamu yakin ingin menghapus jadwal{" "}
              <strong>{deleteTarget?.name}</strong>? Tindakan ini tidak bisa
              dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {deleteBatch.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Shared Form Fields ────────────────────────────────────

function FormFields({
  form,
  setForm,
}: {
  form: FormFields;
  setForm: (f: FormFields) => void;
}) {
  const set = <K extends keyof FormFields>(
    key: K,
    value: FormFields[K],
  ) => setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div className="col-span-2">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Nama Jadwal
        </label>
        <Input
          placeholder="Contoh: Batch Januari 2025"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Direction
        </label>
        <Select
          value={form.direction}
          onValueChange={(v: "indonesia_to_japan" | "japan_to_indonesia") =>
            set("direction", v)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="indonesia_to_japan">
              Indonesia → Jepang
            </SelectItem>
            <SelectItem value="japan_to_indonesia">
              Jepang → Indonesia
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Tanggal Keberangkatan
        </label>
        <Input
          type="date"
          value={form.departure_date}
          onChange={(e) => set("departure_date", e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Tanggal Tiba
        </label>
        <Input
          type="date"
          value={form.arrives_at}
          onChange={(e) => set("arrives_at", e.target.value)}
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Tutup Pendaftaran
        </label>
        <Input
          type="datetime-local"
          value={form.closes_at}
          onChange={(e) => set("closes_at", e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Capacity (orang)
        </label>
        <Input
          type="number"
          min={1}
          value={form.capacity}
          onChange={(e) => set("capacity", Number(e.target.value))}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Max Weight (kg)
        </label>
        <Input
          type="number"
          min={1}
          value={form.max_weight_kg}
          onChange={(e) => set("max_weight_kg", Number(e.target.value))}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Price per kg (IDR)
        </label>
        <Input
          type="number"
          min={0}
          value={form.price_per_kg}
          onChange={(e) => set("price_per_kg", Number(e.target.value))}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Savings (%)
        </label>
        <Input
          type="number"
          min={0}
          max={100}
          value={form.savings_percent}
          onChange={(e) => set("savings_percent", Number(e.target.value))}
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Status
        </label>
        <Select
          value={form.status}
          onValueChange={(v: BatchStatus) => set("status", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closing_soon">Closing Soon</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="shipping">Shipping</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
