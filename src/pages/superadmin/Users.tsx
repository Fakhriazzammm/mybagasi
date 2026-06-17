import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useUsers } from "@/hooks";
import { Search, UserPlus, MoreHorizontal } from "lucide-react";

const roleTone: Record<string, string> = {
  customer: "bg-secondary text-foreground",
  ops_admin: "bg-primary-soft text-primary",
  support: "bg-accent/15 text-accent",
  finance: "bg-warning/15 text-warning",
  affiliate: "bg-success/15 text-success",
  personal_shopper: "bg-info/15 text-info",
  super_admin: "bg-foreground text-background",
};

export default function UsersPage() {
  const [q, setQ] = useState("");
  const { data: users = [], isLoading, error } = useUsers();

  const filtered = users.filter(u => u.name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="User Management"
        description="Kelola semua user, role, dan status akses."
        action={<Button variant="hero" size="sm"><UserPlus className="h-4 w-4" />Invite user</Button>}
      />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari nama atau email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 rounded-full" />
      </div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 text-sm text-muted-foreground">Memuat data user...</div>
          ) : error ? (
            <div className="p-5 text-sm text-destructive">Gagal memuat data user.</div>
          ) : filtered.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Tidak ada user ditemukan.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bergabung</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell><Badge className={roleTone[u.role] || "bg-secondary"}>{u.role}</Badge></TableCell>
                    <TableCell className="text-xs">{u.tier}</TableCell>
                    <TableCell>
                      <Badge className={u.status === "active" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
