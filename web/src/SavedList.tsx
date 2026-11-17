// The saved designs in the side panel: save the open one, open another, or delete one.

import type { Saved, useSaved } from "./storage";
import { Button, Section } from "./ui";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SavedList<S extends object>({ title, saved, name, spec, describe, onOpen }: {
  title: string;                        // for example "Saved trays"
  saved: ReturnType<typeof useSaved<S>>;
  name: string;                         // the file name of the open design
  spec: S;                              // the open design
  describe(spec: S): string;
  onOpen(spec: S): void;
}) {
  const isOpen = (e: Saved<S>) => JSON.stringify(e.spec) === JSON.stringify(spec);

  return (
    <Section title={title} aside={saved.list.length ? `${saved.list.length}` : undefined}>
      <div className="flex items-center gap-3">
        <Button onClick={() => saved.save(name, spec)} disabled={saved.has(spec)}>
          {saved.has(spec) ? "Saved" : "Save"}
        </Button>
        <p className="text-[0.8125rem] leading-snug text-muted">Make 3MF also saves. Designs stay in this browser.</p>
      </div>
      {saved.list.length > 0 && (
        <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule bg-sheet">
          {saved.list.map((e) => (
            <li key={`${e.name}-${e.saved}`} className="flex items-stretch">
              <button type="button" onClick={() => onOpen(e.spec)} aria-current={isOpen(e) ? "true" : undefined}
                      className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-white aria-[current]:bg-white aria-[current]:shadow-[inset_3px_0_0_var(--color-ink)]">
                <span className="block truncate text-[0.9375rem] font-medium">{describe(e.spec)}</span>
                <span className="block truncate font-cond text-[0.8125rem] text-muted">
                  {e.name} · {when.format(e.saved)}
                </span>
              </button>
              <button type="button" onClick={() => confirm(`Delete ${e.name}?`) && saved.remove(e)} aria-label={`Delete ${e.name}`}
                      className="px-3 text-[1.125rem] leading-none text-muted hover:bg-white hover:text-fault">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
