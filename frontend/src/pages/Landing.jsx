import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, Wrench, Users, BarChart3, Zap, Shield, Building2, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";

const HERO_IMG = "/units/fleet.jpg";

const stats = [
  { k: "12+", l: "Tahun Melayani Industri" },
  { k: "850+", l: "Unit Alat Berat Terjual" },
  { k: "24/7", l: "Support Nasional" },
  { k: "34", l: "Kota Coverage" },
];

const products = [
  { name: "Excavator SY215C", cat: "MEDIUM EXCAVATOR", img: "/units/sy215c.jpg", tag: "Paling Populer" },
  { name: "Mining Excavator SY1250H", cat: "LARGE EXCAVATOR", img: "/units/large1.jpg", tag: "Tambang Skala Besar" },
  { name: "Drilling Rig SR405R", cat: "PILING MACHINERY", img: "/units/rig1.jpg", tag: "Fondasi Dalam" },
  { name: "Wheel Loader SYL956H", cat: "WHEEL LOADER", img: "/units/loader.jpg", tag: "Kelas 5 Ton" },
];

const modules = [
  { icon: Truck, title: "Manajemen Katalog", desc: "CRUD unit dengan spesifikasi teknis, galeri foto, dan status ketersediaan real-time." },
  { icon: Wrench, title: "Suku Cadang", desc: "Pelacakan stok, alert minimum, dan histori keluar-masuk barang gudang." },
  { icon: Users, title: "CRM & Prospek", desc: "Data klien, riwayat interaksi penjualan, dan status Quotation." },
  { icon: BarChart3, title: "Analitik Real-time", desc: "Tren penjualan, utilisasi unit, dan ringkasan inventaris." },
  { icon: Building2, title: "Rental & Penyewaan", desc: "Kontrak sewa alat berat dengan jadwal dan tagihan otomatis." },
  { icon: Shield, title: "Multi-Role RBAC", desc: "SuperAdmin, Sales Manager, Warehouse Staff dengan akses berjenjang." },
];

const partners = ["ADARO", "WIJAYA KARYA", "KIDECO", "WASKITA", "BUMA", "PAMA", "PETROSEA", "SAPTA INDRA"];

export default function Landing() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 overflow-x-hidden">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-neutral-950/70 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SANY PERKASA" className="w-9 h-9 object-contain rounded-full bg-white" />
            <span className="font-display font-black tracking-tight text-white text-lg">SANY <span className="text-[#E60012]">PERKASA</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest text-white/70">
            <a href="#produk" className="hover:text-white transition-colors">Produk</a>
            <a href="#modul" className="hover:text-white transition-colors">Modul</a>
            <a href="#partner" className="hover:text-white transition-colors">Partner</a>
            <a href="#kontak" className="hover:text-white transition-colors">Kontak</a>
          </div>
          <Link to="/login" data-testid="nav-login-btn">
            <Button className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-10 px-5 font-mono text-xs uppercase tracking-widest">
              Login CMS <ArrowRight className="ml-2 w-3 h-3" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen bg-neutral-950 text-white overflow-hidden grain">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/70" />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10 pt-40 pb-32">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 mb-10"
          >
            <span className="w-2 h-2 bg-[#E60012] rounded-full pulse-red" />
            <span className="font-mono text-xs tracking-[0.3em] uppercase text-white/70">Content Management System · v2026</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black leading-[0.9] tracking-tight text-6xl md:text-7xl lg:text-[8rem] max-w-6xl"
          >
            KEKUATAN <br />
            MESIN <span className="text-[#E60012]">·</span> DATA <br />
            <span className="text-white/40">DALAM SATU</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-10 max-w-xl text-lg text-white/70 leading-relaxed"
          >
            Sistem manajemen tingkat perusahaan untuk distributor alat berat SANY di Indonesia.
            Katalog, sparepart, CRM, penyewaan — terintegrasi dalam satu platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
            className="mt-12 flex flex-wrap gap-4"
          >
            <Link to="/login" data-testid="hero-cta-login">
              <Button className="bg-[#E60012] hover:bg-[#c40010] text-white rounded-none h-14 px-8 font-mono text-xs uppercase tracking-widest">
                Masuk Dashboard <ArrowRight className="ml-3 w-4 h-4" />
              </Button>
            </Link>
            <a href="#produk" data-testid="hero-cta-catalog">
              <Button variant="outline" className="bg-transparent border-white/20 hover:bg-white/10 hover:text-white text-white rounded-none h-14 px-8 font-mono text-xs uppercase tracking-widest">
                Katalog Unit
              </Button>
            </a>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 border-t border-white/10 pt-10"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.l}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.1 }}
              >
                <div className="font-display font-black text-4xl md:text-5xl tracking-tight">{s.k}</div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-white/50 mt-2">{s.l}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Marquee */}
        <div id="partner" className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-neutral-950/80 backdrop-blur-sm py-4 overflow-hidden">
          <div className="flex marquee-track whitespace-nowrap">
            {[...partners, ...partners].map((p, i) => (
              <div key={i} className="flex items-center gap-16 px-8 font-display font-black text-white/30 text-2xl tracking-tight">
                <span>{p}</span>
                <span className="w-1.5 h-1.5 bg-[#E60012] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modul" className="py-32 bg-neutral-50">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20">
            <div className="lg:col-span-4">
              <div className="font-mono text-xs tracking-[0.3em] uppercase text-[#E60012] mb-6">/ 01 · Modul Sistem</div>
              <h2 className="font-display font-black text-5xl lg:text-6xl tracking-tight leading-none">
                Enam pilar<br />operasional.
              </h2>
            </div>
            <div className="lg:col-span-7 lg:col-start-6 flex items-end">
              <p className="text-lg text-neutral-600 leading-relaxed">
                Dibangun untuk skala perusahaan alat berat Indonesia — mulai dari satu cabang hingga jaringan nasional.
                Setiap modul dapat diakses berdasarkan role pengguna.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
            {modules.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: i * 0.06 }}
                className="bg-white p-10 hover:bg-neutral-950 hover:text-white transition-colors duration-500 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-16">
                  <div className="w-12 h-12 border border-neutral-300 group-hover:border-white/30 flex items-center justify-center">
                    <m.icon className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-xs text-neutral-400 group-hover:text-white/40">0{i + 1}</span>
                </div>
                <h3 className="font-display font-black text-2xl tracking-tight mb-3">{m.title}</h3>
                <p className="text-sm text-neutral-500 group-hover:text-white/60 leading-relaxed">{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS BENTO */}
      <section id="produk" className="py-32 bg-neutral-950 text-white grain relative">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 relative">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <div className="font-mono text-xs tracking-[0.3em] uppercase text-[#E60012] mb-6">/ 02 · Katalog Unit</div>
              <h2 className="font-display font-black text-5xl lg:text-6xl tracking-tight leading-none">
                Tiga lini produk<br />unggulan SANY.
              </h2>
            </div>
            <Link to="/login" data-testid="cta-catalog-view">
              <Button variant="outline" className="bg-transparent border-white/20 hover:bg-white hover:text-neutral-950 text-white rounded-none h-12 px-6 font-mono text-xs uppercase tracking-widest">
                Buka Katalog Lengkap <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                className={`group relative overflow-hidden bg-neutral-900 border border-white/5 ${i === 0 ? "lg:col-span-2 lg:row-span-2" : ""}`}
              >
                <div className={`relative overflow-hidden ${i === 0 ? "h-[480px]" : "h-[280px]"}`}>
                  <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />
                  <div className="absolute top-4 left-4 px-3 py-1 bg-[#E60012] font-mono text-[10px] tracking-widest uppercase">
                    {p.tag}
                  </div>
                </div>
                <div className="p-6">
                  <div className="font-mono text-[10px] tracking-widest uppercase text-white/40 mb-2">{p.cat}</div>
                  <div className="font-display font-bold text-xl tracking-tight group-hover:text-[#E60012] transition-colors">{p.name}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / CONTACT */}
      <section id="kontak" className="py-32 bg-[#E60012] text-white relative overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 relative">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="font-display font-black text-6xl lg:text-8xl tracking-tight leading-none max-w-4xl"
          >
            Siap kelola<br />armada Anda?
          </motion.h2>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-white/20 pt-10">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-white/60 mb-2">Kantor Pusat</div>
              <div className="font-display text-lg">Jl. Sudirman Kav. 52, Jakarta Selatan 12190</div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-white/60 mb-2">Sales & Rental</div>
              <div className="font-display text-lg">+62 21 5000 1234</div>
              <div className="font-display text-lg">sales@sanyperkasa.co.id</div>
            </div>
            <div className="flex items-end">
              <Link to="/login" data-testid="footer-cta-login">
                <Button className="bg-neutral-950 hover:bg-neutral-800 text-white rounded-none h-14 px-8 font-mono text-xs uppercase tracking-widest">
                  Login Dashboard <ArrowRight className="ml-3 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-neutral-950 text-white/50 py-8">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest">
          <div>© 2026 SANY PERKASA · All Rights Reserved</div>
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-[#E60012]" /> Powered by Emergent Platform
          </div>
        </div>
      </footer>
    </div>
  );
}
