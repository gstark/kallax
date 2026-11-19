// The page: the Kallax box, and the trays that go in it. "Find a tray" loads its result into the tray editor.
// The header stays in place across the modes, so the underline under the mode can slide to the next one.

import { useLayoutEffect, useRef, useState } from "react";
import { specReader, usePersisted } from "./storage";
import { DEFAULT_BOX, type BoxSpec } from "./box/box";
import { BoxEditor } from "./box/BoxEditor";
import type { Item } from "./fit/room";
import { FindTray } from "./fit/FindTray";
import { DEFAULT_SPEC, type TraySpec } from "./tray/tray";
import { TrayEditor } from "./tray/TrayEditor";

type Mode = "box" | "edit" | "find";

const MODES: { mode: Mode; text: string }[] = [
  { mode: "box", text: "Box" },
  { mode: "edit", text: "Edit a tray" },
  { mode: "find", text: "Find a tray for my items" },
];

/** The mode links, with one underline that slides to the current mode. */
function ModeNav({ mode, onChange }: { mode: Mode; onChange(mode: Mode): void }) {
  const nav = useRef<HTMLElement>(null);
  const [line, setLine] = useState<{ left: number; width: number; moved: boolean } | null>(null);

  // Measure the current link after each change, and again when the fonts or the window change its width
  useLayoutEffect(() => {
    const measure = (moved: boolean) => {
      const link = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
      if (link) setLine((old) => ({ left: link.offsetLeft, width: link.offsetWidth, moved: moved && old !== null }));
    };
    measure(true);
    const resize = new ResizeObserver(() => measure(false));
    if (nav.current) resize.observe(nav.current);
    return () => resize.disconnect();
  }, [mode]);

  return (
    <nav ref={nav} aria-label="Mode" className="relative flex gap-6">
      {MODES.map((m) => (
        <button key={m.mode} type="button" aria-current={mode === m.mode ? "page" : undefined} onClick={() => onChange(m.mode)}
                className={`pb-0.5 pt-1 text-[0.9375rem] font-medium transition-colors ${
                  mode === m.mode ? "text-ink" : "text-muted hover:text-ink"}`}>
          {m.text}
        </button>
      ))}
      {line && (
        <span aria-hidden
              className={`pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-ink ${
                line.moved ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none" : ""}`}
              style={{ width: line.width, transform: `translateX(${line.left}px)` }} />
      )}
    </nav>
  );
}

export function App() {
  // The open work is saved as it changes, so a reload brings it back
  const [mode, setMode] = usePersisted<Mode>("kallax.mode", "edit",
    (m) => (MODES.some((x) => x.mode === m) ? (m as Mode) : "edit"));
  const [spec, setSpec] = usePersisted<TraySpec>("kallax.tray", DEFAULT_SPEC, specReader(DEFAULT_SPEC));
  const [items, setItems] = usePersisted<Item[]>("kallax.items", [], (v) => (Array.isArray(v) ? (v as Item[]) : []));
  const [box, setBox] = usePersisted<BoxSpec>("kallax.box", DEFAULT_BOX, specReader(DEFAULT_BOX));

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <header className="flex flex-wrap items-center gap-x-8 border-b border-rule bg-sheet px-5">
        <h1 className="py-2.5 font-cond text-[1.75rem] font-semibold leading-none tracking-[-0.01em]">Kallax workbench</h1>
        <ModeNav mode={mode} onChange={setMode} />
        <p className="basis-full pb-2 text-[0.75rem] leading-snug text-muted md:ml-auto md:basis-auto md:pb-0 md:text-right">
          KALLAX is a trademark of Inter IKEA Systems B.V. This project is not affiliated with IKEA.
        </p>
      </header>
      {mode === "box" && <BoxEditor spec={box} setSpec={setBox} />}
      {mode === "edit" && <TrayEditor spec={spec} setSpec={setSpec} />}
      {mode === "find" && (
        <FindTray items={items} setItems={setItems}
                  onOpen={(found) => { setSpec((s) => ({ ...found, title: s.title, name: "" })); setMode("edit"); }} />
      )}
    </div>
  );
}
