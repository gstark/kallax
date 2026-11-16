// The Kallax box editor: the form, the top and front views on the mat, and Make 3MF.

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toProject } from "../build";
import { ModelError } from "../openscad";
import { PreviewPane, usePreview, ViewSwitch, type View } from "../preview/Preview";
import { download } from "../printer";
import { Button, Choice, Millimetres, Section, Toggle } from "../ui";
import { Workbench } from "../Workbench";
import { boxName, buildBox, inspectBox, type BoxInfo, type BoxSpec } from "./box";
import { BoxCanvas } from "./BoxCanvas";

type Make =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; name: string; seconds: number }
  | { state: "failed"; message: string };

export function BoxEditor({ spec, setSpec }: { spec: BoxSpec; setSpec: Dispatch<SetStateAction<BoxSpec>> }) {
  const [info, setInfo] = useState<BoxInfo | null>(null);
  const [infoFor, setInfoFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [make, setMake] = useState<Make>({ state: "idle" });

  // Ask the model for the sizes after each change. A newer change wins.
  const wanted = JSON.stringify([spec.wall, spec.height, spec.cutoutTop, spec.cutoutBottom, spec.cutoutDepth]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      inspectBox(spec).then(
        (next) => { if (current) { setInfo(next); setInfoFor(wanted); setError(null); } },
        (failed) => current && setError(failed instanceof ModelError ? failed.message : String(failed)),
      );
    }, 120);
    return () => { current = false; clearTimeout(timer); };
    // the spec is read only for the fields in wanted
  }, [wanted]);

  const stale = infoFor !== wanted;
  const update = (change: Partial<BoxSpec>) => setSpec((s) => ({ ...s, ...change }));
  const busy = make.state === "running";

  // The box renders in about a second, so the 3D view follows each change by itself
  const [view, setView] = useState<View>("3d");
  const preview = usePreview(JSON.stringify(spec), () => buildBox(spec), { open: view === "3d", auto: true });

  const run = async () => {
    const started = performance.now();
    const keep = preview.keep;
    setMake({ state: "running" });
    try {
      const build = await buildBox(spec);
      keep(build);
      download(`${build.name}.3mf`, toProject(build));
      setMake({ state: "done", name: `${build.name}.3mf`, seconds: (performance.now() - started) / 1000 });
    } catch (failed) {
      setMake({ state: "failed", message: failed instanceof Error ? failed.message : String(failed) });
    }
  };

  const mat = view === "3d" ? (
    <>
      <ViewSwitch view={view} onChange={setView} />
      <PreviewPane preview={preview} what="the box" size={info ? `${info.width} × ${info.depth} × ${info.height} mm` : "Kallax box"} />
    </>
  ) : info ? (
    <>
      <ViewSwitch view={view} onChange={setView} />
      <BoxCanvas info={info} stale={stale} busy={busy} />
      {error && (
        <p role="alert" className="absolute inset-x-4 top-4 rounded-md bg-sheet px-4 py-3 text-[0.9375rem] shadow-lg lg:inset-x-auto lg:left-6 lg:max-w-md">
          <span className="font-semibold text-fault">The model rejects this box.</span> {error}.
        </p>
      )}
    </>
  ) : (
    <p className="grid h-full place-items-center px-6 text-center font-cond text-[1.25rem] text-mat-ink">
      {error ?? "Loading OpenSCAD and measuring the box"}
    </p>
  );

  const panel = (
    <>
      <Section title="Size">
        <p className="text-[0.875rem] leading-snug text-muted">
          The inside is always 96 × 246 mm. The trays and the small boxes are made for it. The outside grows with the wall.
        </p>
        <Millimetres label="Wall" value={spec.wall} min={1.2} max={5} onChange={(wall) => update({ wall })} />
        <Millimetres label="Height" value={spec.height} min={20} max={250} onChange={(height) => update({ height })} />
        <p className="text-[0.8125rem] leading-snug text-muted">
          The trays stack to 96 mm, so they need a height of 100 mm. The wall can be 5 mm at most, so that the box fits on the 256 mm bed.
        </p>
      </Section>

      <Section title="Finger cutout">
        <Toggle label="Cutout in the front wall" note="A notch to pull the box out of the shelf." checked={spec.cutoutDepth > 0}
                onChange={(on) => update({ cutoutDepth: on ? 15 : 0 })} />
        {spec.cutoutDepth > 0 && (
          <>
            <Millimetres label="Width at the rim" value={spec.cutoutTop} min={12} max={88} onChange={(cutoutTop) => update({ cutoutTop })} />
            <Millimetres label="Width at the bottom" value={spec.cutoutBottom} min={12} max={88} onChange={(cutoutBottom) => update({ cutoutBottom })} />
            <Millimetres label="Depth" value={spec.cutoutDepth} min={1} max={spec.height / 2} onChange={(cutoutDepth) => update({ cutoutDepth })} />
          </>
        )}
      </Section>

      <Section title="Print">
        <Toggle label="Sandwich wall" checked={spec.sandwich} onChange={(sandwich) => update({ sandwich })}
                note="One perimeter on each face with 15% gyroid infill between them. A thick hollow wall is stiffer than a thin solid wall of the same plastic." />
        <div>
          <p className="mb-1 text-[0.875rem] font-medium text-muted">Boxes on the plate</p>
          <Choice label="Boxes on the plate" value={spec.count} options={[{ value: 1, text: "One" }, { value: 2, text: "Two" }]}
                  onChange={(count) => update({ count: count as 1 | 2 })} />
        </div>
        <p className="text-[0.8125rem] leading-snug text-muted">
          The project uses the 0.28 mm Extra Draft process. The 1.12 mm floor is four layers.
          {spec.sandwich ? " Each box carries the sandwich settings, so the process preset stays as it is." : ""}
        </p>
      </Section>
    </>
  );

  const status = (
    <>
      <p className="min-w-0 basis-full text-[0.9375rem] sm:basis-auto sm:flex-1">
        {info && !stale ? (
          <>
            <span className="font-cond text-[1.125rem] font-semibold">{info.width} × {info.depth} × {info.height} mm</span>
            <span className="text-muted"> box, {info.innerWidth} × {info.innerDepth} mm inside</span>
          </>
        ) : <span className="text-muted">Measuring the box</span>}
      </p>
      <p className="text-[0.9375rem] text-muted" aria-live="polite">
        {make.state === "running" && "Rendering the box"}
        {make.state === "done" && `Saved ${make.name} in ${make.seconds.toFixed(0)} s`}
        {make.state === "failed" && <span className="text-fault">{make.message}</span>}
      </p>
      <Button primary onClick={run} disabled={busy || stale || Boolean(error)} title={boxName(spec)}>
        {busy ? "Making the 3MF" : "Make 3MF"}
      </Button>
    </>
  );

  return <Workbench busy={busy} mat={mat} panel={panel} status={status} />;
}
