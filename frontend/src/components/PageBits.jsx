export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
      <div>
        {eyebrow && (
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#E60012] mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight leading-none">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-neutral-500 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white border border-neutral-200 p-6 relative ${accent ? "accent-line pl-8" : ""}`}>
      <div className="font-mono text-[10px] tracking-widest uppercase text-neutral-500 mb-3">{label}</div>
      <div className="font-display font-black text-4xl tracking-tight leading-none">{value}</div>
      {sub && <div className="font-mono text-xs text-neutral-500 mt-3">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="border border-dashed border-neutral-300 bg-white p-12 text-center">
      <div className="font-display font-bold text-lg mb-1">{title}</div>
      {hint && <div className="text-sm text-neutral-500">{hint}</div>}
    </div>
  );
}
