// The tray, seen from the top, at true scale on a cutting mat with a 10 mm grid.
// SVG units are millimetres. Tray coordinates have the origin at the centre and
// +y toward the back. SVG y goes down, so the back is at the top of the drawing.

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Mat } from "../mat";
import { compAt, isFree, key, type Block, type Comp, type TrayInfo, type TraySpec } from "./tray";

export type Unit = [number, number];   // col, row

/** An item drawn at true size in a compartment, for the fit results. */
export interface Mark {
  block: Block;
  letter: string;
  w: number;
  l: number;
  note?: string;   // for example "50, loose"
}

interface Props {
  spec: TraySpec;
  info: TrayInfo;
  cursor?: Unit;
  selection?: Block;
  selecting?: boolean; // the user is extending a selection of units
  stale?: boolean;     // the model has not answered for the newest spec yet
  busy?: boolean;      // a render is running
  marks?: Mark[];
  label?: string;      // the accessible name when the drawing is for looking only
  onPick?(unit: Unit, extend: boolean): void;
  onKey?(event: KeyboardEvent<SVGSVGElement>): void;
}

const MARGIN = 26;        // room on the mat for the dimension lines
const OUTLINE_R = 3.5;    // r_vert in box-params.scad
const FLOOR_R = 4;        // r_cell in parts-tray.scad

type Box = { x: number; y: number; w: number; h: number };

/** The rectangle of a compartment, in SVG coordinates, from its position in the model. */
const compRect = (c: Comp): Box => ({ x: c.x0, y: -(c.y0 + c.length), w: c.width, h: c.length });

/** The rectangle of grid units, in SVG coordinates. In a free layout, the rectangle of the compartment. */
function blockRect(spec: TraySpec, info: TrayInfo, b: Block): Box {
  const comp = compAt(info, b.col, b.row);
  if (isFree(spec) || (comp && comp.col === b.col && comp.row === b.row && comp.cols === b.cols && comp.rows === b.rows)) {
    return comp ? compRect(comp) : { x: 0, y: 0, w: 0, h: 0 };
  }
  const x = -info.width / 2 + info.wall + b.col * (info.unitW + info.divider);
  const front = -info.length / 2 + info.wall + b.row * (info.unitL + info.divider);
  return { x, y: -(front + b.rows * (info.unitL + info.divider) - info.divider),
           w: b.cols * info.unitW + (b.cols - 1) * info.divider, h: b.rows * info.unitL + (b.rows - 1) * info.divider };
}

/** The tray outline with a finger pocket cut into the front and into the back. */
function outline(info: TrayInfo) {
  const w = info.width / 2, d = info.length / 2, r = OUTLINE_R;
  const p = info.pocket / 2, pd = info.pocketDepth;
  // The pocket at the front end (SVG y = d), drawn from +x to -x
  const front = p > 0
    ? `L ${p + 1} ${d} Q ${p} ${d} ${p} ${d - 1} L ${p} ${d - pd + 3} Q ${p} ${d - pd} ${p - 3} ${d - pd} ` +
      `L ${-p + 3} ${d - pd} Q ${-p} ${d - pd} ${-p} ${d - pd + 3} L ${-p} ${d - 1} Q ${-p} ${d} ${-p - 1} ${d} `
    : "";
  // The pocket at the back end (SVG y = -d), drawn from -x to +x
  const back = p > 0
    ? `L ${-p - 1} ${-d} Q ${-p} ${-d} ${-p} ${-d + 1} L ${-p} ${-d + pd - 3} Q ${-p} ${-d + pd} ${-p + 3} ${-d + pd} ` +
      `L ${p - 3} ${-d + pd} Q ${p} ${-d + pd} ${p} ${-d + pd - 3} L ${p} ${-d + 1} Q ${p} ${-d} ${p + 1} ${-d} `
    : "";
  return `M ${-w + r} ${-d} ${back}L ${w - r} ${-d} Q ${w} ${-d} ${w} ${-d + r} L ${w} ${d - r} Q ${w} ${d} ${w - r} ${d} ` +
         `${front}L ${-w + r} ${d} Q ${-w} ${d} ${-w} ${d - r} L ${-w} ${-d + r} Q ${-w} ${-d} ${-w + r} ${-d} Z`;
}

const fmt = (mm: number) => (Math.round(mm * 10) / 10).toString();

function Dimension({ from, to, at, vertical, text }: { from: number; to: number; at: number; vertical?: boolean; text: string }) {
  // Drafting style: extension lines, a dimension line with slash ticks, and the number on the line
  const tick = 1.6;
  const mid = (from + to) / 2;
  const line = vertical
    ? <>
        <line x1={at} y1={from} x2={at} y2={to} />
        <line x1={at - tick} y1={from + tick} x2={at + tick} y2={from - tick} />
        <line x1={at - tick} y1={to + tick} x2={at + tick} y2={to - tick} />
      </>
    : <>
        <line x1={from} y1={at} x2={to} y2={at} />
        <line x1={from - tick} y1={at + tick} x2={from + tick} y2={at - tick} />
        <line x1={to - tick} y1={at + tick} x2={to + tick} y2={at - tick} />
      </>;
  return (
    <g className="stroke-mat-ink" strokeWidth={0.35}>
      {line}
      <text x={vertical ? at : mid} y={vertical ? mid : at} dy={vertical ? 0 : -2.2}
            transform={vertical ? `rotate(-90 ${at} ${mid}) translate(0 -2.2)` : undefined}
            className="fill-mat-ink font-cond" stroke="none" fontSize={5.2} fontWeight={600} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function CompLabel({ comp, rect, label, selected }: { comp: Comp; rect: Box; label?: string; selected: boolean }) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const size = Math.max(2.4, Math.min(5, rect.w / 5.5, rect.h / 4));
  const small = Math.max(1.8, Math.min(3, rect.w / 9));
  if (!comp.usable) return null;
  return (
    <g className="font-cond" textAnchor="middle" pointerEvents="none">
      {label && (
        <text x={cx} y={cy - small * 0.3} fontSize={size} fontWeight={600} className="fill-ink">{label}</text>
      )}
      {rect.w > 9 && (
        <text x={cx} y={label ? cy + size * 0.9 : cy + small * 0.35} fontSize={small} fontWeight={500}
              className={selected ? "fill-ink" : "fill-muted"}>
          {fmt(comp.width)} × {fmt(comp.length)}
        </text>
      )}
    </g>
  );
}

/**
 * An item outline, centred in its compartment, turned to fit the compartment the long way.
 * Loose items fill the compartment as a pile.
 */
function ItemMark({ mark, rect }: { mark: Mark; rect: Box }) {
  if (mark.note) {
    const size = Math.max(4, Math.min(12, rect.w / 3, rect.h / 4));
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    return (
      <g pointerEvents="none">
        <rect x={rect.x + 2} y={rect.y + 2} width={rect.w - 4} height={rect.h - 4} rx={3} fill="url(#pile)" />
        <rect x={cx - size * 1.6} y={cy - size * 0.95} width={size * 3.2} height={size * 1.9} rx={1.5} className="fill-pla-floor" />
        <text x={cx} y={cy + size * 0.12} fontSize={size} fontWeight={600} textAnchor="middle" className="fill-ink font-cond">
          {mark.letter}
        </text>
        <text x={cx} y={cy + size * 0.68} fontSize={Math.max(2.2, size / 2.6)} textAnchor="middle" className="fill-muted font-cond">
          {mark.note}
        </text>
      </g>
    );
  }
  const along = (mark.l >= mark.w) === (rect.h >= rect.w);
  const w = Math.min(along ? mark.w : mark.l, rect.w - 1), h = Math.min(along ? mark.l : mark.w, rect.h - 1);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const size = Math.max(3, Math.min(9, w / 2.2, h / 2.2));
  return (
    <g pointerEvents="none">
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={1.2} className="fill-ink/10 stroke-ink" strokeWidth={0.45}
            strokeDasharray={mark.note ? "1.4 1" : undefined} />
      <text x={cx} y={cy + size * 0.35} fontSize={size} fontWeight={600} textAnchor="middle" className="fill-ink font-cond">
        {mark.letter}
      </text>
      {mark.note && h > size * 2.6 && (
        <text x={cx} y={cy + size * 1.25} fontSize={Math.max(2.2, size / 2.4)} textAnchor="middle" className="fill-muted font-cond">
          {mark.note}
        </text>
      )}
    </g>
  );
}

export function TrayCanvas({ spec, info, cursor = [0, 0], selection, selecting = false, stale = false, busy = false,
                             marks, label, onPick, onKey }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Unit | null>(null);
  const W = info.width, D = info.length;

  const unitAt = (event: PointerEvent): Unit | null => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (isFree(spec)) {
      // The compartment under the pointer
      const comp = info.comps.find((c) => { const r = compRect(c); return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; });
      return comp ? [comp.col, comp.row] : null;
    }
    const col = Math.floor((p.x + W / 2 - info.wall) / (info.unitW + info.divider));
    const row = Math.floor((-p.y + D / 2 - info.wall) / (info.unitL + info.divider));
    if (p.x < -W / 2 || p.x > W / 2 || p.y < -D / 2 || p.y > D / 2) return null;
    return [Math.min(Math.max(col, 0), spec.cols - 1), Math.min(Math.max(row, 0), spec.rows - 1)];
  };

  const interactive = Boolean(onPick);
  const sel = selection ? blockRect(spec, info, selection) : null;
  const cur = blockRect(spec, info, { col: cursor[0], row: cursor[1], cols: 1, rows: 1 });
  const inSelection = (c: Comp) => Boolean(selection) && interactive &&
    c.col >= selection!.col && c.col + c.cols <= selection!.col + selection!.cols &&
    c.row >= selection!.row && c.row + c.rows <= selection!.row + selection!.rows;
  const many = selecting && Boolean(selection) && selection!.cols * selection!.rows > 1;

  return (
    <svg
      ref={svg}
      viewBox={`${-W / 2 - MARGIN} ${-D / 2 - MARGIN} ${W + 2 * MARGIN} ${D + 2 * MARGIN}`}
      preserveAspectRatio="xMidYMid meet"
      className={`h-full w-full select-none outline-none focus-visible:[&_.focus-ring]:opacity-100 ${interactive ? "touch-none" : ""}`}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "application" : "img"}
      aria-label={interactive
        ? isFree(spec) ? "Tray compartments in a free layout, seen from the top. Arrow keys move. Enter edits the label."
          : "Tray compartments, seen from the top. Arrow keys move. Shift and an arrow key select units. M merges, S splits, Enter edits the label."
        : label}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        const unit = onPick && unitAt(e);
        if (!unit) return;
        svg.current?.setPointerCapture(e.pointerId);
        drag.current = e.shiftKey ? cursor : unit;
        onPick!(unit, e.shiftKey);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !onPick) return;
        const unit = unitAt(e);
        if (unit && (unit[0] !== cursor[0] || unit[1] !== cursor[1])) onPick(unit, true);
      }}
      onPointerUp={() => { drag.current = null; }}
    >
      <Mat x={-W / 2} y={-D / 2} />
      <defs>
        <pattern id="pile" width={7} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
          <rect x={0.6} y={0.8} width={2.6} height={3.6} rx={0.6} className="fill-ink/15" />
          <rect x={4} y={3.2} width={2.4} height={2.2} rx={0.6} className="fill-ink/10" />
        </pattern>
        <pattern id="solid" width={2.2} height={2.2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={2.2} className="stroke-pla-shade" strokeWidth={0.6} />
        </pattern>
      </defs>

      <Dimension from={-W / 2} to={W / 2} at={-D / 2 - 11} text={fmt(W)} />
      <Dimension from={-D / 2} to={D / 2} at={W / 2 + 11} vertical text={fmt(D)} />
      <g className="stroke-mat-ink" strokeWidth={0.2} opacity={0.7}>
        <line x1={-W / 2} y1={-D / 2 - 2} x2={-W / 2} y2={-D / 2 - 13} />
        <line x1={W / 2} y1={-D / 2 - 2} x2={W / 2} y2={-D / 2 - 13} />
        <line x1={W / 2 + 2} y1={-D / 2} x2={W / 2 + 13} y2={-D / 2} />
        <line x1={W / 2 + 2} y1={D / 2} x2={W / 2 + 13} y2={D / 2} />
      </g>

      <g opacity={stale ? 0.55 : 1} style={{ transition: "opacity 160ms" }}>
        <path d={outline(info)} className="fill-pla" filter="url(#lift)" />
        {info.comps.map((c) => {
          const r = compRect(c);
          const round = Math.min(FLOOR_R, r.w / 2 - 0.1, r.h / 2 - 0.1);
          const chosen = inSelection(c) && !stale;
          return (
            <g key={key(c.col, c.row)}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={round}
                    className={c.usable ? (chosen ? "fill-signal-wash" : "fill-pla-floor") : "fill-pla"}
                    fill={c.usable ? undefined : "url(#solid)"} />
              {c.guided && (
                <rect x={r.x + r.w / 2 - 11.5} y={r.y} width={23} height={2.3} rx={1}
                      className="fill-pla-shade" />
              )}
              {!marks && <CompLabel comp={c} rect={r} label={spec.labels[key(c.col, c.row)]} selected={chosen} />}
            </g>
          );
        })}
        {marks?.map((m, i) => <ItemMark key={i} mark={m} rect={blockRect(spec, info, m.block)} />)}
        {!stale && sel && interactive && (
          <>
            <rect x={sel.x - 0.6} y={sel.y - 0.6} width={sel.w + 1.2} height={sel.h + 1.2} rx={FLOOR_R}
                  fill="none" className="stroke-signal" strokeWidth={many ? 1.1 : 0.9} />
            {many && (
              <rect x={cur.x + 1.2} y={cur.y + 1.2} width={cur.w - 2.4} height={cur.h - 2.4} rx={2.5}
                    fill="none" className="stroke-signal" strokeWidth={0.5} strokeDasharray="1.6 1.2" />
            )}
          </>
        )}
        <rect x={-W / 2 - 4} y={-D / 2 - 4} width={W + 8} height={D + 8} rx={6} fill="none"
              className="focus-ring stroke-signal opacity-0" strokeWidth={0.6} strokeDasharray="2 1.5" />
      </g>

      {busy && (
        <g className="nozzle" style={{ "--travel": `${D}px` } as CSSProperties}>
          <line x1={-W / 2 - 6} y1={-D / 2} x2={W / 2 + 6} y2={-D / 2} className="stroke-signal" strokeWidth={0.7} />
          <circle cx={W / 2 + 6} cy={-D / 2} r={1.6} className="fill-signal" />
        </g>
      )}

      <text x={-W / 2} y={D / 2 + 10} className="fill-mat-ink font-cond" fontSize={4} fontWeight={500} opacity={0.8}>
        Front{info.pocket ? ", with a finger pocket at each end" : ""}
      </text>
    </svg>
  );
}
