// Shared pieces of the home page: buttons and the section heading.

export const BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors";
export const BTN_PRIMARY = `${BTN} bg-brand text-brand-ink hover:bg-brand-hover`;
export const BTN_GHOST = `${BTN} border border-line-strong hover:bg-sunken`;

export const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8";

// Every section opens the same way: a numbered mono label on a rule, a
// serif title with one italic phrase, and a short line of copy.
export function SectionHead({ num, label, title, children, className = "", align = "left" }) {
  return (
    <div className={`hm-head ${align === "center" ? "mx-auto text-center" : ""} max-w-3xl ${className}`}>
      <p className={`hm-rise label text-muted flex items-center gap-3 ${align === "center" ? "justify-center" : ""}`}>
        <span className="text-brand-text">{num}</span>
        <span className="bg-line-strong h-px w-8" />
        {label}
      </p>
      <h2 className="hm-rise font-display mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-[3.5rem]">{title}</h2>
      {children && <p className="hm-rise text-muted mt-5 max-w-2xl text-lg leading-relaxed">{children}</p>}
    </div>
  );
}

// The italic accent inside a serif title.
export function Em({ children }) {
  return <em className="text-brand-text font-display italic">{children}</em>;
}
