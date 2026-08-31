export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-8 lg:mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-[#E60012] mb-2 sm:mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.05]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 sm:mt-3 text-sm md:text-base text-neutral-500 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className={`bg-white border border-neutral-200 p-4 sm:p-6 relative ${accent ? "accent-line pl-5 sm:pl-8" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <div className="font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-neutral-500 leading-tight">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-neutral-300 shrink-0" />}
      </div>
      <div className="font-display font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-none break-words">{value}</div>
      {sub && <div className="font-mono text-[10px] sm:text-xs text-neutral-500 mt-2 sm:mt-3">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="border border-dashed border-neutral-300 bg-white p-8 sm:p-12 text-center">
      <div className="font-display font-bold text-base sm:text-lg mb-1">{title}</div>
      {hint && <div className="text-sm text-neutral-500">{hint}</div>}
    </div>
  );
}
