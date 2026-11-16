// The tray editor: the form, the mat with the compartments, and Make 3MF.

import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { ModelError } from "../openscad";
import { download } from "../printer";
import { Button, Choice, Field, Section, Stepper, Toggle, inputClass } from "../ui";
import { Workbench } from "../Workbench";
import { TrayCanvas, type Unit } from "./TrayCanvas";
import {
  COLS, HEIGHTS, ROWS, autoName, compAt, inspect, key, makeProject, merge, split, tidyLabels,
  type Block, type Length, type TrayInfo, type TraySpec, type Width,
} from "./tray";

type Make =
  | { state: "idle" }
  | { state: "running"; steps: { part: string; seconds?: number }[]; started: number }
  | { state: "done"; name: string; seconds: number }
  | { state: "failed"; message: string };

/** The fields that change the geometry. Labels, the title, and the name do not need a new query. */
const shape = (s: TraySpec) => JSON.stringify([s.length, s.width, s.height, s.cols, s.rows, s.merges, s.pull, s.guides]);

export function TrayEditor({ spec, setSpec, nav }: { spec: TraySpec; setSpec: Dispatch<SetStateAction<TraySpec>>; nav: ReactNode }) {
  const [info, setInfo] = useState<TrayInfo | null>(null);
  const [infoShape, setInfoShape] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Unit>([0, 0]);
  const [anchor, setAnchor] = useState<Unit | null>(null);
  const [make, setMake] = useState<Make>({ state: "idle" });
  const [heightText, setHeightText] = useState("");
  const labelField = useRef<HTMLInputElement>(null);

  // Ask the model for the sizes after each change to the geometry. A newer change wins.
  const wanted = shape(spec);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      inspect(spec).then(
        (next) => {
          if (!current) return;
          setInfo(next);
          setInfoShape(wanted);
          setError(null);
          setSpec((s) => tidyLabels(s, next));
        },
        (failed) => current && setError(failed instanceof ModelError ? failed.message : String(failed)),
      );
    }, 120);
    return () => { current = false; clearTimeout(timer); };
    // spec is read only for its shape; labels and the title do not change the model answer
  }, [wanted]);

  const stale = infoShape !== wanted;
  const selection: Block = anchor
    ? { col: Math.min(anchor[0], cursor[0]), row: Math.min(anchor[1], cursor[1]),
        cols: Math.abs(anchor[0] - cursor[0]) + 1, rows: Math.abs(anchor[1] - cursor[1]) + 1 }
    : (() => {
        const c = info && compAt(info, cursor[0], cursor[1]);
        return c ? { col: c.col, row: c.row, cols: c.cols, rows: c.rows } : { col: cursor[0], row: cursor[1], cols: 1, rows: 1 };
      })();
  const here = info && !stale ? compAt(info, cursor[0], cursor[1]) : undefined;
  const merged = here ? spec.merges.some((m) => m.col === here.col && m.row === here.row && m.cols === here.cols && m.rows === here.rows) : false;
  const canMerge = !stale && selection.cols * selection.rows > 1 && Boolean(anchor);

  const update = (change: Partial<TraySpec>) => setSpec((s) => ({ ...s, ...change }));
  const regrid = (change: Partial<TraySpec>) => {
    // A new grid starts with single units
    setSpec((s) => ({ ...s, ...change, merges: [], labels: {} }));
    setCursor([0, 0]);
    setAnchor(null);
  };
  const doMerge = () => {
    if (!canMerge) return;
    setSpec((s) => merge(s, selection));
    setCursor([selection.col, selection.row]);
    setAnchor(null);
  };
  const doSplit = () => {
    if (merged) setSpec((s) => split(s, cursor[0], cursor[1]));
  };

  const move = (dc: number, dr: number, extend: boolean) => {
    const clamp = (u: Unit): Unit => [Math.min(Math.max(u[0], 0), spec.cols - 1), Math.min(Math.max(u[1], 0), spec.rows - 1)];
    if (extend) {
      setAnchor((a) => a ?? cursor);
      setCursor(clamp([cursor[0] + dc, cursor[1] + dr]));
      return;
    }
    // Go to the next compartment in this direction
    let unit = cursor;
    const start = info ? compAt(info, ...cursor) : undefined;
    for (;;) {
      const next = clamp([unit[0] + dc, unit[1] + dr]);
      if (next[0] === unit[0] && next[1] === unit[1]) break;
      unit = next;
      if (!info || compAt(info, ...unit) !== start) break;
    }
    setCursor(unit);
    setAnchor(null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      move(...arrows[e.key], e.shiftKey);
    } else if (e.key === "m" || e.key === "M") {
      doMerge();
    } else if (e.key === "s" || e.key === "S") {
      doSplit();
    } else if (e.key === "Enter" && here?.usable) {
      e.preventDefault();
      labelField.current?.focus();
    } else if (e.key === "Escape") {
      setAnchor(null);
    }
  };

  const onPick = (unit: Unit, extend: boolean) => {
    if (extend) setAnchor((a) => a ?? cursor);
    else setAnchor(null);
    setCursor(unit);
  };

  const run = async () => {
    const started = performance.now();
    setMake({ state: "running", steps: [], started });
    try {
      const { name, file } = await makeProject(spec, ({ part, done, seconds }) =>
        setMake((m) => m.state !== "running" ? m : {
          ...m, steps: done ? m.steps.map((s) => s.part === part ? { part, seconds } : s) : [...m.steps, { part }],
        }));
      download(`${name}.3mf`, file);
      setMake({ state: "done", name: `${name}.3mf`, seconds: (performance.now() - started) / 1000 });
    } catch (failed) {
      setMake({ state: "failed", message: failed instanceof Error ? failed.message : String(failed) });
    }
  };

  const busy = make.state === "running";
  const lengths: { value: Length; text: string; note: string }[] =
    [{ value: "full", text: "Full", note: "245 mm" }, { value: "half", text: "Half", note: "122 mm" }, { value: "quarter", text: "Quarter", note: "60.5 mm" }];
  const widths: { value: Width; text: string; note: string }[] =
    [{ value: "full", text: "Full", note: "95 mm" }, { value: "half", text: "Half", note: "47 mm" }];
  const customHeight = !HEIGHTS.includes(spec.height);

  return (
    <Workbench nav={nav} busy={busy} mat={<>
        {info ? (
          <TrayCanvas spec={spec} info={info} cursor={cursor} selection={selection} selecting={Boolean(anchor)} stale={stale} busy={busy}
                      onPick={onPick} onKey={onKey} />
        ) : (
          <p className="grid h-full place-items-center px-6 text-center font-cond text-[1.25rem] text-mat-ink">
            {error ?? "Loading OpenSCAD and measuring the tray"}
          </p>
        )}
        {error && info && (
          <p role="alert" className="absolute inset-x-4 top-4 rounded-md bg-sheet px-4 py-3 text-[0.9375rem] shadow-lg lg:inset-x-auto lg:left-6 lg:max-w-md">
            <span className="font-semibold text-fault">The model rejects this tray.</span> {error}. Change the grid or the size.
          </p>
        )}
      </>} panel={<>
        <Section title="Size">
          <Field label="Length">{() => <Choice label="Length" value={spec.length} options={lengths}
            onChange={(length) => regrid({ length, rows: ROWS[length] })} />}</Field>
          <Field label="Width">{() => <Choice label="Width" value={spec.width} options={widths}
            onChange={(width) => regrid({ width, cols: COLS[width] })} />}</Field>
          <Field label="Height with the lid" hint="24, 32, 48, and 96 mm stack to fill the box.">{() => (
            <div className="space-y-2">
              <Choice label="Height" value={customHeight ? null : spec.height}
                      options={HEIGHTS.map((h) => ({ value: h, text: `${h}` }))}
                      onChange={(height) => { setHeightText(""); update({ height }); }} />
              <input aria-label="Other height in mm" inputMode="decimal" placeholder="Other, 14 to 98 mm"
                     value={customHeight ? String(spec.height) : heightText} className={inputClass}
                     onChange={(e) => {
                       setHeightText(e.target.value);
                       const h = Number.parseFloat(e.target.value);
                       if (h >= 14 && h <= 98) update({ height: h });
                     }} />
            </div>
          )}</Field>
        </Section>

        <Section title="Grid" aside={info && !stale ? `${info.unitW.toFixed(1)} × ${info.unitL.toFixed(1)} mm units` : undefined}>
          <Stepper label="Across" value={spec.cols} min={1} max={10} onChange={(cols) => regrid({ cols })} />
          <Stepper label="Along" value={spec.rows} min={1} max={26} onChange={(rows) => regrid({ rows })} />
          <Toggle label="Finger pocket" note="A notch in the front end to lift the tray out." checked={spec.pull}
                  onChange={(pull) => update({ pull })} />
          <Toggle label="Label guides" note="Rails on the back wall that hold a printed label." checked={spec.guides}
                  onChange={(guides) => update({ guides })} />
        </Section>

        <Section title="Compartment" aside={here?.usable ? `${here.width.toFixed(1)} × ${here.length.toFixed(1)} mm` : undefined}>
          {here && !here.usable ? (
            <p className="text-[0.9375rem] leading-snug text-muted">
              This unit is too short behind the finger pocket, so it stays solid. Merge it with the unit behind it, or turn off the pocket.
            </p>
          ) : (
            <Field label="Label" hint={here?.guided ? "About 6 characters print well on a slide-in label." : "Goes on the lid map only. This compartment has no label guides."}>
              {(id) => (
                <input id={id} ref={labelField} maxLength={16} className={inputClass} disabled={!here}
                       placeholder="For example M3x8"
                       value={here ? spec.labels[key(here.col, here.row)] ?? "" : ""}
                       onChange={(e) => here && setSpec((s) => {
                         const labels = { ...s.labels };
                         if (e.target.value) labels[key(here.col, here.row)] = e.target.value;
                         else delete labels[key(here.col, here.row)];
                         return { ...s, labels };
                       })}
                       onKeyDown={(e) => { if (e.key === "Enter") (document.querySelector("main svg[role=application]") as SVGSVGElement | null)?.focus(); }} />
              )}
            </Field>
          )}
          <div className="flex gap-2">
            <Button onClick={doMerge} disabled={!canMerge} title="Shortcut: M">Merge selection</Button>
            <Button onClick={doSplit} disabled={!merged} title="Shortcut: S">Split</Button>
          </div>
          <p className="text-[0.8125rem] leading-snug text-muted">Drag across units, or hold Shift and press the arrow keys, to select more than one.</p>
        </Section>

        <Section title="Lid">
          <Field label="Title on the outside">{(id) => (
            <input id={id} maxLength={24} className={inputClass} value={spec.title} placeholder="For example Screws"
                   onChange={(e) => update({ title: e.target.value })} />
          )}</Field>
          <Field label="File name">{(id) => (
            <input id={id} className={inputClass} value={spec.name} placeholder={autoName(spec)}
                   onChange={(e) => update({ name: e.target.value.trim() })} />
          )}</Field>
        </Section>
      </>} status={<>
        <p className="min-w-0 basis-full text-[0.9375rem] sm:basis-auto sm:flex-1">
          {info && !stale ? (
            <>
              <span className="font-cond text-[1.125rem] font-semibold">{info.width} × {info.length} × {info.height} mm</span>
              <span className="text-muted"> tray with {info.comps.filter((c) => c.usable).length} compartments, each {info.depth.toFixed(1)} mm deep</span>
            </>
          ) : <span className="text-muted">Measuring the tray</span>}
        </p>
        <p className="text-[0.9375rem] text-muted" aria-live="polite">
          {make.state === "running" && `Rendering ${make.steps.filter((s) => s.seconds === undefined).map((s) => s.part).join(", ") || "the parts"}`}
          {make.state === "done" && `Saved ${make.name} in ${make.seconds.toFixed(0)} s`}
          {make.state === "failed" && <span className="text-fault">{make.message}</span>}
        </p>
        <Button primary onClick={run} disabled={busy || stale || Boolean(error)}>
          {busy ? "Making the 3MF" : "Make 3MF"}
        </Button>
      </>} />
  );
}
