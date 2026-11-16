// Form controls for the side panel.

import { useId, useState, type ReactNode } from "react";

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-rule px-5 py-4 first:border-t-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-cond text-[1.0625rem] font-semibold leading-none tracking-[0.01em] text-ink">{title}</h2>
        {aside && <span className="text-[0.8125rem] text-muted">{aside}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A row of choices. One is always on. */
export function Choice<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T | null;
  options: { value: T; text: string; note?: string }[];
  onChange(value: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-px overflow-hidden rounded-md bg-rule p-px">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
                  className={`flex flex-col items-center justify-center rounded-[5px] px-2 py-1.5 leading-tight transition-colors ${
                    on ? "bg-ink text-sheet" : "bg-sheet text-ink hover:bg-white"}`}>
            <span className="text-[0.9375rem] font-medium">{o.text}</span>
            {o.note && <span className={`font-cond text-[0.75rem] ${on ? "text-pla-shade" : "text-muted"}`}>{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[0.875rem] font-medium text-muted">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-rule bg-sheet px-2.5 py-1.5 text-[0.9375rem] text-ink placeholder:text-muted/70 " +
  "focus:border-ink focus:outline-none disabled:opacity-50";

/** A whole number with step buttons. */
export function Stepper({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  const id = useId();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const button = "grid h-8 w-8 place-items-center rounded-md text-lg leading-none text-ink hover:bg-white disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-[0.9375rem]">{label}</label>
      <div className="flex items-center rounded-md border border-rule bg-sheet">
        <button type="button" className={button} onClick={() => set(value - 1)} disabled={value <= min}
                aria-label={`Fewer units ${label.toLowerCase()}`}>−</button>
        <input id={id} inputMode="numeric" value={value}
               onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (!Number.isNaN(n)) set(n); }}
               className="w-9 bg-transparent text-center font-cond text-[1.0625rem] font-semibold focus:outline-none" />
        <button type="button" className={button} onClick={() => set(value + 1)} disabled={value >= max}
                aria-label={`More units ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

export function Toggle({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${checked ? "bg-ink" : "bg-rule"}`}>
        <span className={`block h-4 w-4 rounded-full bg-sheet transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
      <span className="leading-snug">
        <span className="block text-[0.9375rem]">{label}</span>
        {note && <span className="block text-[0.8125rem] text-muted">{note}</span>}
      </span>
    </label>
  );
}

export function Button({ children, onClick, disabled, primary, title }: {
  children: ReactNode;
  onClick(): void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
            className={`rounded-md px-3.5 py-2 text-[0.9375rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              primary ? "bg-ink text-sheet hover:bg-black" : "border border-rule bg-sheet text-ink hover:bg-white"}`}>
      {children}
    </button>
  );
}

/** A length in mm. It reports a new value only when the text is a number in the range. */
export function Millimetres({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // The value changed from outside this field
    setShown(value);
    setText(String(value));
  }
  const n = Number.parseFloat(text);
  const bad = !(n >= min && n <= max);
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[0.9375rem]">{label}</label>
      <div className="flex items-center gap-1.5">
        <input id={id} inputMode="decimal" value={text} aria-invalid={bad}
               onChange={(e) => {
                 setText(e.target.value);
                 const v = Number.parseFloat(e.target.value);
                 if (v >= min && v <= max) { setShown(v); onChange(v); }
               }}
               className={`w-20 rounded-md border bg-sheet px-2 py-1 text-right font-cond text-[1.0625rem] font-semibold focus:outline-none ${
                 bad ? "border-fault focus:border-fault" : "border-rule focus:border-ink"}`} />
        <span className="w-6 text-[0.875rem] text-muted">mm</span>
      </div>
    </div>
  );
}
