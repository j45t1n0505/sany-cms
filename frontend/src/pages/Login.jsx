import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Selamat datang kembali.");
      navigate("/app");
    } else {
      toast.error(res.error || "Login gagal");
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-neutral-950 text-white">
      {/* Left side - image */}
      <div className="hidden lg:block relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1575281923032-f40d94ef6160?w=1600&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950/80 via-neutral-950/40 to-[#E60012]/30" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3" data-testid="login-logo-home">
            <img src="/logo.png" alt="SANY PERKASA" className="w-9 h-9 object-contain rounded-full bg-white" />
            <span className="font-display font-black tracking-tight text-lg">SANY <span className="text-[#E60012]">PERKASA</span></span>
          </Link>
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="font-mono text-xs tracking-[0.3em] uppercase text-white/60 mb-4"
            >
              / CMS · Internal Access
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
              className="font-display font-black text-6xl xl:text-7xl tracking-tight leading-none max-w-md"
            >
              Kendali penuh <span className="text-[#E60012]">armada</span> Anda.
            </motion.h1>
            <p className="mt-6 text-white/60 max-w-md">
              Masuk untuk mengelola katalog, sparepart, prospek, dan rental unit alat berat.
            </p>
          </div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-white/40">
            © 2026 SANY PERKASA
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex items-center justify-center p-6 md:p-12 relative">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="font-mono text-xs tracking-[0.3em] uppercase text-[#E60012] mb-4">/ Login</div>
          <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight leading-none mb-3">
            Masuk ke<br />Dashboard.
          </h2>
          <p className="text-sm text-white/50 mb-10">Gunakan email dan password yang telah disediakan.</p>

          <div className="space-y-5">
            <div>
              <label className="font-mono text-[10px] tracking-widest uppercase text-white/50 block mb-2">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="anda@sanyperkasa.co.id"
                data-testid="login-email-input"
                className="bg-transparent border-white/10 border-t-0 border-l-0 border-r-0 rounded-none h-12 px-0 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-[#E60012]"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-widest uppercase text-white/50 block mb-2">Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password-input"
                className="bg-transparent border-white/10 border-t-0 border-l-0 border-r-0 rounded-none h-12 px-0 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-[#E60012]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            data-testid="login-submit-btn"
            className="mt-10 w-full bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-14 font-mono text-xs uppercase tracking-widest disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<>Masuk <ArrowRight className="ml-3 w-4 h-4" /></>)}
          </Button>

          <div className="mt-10 p-4 border border-white/10 bg-white/[0.03] font-mono text-[11px] text-white/60 leading-relaxed">
            <div className="text-[#E60012] tracking-widest uppercase text-[10px] mb-2">/ Demo credentials</div>
            SuperAdmin — j45t1n0505@gmail.com / SanyAdmin2026!<br />
            Sales — sales@sanyperkasa.co.id / SalesPass2026!<br />
            Warehouse — warehouse@sanyperkasa.co.id / WarehousePass2026!
          </div>
        </motion.form>
      </div>
    </div>
  );
}
