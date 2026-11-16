// Find a tray: questions about the items, one at a time. Then the smallest
// trays that hold them, drawn on the mat with each item in its compartment.

import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { placeOnBed } from "../bambu3mf";
import type { Build } from "../build";
import type { Block } from "../preview/PlateView";
import { PreviewPane, usePreview, ViewSwitch, type View } from "../preview/Preview";
import { BED } from "../printer";
import { HEIGHTS, buildTray, compAt, type TraySpec } from "../tray/tray";
import { TrayCanvas, type Mark } from "../tray/TrayCanvas";
import { Button, Section, inputClass } from "../ui";
import { Workbench } from "../Workbench";
import { FILL, LETTERS, find, type Found, type Item } from "./fit";
import { ItemsMat } from "./ItemsMat";

type Step = "name" | "size" | "count" | "loose" | "more" | "heights" | "searching" | "results";

interface Draft {
  name: string;
  w: string;
  l: string;
  h: string;
  count: string;
}

const EMPTY: Draft = { name: "", w: "", l: "", h: "", count: "1" };

function toItem(d: Draft, loose = false): Item | null {
  const [w, l, h] = [d.w, d.l, d.h].map(Number.parseFloat);
  const count = Number.parseInt(d.count, 10) || 1;
  return w > 0 && l > 0 && h > 0 ? { name: d.name.trim(), w, l, h, count, loose } : null;
}

function describe(item: Item) {
  return `${item.w} × ${item.l} × ${item.h} mm${item.loose ? `, ${item.count} loose in one compartment` : item.count > 1 ? `, ${item.count} of them` : ""}`;
}

function title(f: Found) {
  const merges = f.spec.merges.length;
  return {
    size: `${f.info.width} × ${f.info.length} × ${f.info.height} mm`,
    detail: `${f.plan.length[0].toUpperCase()}${f.plan.length.slice(1)} length, ${f.plan.width} width. A ${f.plan.cols} × ${f.plan.rows} grid` +
            `${merges ? ` with ${merges} ${merges === 1 ? "merge" : "merges"}` : ""}.`,
  };
}

/**
 * The items as blocks in the 3D view, each in its compartment on the tray body.
 * A loose item is a pile: it fills the compartment to the height of its volume.
 */
function itemBlocks(found: Found, items: Item[], build: Build): Block[] {
  const body = build.plates[0]?.objects[0];
  const mesh = body?.parts[0]?.mesh;
  if (!body || !mesh) return [];
  const [tx, ty] = placeOnBed([mesh], body.position, [BED, BED]);
  const { info } = found;
  const floor = mesh.max[2] - info.depth;
  return found.plan.places.flatMap((p) => {
    const comp = compAt(info, p.col, p.row);
    if (!comp) return [];
    const item = items[p.item];
    // The compartment, in tray coordinates. The back wall sets its position, as in parts-tray.scad.
    const x0 = -info.width / 2 + info.wall + comp.col * (info.unitW + info.divider);
    const back = -info.length / 2 + info.wall + (comp.row + comp.rows) * (info.unitL + info.divider) - info.divider;
    const cx = tx + x0 + comp.width / 2, cy = ty + back - comp.length / 2;
    if (item.loose) {
      const w = comp.width - 3, l = comp.length - 3;
      const h = Math.min(info.depth - 0.5, (item.count * item.w * item.l * item.h) / FILL / (w * l));
      return [{ center: [cx, cy, floor + h / 2], size: [w, l, h] }];
    }
    const along = (item.l >= item.w) === (comp.length >= comp.width);
    const w = along ? item.w : item.l, l = along ? item.l : item.w;
    return [{ center: [cx, cy, floor + item.h / 2], size: [w, l, item.h] }];
  });
}

function Question({ title, children, onBack }: { title: string; children: ReactNode; onBack?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Move the focus to each new question, and select the answer in it, so typing replaces it at once
  useEffect(() => {
    const field = heading.current?.parentElement?.querySelector<HTMLElement>("input, button[data-first]");
    field?.focus();
    if (field instanceof HTMLInputElement) field.select();
  }, [title]);
  return (
    <section className="border-t border-rule px-5 py-5">
      <h2 ref={heading} className="mb-3 font-cond text-[1.375rem] font-semibold leading-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
      {onBack && (
        <button type="button" onClick={onBack} className="mt-4 text-[0.875rem] text-muted underline underline-offset-2 hover:text-ink">
          Back
        </button>
      )}
    </section>
  );
}

export function FindTray({ items, setItems, onOpen }: {
  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  onOpen(spec: TraySpec): void;
}) {
  const [step, setStep] = useState<Step>(items.length ? "more" : "name");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [heights, setHeights] = useState<number[]>([]);   // empty: any height
  const [found, setFound] = useState<Found[]>([]);
  const [chosen, setChosen] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const preview = step === "size" || step === "count" || step === "loose" ? toItem(draft) : null;
  const sizeOk = toItem(draft) !== null;
  const count = Number.parseInt(draft.count, 10);

  const add = (loose: boolean) => {
    const item = toItem(draft, loose);
    if (!item) return;
    setItems((list) => [...list, item]);
    setDraft(EMPTY);
    setStep(items.length + 1 >= LETTERS.length ? "heights" : "more");
  };

  const search = async () => {
    setStep("searching");
    setError(null);
    try {
      const result = await find(items, { heights: heights.length ? heights : HEIGHTS });
      setFound(result);
      setChosen(0);
      setStep("results");
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed));
      setStep("heights");
    }
  };

  const enter = (next: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next();
    }
  };

  const best = found[chosen];
  const marks: Mark[] = best ? best.plan.places.map((p) => ({
    block: { col: p.col, row: p.row, cols: p.cols, rows: p.rows },
    letter: LETTERS[p.item], w: items[p.item].w, l: items[p.item].l,
    note: items[p.item].loose ? `${items[p.item].count}, loose` : undefined,
  })) : [];

  // The 3D view of the proposed tray. It renders again by itself when another tray is chosen.
  const [view, setView] = useState<View>("3d");
  const tray3d = usePreview(best ? JSON.stringify(best.spec) : "", () => (best ? buildTray(best.spec, { draft: true }) : Promise.reject(new Error("No tray"))),
                            { open: step === "results" && Boolean(best) && view === "3d", auto: true });
  const blocks = useMemo(() => (best && tray3d.build && !tray3d.stale ? itemBlocks(best, items, tray3d.build) : []),
                         [best, items, tray3d.build, tray3d.stale]);

  const mat = step === "results" && best ? (
    <>
      <ViewSwitch view={view} onChange={setView} />
      {view === "3d"
        ? <PreviewPane preview={tray3d} what="a draft of the tray" size={title(best).size} blocks={blocks}
                       note="Draft with coarse curves. Yellow blocks are your items at true size." />
        : <TrayCanvas spec={best.spec} info={best.info} marks={marks} label={`The ${title(best).size} tray, with each item in its compartment`} />}
    </>
  ) : <ItemsMat items={items} draft={preview} />;

  const panel = (
    <>
      <Section title="Your items" aside={items.length ? `${items.reduce((n, it) => n + it.count, 0)} in all` : undefined}>
        {items.length === 0 ? (
          <p className="text-[0.9375rem] text-muted">Answer the questions below. Each item appears on the mat at true size.</p>
        ) : (
          <ul className="-my-1 divide-y divide-rule">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink font-cond text-[1rem] font-semibold text-sheet">
                  {LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[0.9375rem] font-medium">{it.name || "No name"}</span>
                  <span className="block text-[0.8125rem] text-muted">{describe(it)}</span>
                </span>
                {step !== "searching" && (
                  <button type="button" aria-label={`Remove ${it.name || `item ${LETTERS[i]}`}`}
                          onClick={() => { setItems((list) => list.filter((_, j) => j !== i)); if (step === "results") setStep("more"); }}
                          className="grid h-8 w-8 place-items-center rounded-md text-[1.125rem] text-muted hover:bg-white hover:text-ink">×</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {step === "name" && (
        <Question title="What do you want to store?" onBack={items.length ? () => setStep("more") : undefined}>
          <input className={inputClass} value={draft.name} maxLength={16} placeholder="For example WAGO 2"
                 aria-label="Name" onChange={(e) => set({ name: e.target.value })} onKeyDown={enter(() => setStep("size"))} />
          <p className="text-[0.8125rem] leading-snug text-muted">The name becomes the label of its compartments. You can leave it empty.</p>
          <Button primary onClick={() => setStep("size")}>Next</Button>
        </Question>
      )}

      {step === "size" && (
        <Question title={`How big is one${draft.name ? ` ${draft.name}` : ""}?`} onBack={() => setStep("name")}>
          <div className="grid grid-cols-3 gap-2">
            {(["w", "l", "h"] as const).map((f) => (
              <label key={f} className="text-[0.875rem] text-muted">
                {{ w: "Width", l: "Length", h: "Height" }[f]}
                <input inputMode="decimal" className={`${inputClass} mt-1 font-cond text-[1.0625rem] font-semibold`} value={draft[f]}
                       placeholder="mm" onChange={(e) => set({ [f]: e.target.value })}
                       onKeyDown={enter(() => sizeOk && setStep("count"))} />
              </label>
            ))}
          </div>
          <p className="text-[0.8125rem] leading-snug text-muted">Measure at the largest point, in millimetres. The item can turn, so the order of width and length does not matter.</p>
          <Button primary onClick={() => setStep("count")} disabled={!sizeOk}>Next</Button>
        </Question>
      )}

      {step === "count" && (
        <Question title="How many do you have?" onBack={() => setStep("size")}>
          <input inputMode="numeric" className={`${inputClass} w-28 font-cond text-[1.0625rem] font-semibold`} value={draft.count}
                 aria-label="Count" onChange={(e) => set({ count: e.target.value.replace(/\D/g, "") })}
                 onKeyDown={enter(() => (count > 1 ? setStep("loose") : count === 1 && add(false)))} />
          <Button primary disabled={!(count >= 1)} onClick={() => (count > 1 ? setStep("loose") : add(false))}>Next</Button>
        </Question>
      )}

      {step === "loose" && (
        <Question title="How should they go in the tray?" onBack={() => setStep("count")}>
          <div className="grid gap-2">
            <button type="button" data-first onClick={() => add(false)}
                    className="rounded-md border border-rule bg-sheet px-4 py-3 text-left hover:border-ink">
              <span className="block font-medium">Each in its own compartment</span>
              <span className="block text-[0.8125rem] text-muted">For boards and parts that must not touch.</span>
            </button>
            <button type="button" onClick={() => add(true)}
                    className="rounded-md border border-rule bg-sheet px-4 py-3 text-left hover:border-ink">
              <span className="block font-medium">All loose in one compartment</span>
              <span className="block text-[0.8125rem] text-muted">For small parts in a pile, such as connectors or screws.</span>
            </button>
          </div>
        </Question>
      )}

      {step === "more" && (
        <Question title="Do you have another item to store?">
          <div className="flex flex-wrap gap-2">
            <button type="button" data-first onClick={() => setStep("name")}
                    className="rounded-md border border-rule bg-sheet px-3.5 py-2 text-[0.9375rem] font-medium hover:bg-white">Add another item</button>
            <Button primary onClick={() => setStep("heights")} disabled={!items.length}>No, find a tray</Button>
          </div>
        </Question>
      )}

      {step === "heights" && (
        <Question title="Which tray heights can I use?" onBack={() => setStep("more")}>
          <div role="group" aria-label="Tray heights" className="flex flex-wrap gap-2">
            <button type="button" data-first aria-pressed={heights.length === 0} onClick={() => setHeights([])}
                    className={`rounded-md px-3.5 py-2 text-[0.9375rem] font-medium ${heights.length === 0 ? "bg-ink text-sheet" : "border border-rule bg-sheet"}`}>
              Any
            </button>
            {HEIGHTS.map((h) => {
              const on = heights.includes(h);
              return (
                <button key={h} type="button" aria-pressed={on}
                        onClick={() => setHeights((list) => (on ? list.filter((x) => x !== h) : [...list, h].sort((a, b) => a - b)))}
                        className={`rounded-md px-3.5 py-2 font-cond text-[1.0625rem] font-semibold ${on ? "bg-ink text-sheet" : "border border-rule bg-sheet"}`}>
                  {h} mm
                </button>
              );
            })}
          </div>
          <p className="text-[0.8125rem] leading-snug text-muted">Short trays stack, and parts are easier to reach. Tall trays hold more.</p>
          {error && <p role="alert" className="text-[0.9375rem] text-fault">The search stopped: {error}</p>}
          <Button primary onClick={search}>Find trays</Button>
        </Question>
      )}

      {step === "searching" && (
        <Question title="Looking for trays">
          <p className="text-[0.9375rem] text-muted" aria-live="polite">
            The packer tries every tray size and grid. Then the model checks the best ones. This takes a few seconds.
          </p>
        </Question>
      )}

      {step === "results" && (
        <Question title={found.length ? "These trays hold your items" : "No single tray holds these items"}
                  onBack={() => setStep("heights")}>
          {found.length === 0 ? (
            <>
              <p className="text-[0.9375rem] leading-snug text-muted">Allow more tray heights, or split the items into two sets and find a tray for each set.</p>
              <Button onClick={() => setStep("more")}>Change the items</Button>
            </>
          ) : (
            <div role="radiogroup" aria-label="Trays" className="-mx-1 space-y-1">
              {found.map((f, i) => {
                const t = title(f);
                return (
                  <button key={i} type="button" role="radio" aria-checked={i === chosen} data-first={i === 0 || undefined}
                          onClick={() => setChosen(i)}
                          className={`block w-full rounded-md px-3 py-2 text-left ${i === chosen ? "bg-ink text-sheet" : "hover:bg-white"}`}>
                    <span className="block font-cond text-[1.125rem] font-semibold">{t.size}</span>
                    <span className={`block text-[0.8125rem] ${i === chosen ? "text-pla-shade" : "text-muted"}`}>{t.detail}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Question>
      )}
    </>
  );

  const status = (
    <>
      <p className="min-w-0 basis-full text-[0.9375rem] sm:basis-auto sm:flex-1">
        {step === "results" && best ? (
          <><span className="font-cond text-[1.125rem] font-semibold">{title(best).size}</span>
            <span className="text-muted"> tray. The smallest is first.</span></>
        ) : (
          <span className="text-muted">
            {items.length ? `${items.length} ${items.length === 1 ? "item" : "items"} so far` : "Describe the items that you want to store"}
          </span>
        )}
      </p>
      {step === "results" && best && <Button primary onClick={() => onOpen(best.spec)}>Open in the editor</Button>}
    </>
  );

  return <Workbench busy={step === "searching"} mat={mat} panel={panel} status={status} />;
}
