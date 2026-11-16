// The 3D preview on the mat: the switch between the top view and 3D, the state of
// the preview, and a picker when the build has more than one plate.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Build } from "../build";
import type { Block } from "./PlateView";

// three.js is large. It loads the first time someone opens the 3D view.
const PlateView = lazy(() => import("./PlateView"));
const PendingView = lazy(() => import("./PendingView"));

export type View = "top" | "3d";

export function ViewSwitch({ view, onChange }: { view: View; onChange(view: View): void }) {
  return (
    <div role="group" aria-label="View" className="absolute right-4 top-4 z-10 flex gap-px overflow-hidden rounded-md bg-mat-line/60 p-px shadow-lg">
      {([["top", "Top view"], ["3d", "3D"]] as const).map(([v, text]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}
                className={`rounded-[5px] px-3 py-1.5 text-[0.875rem] font-medium transition-colors ${
                  view === v ? "bg-sheet text-ink" : "bg-mat text-mat-ink hover:bg-mat-line"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

interface PreviewState {
  build: Build | null;
  key: string;            // the spec that the build is for
  running: boolean;
  error: string | null;
  failedKey: string;      // the spec whose render failed. It does not render again by itself.
}

/**
 * Keep the newest preview build. `run` renders one for the current spec. `keep` stores a
 * build made for the 3MF, so the preview shows the final parts. With `auto`, the
 * preview renders again by itself after each change while the 3D view is open.
 */
export function usePreview(key: string, make: () => Promise<Build>, { open, auto }: { open: boolean; auto: boolean }) {
  const [state, setState] = useState<PreviewState>({ build: null, key: "", running: false, error: null, failedKey: "" });
  const latest = useRef(0);
  const makeRef = useRef(make);
  makeRef.current = make;

  const run = useCallback(() => {
    const id = ++latest.current;
    setState((s) => ({ ...s, running: true, error: null }));
    makeRef.current().then(
      (build) => { if (id === latest.current) setState({ build, key, running: false, error: null, failedKey: "" }); },
      (failed) => {
        if (id === latest.current) {
          setState((s) => ({ ...s, running: false, failedKey: key, error: failed instanceof Error ? failed.message : String(failed) }));
        }
      },
    );
  }, [key]);

  const keep = useCallback((build: Build) => setState({ build, key, running: false, error: null, failedKey: "" }), [key]);

  // Render when the 3D view opens with nothing to show, and after changes in auto mode
  const stale = state.key !== key;
  useEffect(() => {
    if (!open || state.running || state.failedKey === key) return;
    if (!state.build || (auto && stale)) {
      const timer = setTimeout(run, auto && state.build ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [open, auto, stale, state.build, state.running, state.failedKey, key, run]);

  // An error belongs to the spec that failed
  return { ...state, error: state.failedKey === key ? state.error : null, stale, run, keep };
}

const banner = "absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md bg-sheet px-4 py-2 text-[0.875rem] shadow-lg";

export function PreviewPane({ preview, what, size, blocks, note }: {
  preview: ReturnType<typeof usePreview>;
  what: string;       // for example "a draft of the tray"
  size: string;       // the size of the part that renders, for example "95 × 122 × 24 mm"
  blocks?: Block[];   // drawn on plate 1 only
  note?: string;      // in place of the usual caption
}) {
  const [plate, setPlate] = useState(0);
  const { build, stale, running, error, run } = preview;
  const plates = build?.plates ?? [];
  const shown = plates[Math.min(plate, plates.length - 1)];
  // A slow draft does not show the old part while the new one renders: the 3D text takes its place.
  // A fast render, such as the box, keeps the old part on screen for its second of work.
  const pending = !error && (!build || (running && stale && build.draft));
  const loading = <p className="grid h-full place-items-center font-cond text-[1.25rem] text-mat-ink">Loading the 3D view</p>;

  return (
    <div className="relative h-full w-full">
      {pending ? (
        <Suspense fallback={loading}>
          <PendingView title={size} detail={`Rendering ${what}`} />
        </Suspense>
      ) : shown ? (
        <Suspense fallback={loading}>
          <PlateView plate={shown} blocks={shown === plates[0] ? blocks : undefined} />
        </Suspense>
      ) : null}
      {pending && <p className="sr-only" aria-live="polite">Rendering {what}</p>}

      {error && (
        <p role="alert" className={banner}><span className="font-semibold text-fault">The preview failed.</span> {error}</p>
      )}
      {!error && !pending && build && (running || stale) && (
        <p className={banner} aria-live="polite">
          {running ? <span>Updating the preview</span> : (
            <>
              <span>The preview is out of date.</span>
              <button type="button" onClick={run} className="rounded-md bg-ink px-2.5 py-1 font-medium text-sheet">Update</button>
            </>
          )}
        </p>
      )}

      {!pending && plates.length > 1 && (
        <div role="group" aria-label="Plate" className="absolute bottom-4 left-4 z-10 flex gap-px overflow-hidden rounded-md bg-mat-line/60 p-px">
          {plates.map((p, i) => (
            <button key={i} type="button" aria-pressed={i === plate} onClick={() => setPlate(i)}
                    className={`rounded-[5px] px-3 py-1.5 text-[0.875rem] ${i === plate ? "bg-sheet text-ink" : "bg-mat text-mat-ink hover:bg-mat-line"}`}>
              Plate {i + 1}{i > 0 ? `, ${p.name.toLowerCase()}` : ""}
            </button>
          ))}
        </div>
      )}

      {build && !pending && (
        <p className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-xs text-right font-cond text-[0.9375rem] text-mat-ink/85">
          {note ?? (build.draft ? "Draft with coarse curves. Make 3MF shows the final parts." : "The parts as they print.")}
          <span className="block text-[0.8125rem] opacity-80">Drag to turn. Scroll to zoom.</span>
        </p>
      )}
    </div>
  );
}
