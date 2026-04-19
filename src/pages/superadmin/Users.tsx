import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { users } from "@/lib/superadmin-mock";
import { Search, UserPlus, MoreHorizontal } from "lucide-react";

const roleTone: Record<string, string> = {
  customer: "bg-secondary text-foreground",
  ops_admin: "bg-primary-soft text-primary",
  support: "bg-accent/15 text-accent",
  finance: "bg-warning/15 text-warning",
  affiliate: "bg-success/15 text-success",
  super_admin: "bg-foreground text-background",
};

export default function UsersPage() {
  const [q, setQ] = useState("");
  const filtered = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.id}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-xs">{u.email}</TableCell>
                  <TableCell><Badge className={roleTone[u.role] || "bg-secondary"}>{u.role}</Badge></TableCell>
                  <TableCell className="text-xs">{u.tier}</TableCell>
                  <TableCell>
                    <Badge className={u.status === "active" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.joined}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
