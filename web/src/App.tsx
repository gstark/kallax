// The page: the Kallas box, and the trays that go in it. "Find a tray" loads its result into the tray editor.

import { useState } from "react";
import { DEFAULT_BOX, type BoxSpec } from "./box/box";
import { BoxEditor } from "./box/BoxEditor";
import type { Item } from "./fit/fit";
import { FindTray } from "./fit/FindTray";
import { DEFAULT_SPEC, type TraySpec } from "./tray/tray";
import { TrayEditor } from "./tray/TrayEditor";

type Mode = "box" | "edit" | "find";

const MODES: { mode: Mode; text: string }[] = [
  { mode: "box", text: "Box" },
  { mode: "edit", text: "Edit a tray" },
  { mode: "find", text: "Find a tray for my items" },
];

export function App() {
  const [mode, setMode] = useState<Mode>("edit");
  const [spec, setSpec] = useState<TraySpec>(DEFAULT_SPEC);
  const [items, setItems] = useState<Item[]>([]);
  const [box, setBox] = useState<BoxSpec>(DEFAULT_BOX);

  const nav = (
    <nav aria-label="Mode" className="flex gap-1">
      {MODES.map((m) => (
        <button key={m.mode} type="button" aria-current={mode === m.mode ? "page" : undefined} onClick={() => setMode(m.mode)}
                className={`rounded-md px-3 py-1.5 text-[0.9375rem] font-medium transition-colors ${
                  mode === m.mode ? "bg-ink text-sheet" : "text-muted hover:bg-paper hover:text-ink"}`}>
          {m.text}
        </button>
      ))}
    </nav>
  );

  if (mode === "box") return <BoxEditor spec={box} setSpec={setBox} nav={nav} />;
  return mode === "edit"
    ? <TrayEditor spec={spec} setSpec={setSpec} nav={nav} />
    : <FindTray items={items} setItems={setItems} nav={nav}
                onOpen={(found) => { setSpec((s) => ({ ...found, title: s.title, name: "" })); setMode("edit"); }} />;
}
