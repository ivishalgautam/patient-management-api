"use client";
import { useState } from "react";
import { CalendarClock, FileImage, Pill } from "lucide-react";
import { CONTAINER, Em, SectionHead } from "./ui";

// FDI tooth names by the second digit, and the quadrant by the first.
const NAMES = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar"];
const QUADRANTS = ["", "Upper right", "Upper left", "Lower left", "Lower right"];
// Crown size on the chart (along the arch × across it).
const SIZE = { 1: [20, 22], 2: [17, 21], 3: [19, 24], 4: [19, 24], 5: [19, 25], 6: [28, 30], 7: [26, 29], 8: [24, 27] };

// A sample patient's chart.
const CHART = {
  16: { status: "treated", title: "Root canal & crown", note: "Completed 12 Aug 2026 · Dr. Mehta" },
  26: { status: "planned", title: "Crown", note: "Planned after root canal heals · ₹6,500" },
  36: { status: "treated", title: "Composite filling (MO)", note: "Completed 3 Jun 2026" },
  46: { status: "watch", title: "Early caries", note: "Review at the 6-month recall" },
  48: { status: "planned", title: "Extraction", note: "Impacted · booked for 30 Oct · ₹4,000" },
  38: { status: "missing", title: "Missing", note: "Extracted in 2023" },
  11: { status: "treated", title: "Composite veneer", note: "Completed 2025" },
  22: { status: "watch", title: "Sensitivity", note: "Desensitising paste advised" },
};

const STATUS = {
  healthy: { label: "Healthy", fill: "fill-surface", pill: "bg-sunken text-muted", swatch: "bg-surface border border-line-strong" },
  treated: { label: "Treated", fill: "fill-brand", pill: "bg-mint text-brand-text", swatch: "bg-brand" },
  planned: { label: "Planned", fill: "fill-amber", pill: "bg-amber-wash text-ink", swatch: "bg-amber" },
  watch: { label: "Watch", fill: "fill-coral", pill: "bg-coral-wash text-ink", swatch: "bg-coral" },
  missing: { label: "Missing", fill: "fill-transparent", pill: "bg-sunken text-muted", swatch: "border border-dashed border-line-strong" },
};

// Lay one arch of 16 teeth along half an ellipse. `down` is +1 for the
// upper arch (an ∩, incisors at the top) and -1 for the lower (a ∪).
function arch(numbers, cx, cy, rx, ry, down) {
  const widths = numbers.map((n) => SIZE[n % 10][0] + 3);
  const total = widths.reduce((a, b) => a + b, 0);
  let run = 0;
  return numbers.map((n, i) => {
    const t = (run + widths[i] / 2) / total;
    run += widths[i];
    const phi = Math.PI * (1.07 + 0.86 * t);
    const x = cx + rx * Math.cos(phi);
    const y = cy + down * ry * Math.sin(phi);
    const rotate = (Math.atan2(down * ry * Math.cos(phi), -rx * Math.sin(phi)) * 180) / Math.PI;
    // Outward, for the number label.
    const len = Math.hypot(x - cx, y - cy) || 1;
    // Rounded so the server and the browser print identical attributes.
    const r = (v) => Math.round(v * 100) / 100;
    return { n, x: r(x), y: r(y), rotate: r(rotate), lx: r(x + ((x - cx) / len) * 26), ly: r(y + ((y - cy) / len) * 26) };
  });
}

const UPPER = arch([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], 210, 282, 150, 170, 1);
const LOWER = arch([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38], 210, 252, 140, 160, -1);
const TEETH = [...UPPER, ...LOWER];

function Tooth({ tooth, selected, onSelect }) {
  const [w, h] = SIZE[tooth.n % 10];
  const status = CHART[tooth.n]?.status || "healthy";
  const molar = tooth.n % 10 >= 6;
  const missing = status === "missing";
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Tooth ${tooth.n}: ${QUADRANTS[Math.floor(tooth.n / 10)]} ${NAMES[tooth.n % 10]}, ${STATUS[status].label}`}
      aria-pressed={selected}
      className="hm-tooth cursor-pointer outline-none"
      onClick={() => onSelect(tooth.n)}
      onMouseEnter={() => onSelect(tooth.n)}
      onFocus={() => onSelect(tooth.n)}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onSelect(tooth.n)}
    >
      <g transform={`translate(${tooth.x} ${tooth.y}) rotate(${tooth.rotate})`}>
        <g className="hm-tooth-body">
          {selected && (
            <rect x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx="11" className="fill-none stroke-ink" strokeWidth="1.5" />
          )}
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx={molar ? 8 : 7}
            className={`hm-tooth-fill ${STATUS[status].fill} stroke-line-strong transition-[fill] duration-300`}
            data-status={status}
            strokeWidth="1.5"
            strokeDasharray={missing ? "3 3" : undefined}
          />
          {!missing && (
            <path
              d={molar ? `M${-w / 4} 0 L${w / 4} 0 M0 ${-h / 4} L0 ${h / 4}` : `M${-w / 5} 0 L${w / 5} 0`}
              className="stroke-ink/25 fill-none"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          )}
        </g>
      </g>
      <text
        x={tooth.lx}
        y={tooth.ly}
        textAnchor="middle"
        dominantBaseline="middle"
        className={`font-mono text-[9px] ${selected ? "fill-ink font-semibold" : "fill-muted"}`}
      >
        {tooth.n}
      </text>
    </g>
  );
}

export function ToothChart() {
  const [selected, setSelected] = useState(16);
  const entry = CHART[selected];
  const status = STATUS[entry?.status || "healthy"];
  const plan = Object.entries(CHART).filter(([, v]) => v.status === "planned" || v.status === "watch");

  return (
    <section id="chart" className="border-line border-t py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHead
          num="01"
          label="Clinical records"
          title={
            <>
              Every tooth, <Em>every visit</Em>, on one chart.
            </>
          }
        >
          Chart findings tooth by tooth on the FDI chart you already use. Treatment plans, visits, prescriptions, X-rays and
          payments all hang off the same patient file. Try it: pick a tooth.
        </SectionHead>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          <div className="hm-chart bg-surface border-line shadow-card relative rounded-3xl border p-4 sm:p-8">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Aarav Menon · 34 · #P-0217</p>
              <p className="label text-muted">FDI chart</p>
            </div>
            <svg viewBox="28 72 364 386" className="mx-auto mt-2 w-full max-w-md" role="group" aria-label="Dental chart">
              <text x="210" y="252" textAnchor="middle" className="label fill-muted" style={{ fontSize: 9 }}>
                UPPER
              </text>
              <text x="210" y="286" textAnchor="middle" className="label fill-muted" style={{ fontSize: 9 }}>
                LOWER
              </text>
              <line x1="70" x2="350" y1="266" y2="266" className="stroke-line" strokeDasharray="2 4" />
              {TEETH.map((tooth) => (
                <Tooth key={tooth.n} tooth={tooth} selected={tooth.n === selected} onSelect={setSelected} />
              ))}
            </svg>
            <ul className="text-muted mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
              {Object.entries(STATUS).map(([key, s]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className={`${s.swatch} size-3 rounded-[4px]`} />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6">
            {/* The selected tooth */}
            <div className="hm-reveal bg-surface border-line shadow-card rounded-3xl border p-6 sm:p-7" aria-live="polite">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="label text-muted">Tooth {selected}</p>
                  <p className="font-display mt-1 text-3xl">
                    {QUADRANTS[Math.floor(selected / 10)]} {NAMES[selected % 10]}
                  </p>
                </div>
                <span className={`${status.pill} shrink-0 rounded-full px-3 py-1 text-xs font-medium`}>{status.label}</span>
              </div>
              <div className="border-line mt-5 border-t pt-5">
                {entry ? (
                  <>
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-muted mt-1 text-sm">{entry.note}</p>
                  </>
                ) : (
                  <p className="text-muted text-sm">No findings. Notes, X-rays and procedures for this tooth would show here.</p>
                )}
              </div>
              <div className="text-muted mt-5 flex flex-wrap gap-2 text-xs">
                {[
                  [FileImage, "X-rays"],
                  [Pill, "Prescriptions"],
                  [CalendarClock, "Visits"],
                ].map(([Icon, label]) => (
                  <span key={label} className="border-line flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                    <Icon className="size-3.5" /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* What's next for this patient */}
            <div className="hm-reveal bg-sunken border-line rounded-3xl border p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <p className="font-medium">Treatment plan</p>
                <p className="label text-muted">Next steps</p>
              </div>
              <ul className="mt-4 space-y-1">
                {plan.map(([tooth, item]) => (
                  <li key={tooth}>
                    <button
                      type="button"
                      onClick={() => setSelected(Number(tooth))}
                      className={`hover:bg-surface flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        Number(tooth) === selected ? "bg-surface" : ""
                      }`}
                    >
                      <span className={`${STATUS[item.status].swatch} size-2.5 shrink-0 rounded-full`} />
                      <span className="label text-muted w-6">{tooth}</span>
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className="text-muted truncate text-xs">{STATUS[item.status].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
