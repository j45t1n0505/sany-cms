import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Trash2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { PageHeader } from "../components/PageBits";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";

const empty = () => ({ email: "", password: "", name: "", role: "sales_manager" });

export default function Users() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());

  const load = () => api.get("/users").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/users", form);
      toast.success("User dibuat"); setOpen(false); setForm(empty()); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Hapus user ${u.email}?`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("Terhapus"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader eyebrow="/ RBAC" title="Manajemen Pengguna" description="Kelola akun & role akses berjenjang untuk staff."
        actions={<Button onClick={() => setOpen(true)} data-testid="add-user-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-11 px-5 font-mono text-xs uppercase tracking-widest"><Plus className="w-4 h-4 mr-2" /> Tambah User</Button>}
      />

      <div className="bg-white border border-neutral-200">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Dibuat</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 ${
                    u.role === "superadmin" ? "bg-[#E60012] text-white" :
                    u.role === "sales_manager" ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-800"
                  }`}>{u.role}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{u.created_at.slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  {u.id !== user.id && u.role !== "superadmin" && (
                    <Button size="sm" variant="ghost" onClick={() => remove(u)} data-testid={`delete-user-${u.id}`} className="rounded-none h-8 text-rose-600"><Trash2 className="w-3 h-3" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="font-display font-black text-xl">Tambah User</div>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <Input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name-input" className="rounded-none" />
              <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" className="rounded-none" />
              <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" className="rounded-none" />
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-none" data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_manager">Sales Manager</SelectItem>
                  <SelectItem value="warehouse_staff">Warehouse Staff</SelectItem>
                  <SelectItem value="superadmin">SuperAdmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-none">Batal</Button>
              <Button onClick={save} data-testid="save-user-btn" className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none">Simpan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
