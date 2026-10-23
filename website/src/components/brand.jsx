import { useId } from "react";
import { BRAND } from "@/lib/site";

// The tooth from the app icon, in a 100 × 120 box.
export const TOOTH_PATH =
  "M16 30 C16 16 24 10 36 12 C43 13 46 19 50 19 C54 19 57 13 64 12 C76 10 84 16 84 30 C87 46 80 62 74 80 C71 92 69 105 65 109 C62 112 59 108 58 102 C57 92 56 82 55 76 C54 70 46 70 45 76 C44 82 43 92 42 102 C41 108 38 112 35 109 C31 105 29 92 26 80 C20 62 13 46 16 30 Z";

// The app icon's mark: a cloud with a tooth cut out of it, in currentColor.
export function BrandMark({ className = "size-5" }) {
  const id = useId();
  return (
    <svg className={className} viewBox="2 2 96 66" aria-hidden="true">
      <mask id={id}>
        <rect x="0" y="0" width="100" height="70" fill="white" />
        <path d={TOOTH_PATH} fill="black" transform="translate(53 41) scale(0.392) translate(-50 -60)" />
      </mask>
      <g fill="currentColor" mask={`url(#${id})`}>
        <rect x="6" y="40" width="88" height="24" rx="12" />
        <circle cx="29" cy="40" r="19" />
        <circle cx="53" cy="30" r="25" />
        <circle cx="76" cy="42" r="17" />
      </g>
    </svg>
  );
}

// Logo tile + wordmark, used in every header and footer.
export function BrandLogo({ className = "" }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="bg-brand text-brand-ink flex size-8 shrink-0 items-center justify-center rounded-[10px]">
        <BrandMark className="w-5" />
      </span>
      <span className="text-[1.05rem] font-semibold tracking-tight" aria-hidden="true">
        Dent<span className="text-brand-text">X</span>Cloud
      </span>
      <span className="sr-only">{BRAND}</span>
    </span>
  );
}
