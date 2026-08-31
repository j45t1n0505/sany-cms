import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

export const UnitGallery = ({ images = [], alt = "", testId }) => {
  const [i, setI] = useState(0);
  const has = images.length > 0;
  const go = (e, dir) => {
    e.stopPropagation();
    setI((p) => (p + dir + images.length) % images.length);
  };

  if (!has) {
    return (
      <div className="aspect-[16/10] bg-neutral-100 grid place-items-center text-neutral-400">
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden group/gal" data-testid={testId}>
      {images.map((src, idx) => (
        <img
          key={src + idx}
          src={src}
          alt={`${alt} ${idx + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
            idx === i ? "opacity-100 scale-100" : "opacity-0 scale-105"
          }`}
        />
      ))}

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => go(e, -1)}
            data-testid={testId ? `${testId}-prev` : undefined}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-neutral-950/70 text-white grid place-items-center opacity-100 md:opacity-60 md:group-hover/gal:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-[#E60012] hover:bg-[#E60012] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => go(e, 1)}
            data-testid={testId ? `${testId}-next` : undefined}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-neutral-950/70 text-white grid place-items-center opacity-100 md:opacity-60 md:group-hover/gal:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-[#E60012] hover:bg-[#E60012] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setI(idx); }}
                data-testid={testId ? `${testId}-dot-${idx}` : undefined}
                className={`h-1.5 transition-all ${idx === i ? "w-5 bg-[#E60012]" : "w-1.5 bg-white/70 hover:bg-white"}`}
              />
            ))}
          </div>
          <div className="absolute top-2 right-2 bg-neutral-950/70 text-white font-mono text-[9px] px-2 py-0.5 tracking-widest">
            {i + 1}/{images.length}
          </div>
        </>
      )}
    </div>
  );
};
