// The Kallax box on the mat: a top view and a front view, side by side, at true scale.
// SVG units are millimetres. Both views stand on the same ground line, the front edge.
// The top view shows the 4 x 10 grid of cells that the trays and small boxes use.

import type { CSSProperties } from "react";
import { Mat } from "../mat";
import type { BoxInfo } from "./box";

const GRID = { cols: 4, rows: 10 };   // box-params.scad: px = in_w / 4, py = in_d / 10
const ROUND_BOTTOM = 3;               // round_bottom in kallax-box.scad
const BETWEEN = 44;                   // space between the two views

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
         `H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

const fmt = (mm: number) => (Math.round(mm * 10) / 10).toString();

function Dimension({ from, to, at, vertical, text }: { from: number; to: number; at: number; vertical?: boolean; text: string }) {
  const tick = 1.6, mid = (from + to) / 2;
  return (
    <g className="stroke-mat-ink" strokeWidth={0.35}>
      {vertical ? (
        <>
          <line x1={at} y1={from} x2={at} y2={to} />
          <line x1={at - tick} y1={from + tick} x2={at + tick} y2={from - tick} />
          <line x1={at - tick} y1={to + tick} x2={at + tick} y2={to - tick} />
        </>
      ) : (
        <>
          <line x1={from} y1={at} x2={to} y2={at} />
          <line x1={from - tick} y1={at + tick} x2={from + tick} y2={at - tick} />
          <line x1={to - tick} y1={at + tick} x2={to + tick} y2={at - tick} />
        </>
      )}
      <text x={vertical ? at : mid} y={vertical ? mid : at} dy={vertical ? 0 : -2.2}
            transform={vertical ? `rotate(-90 ${at} ${mid}) translate(0 -2.2)` : undefined}
            className="fill-mat-ink font-cond" stroke="none" fontSize={5.2} fontWeight={600} textAnchor="middle">{text}</text>
    </g>
  );
}

/** The front face: the outline with the finger cutout, and hidden lines for the floor and the inside walls. */
function frontOutline(b: BoxInfo, x0: number, ground: number) {
  const top = ground - b.height, r = ROUND_BOTTOM, cx = x0 + b.width / 2;
  const cut = b.cutoutDepth > 0
    ? (() => {
        const t = b.cutoutTop / 2, u = b.cutoutBottom / 2, low = top + b.cutoutDepth, cr = Math.min(b.cutoutR, b.cutoutDepth / 2);
        return `H ${cx + t} L ${cx + u + cr * 0.3} ${low - cr} Q ${cx + u} ${low} ${cx + u - cr} ${low} ` +
               `H ${cx - u + cr} Q ${cx - u} ${low} ${cx - u - cr * 0.3} ${low - cr} L ${cx - t} ${top} `;
      })()
    : "";
  // Start at the top left corner and go clockwise; the path draws the top edge from right to left
  return `M ${x0} ${top} V ${ground - r} Q ${x0} ${ground} ${x0 + r} ${ground} H ${x0 + b.width - r} ` +
         `Q ${x0 + b.width} ${ground} ${x0 + b.width} ${ground - r} V ${top} ${cut}Z`;
}

export function BoxCanvas({ info, stale, busy }: { info: BoxInfo; stale: boolean; busy: boolean }) {
  const W = info.width, D = info.depth, H = info.height;
  const fx = W + BETWEEN;   // left edge of the front view
  const left = -24, right = fx + W + 24, top = -24, bottom = D + 22;
  const cellW = info.innerWidth / GRID.cols, cellD = info.innerDepth / GRID.rows;
  const t = info.wall;

  return (
    <svg viewBox={`${left} ${top} ${right - left} ${bottom - top}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full"
         role="img" aria-label={`The Kallax box, ${W} by ${D} by ${H} mm, seen from the top and from the front`}>
      <Mat x={0} y={0} />

      <g opacity={stale ? 0.55 : 1} style={{ transition: "opacity 160ms" }}>
        {/* Top view. The front is at the bottom. */}
        <path d={roundedRect(0, 0, W, D, info.outerR)} className="fill-pla" filter="url(#lift)" />
        <path d={roundedRect(t, t, info.innerWidth, info.innerDepth, info.innerR)} className="fill-pla-floor" />
        {info.cutoutDepth > 0 && (
          <rect x={W / 2 - info.cutoutTop / 2} y={D - t} width={info.cutoutTop} height={t} className="fill-pla-shade" />
        )}
        <g className="stroke-ink" strokeWidth={0.25} strokeDasharray="1.2 1.2" opacity={0.35}>
          {Array.from({ length: GRID.cols - 1 }, (_, i) => (
            <line key={`c${i}`} x1={t + (i + 1) * cellW} y1={t} x2={t + (i + 1) * cellW} y2={t + info.innerDepth} />
          ))}
          {Array.from({ length: GRID.rows - 1 }, (_, i) => (
            <line key={`r${i}`} x1={t} y1={t + (i + 1) * cellD} x2={t + info.innerWidth} y2={t + (i + 1) * cellD} />
          ))}
        </g>
        <text x={W / 2} y={t + cellD / 2 + 1.4} textAnchor="middle" fontSize={3.4} className="fill-muted font-cond">
          {fmt(cellW)} × {fmt(cellD)} mm cells
        </text>

        {/* Front view, on the same ground line */}
        <path d={frontOutline(info, fx, D)} className="fill-pla" filter="url(#lift)" />
        <g className="stroke-ink" strokeWidth={0.3} strokeDasharray="1.6 1" opacity={0.4} fill="none">
          <line x1={fx + t} y1={D - info.floor} x2={fx + W - t} y2={D - info.floor} />
          <line x1={fx + t} y1={D - info.floor} x2={fx + t} y2={D - H} />
          <line x1={fx + W - t} y1={D - info.floor} x2={fx + W - t} y2={D - H} />
        </g>
      </g>

      <Dimension from={0} to={W} at={-11} text={fmt(W)} />
      <Dimension from={0} to={D} at={-11} vertical text={fmt(D)} />
      <Dimension from={fx} to={fx + W} at={D - H - 11} text={fmt(W)} />
      <Dimension from={D - H} to={D} at={fx + W + 11} vertical text={fmt(H)} />
      {info.cutoutDepth > 0 && (
        <Dimension from={fx + W / 2 - info.cutoutTop / 2} to={fx + W / 2 + info.cutoutTop / 2} at={D - H - 22}
                   text={`${fmt(info.cutoutTop)} cutout`} />
      )}
      <g className="stroke-mat-ink" strokeWidth={0.2} opacity={0.7}>
        <line x1={0} y1={-2} x2={0} y2={-13} /><line x1={W} y1={-2} x2={W} y2={-13} />
        <line x1={-2} y1={0} x2={-13} y2={0} /><line x1={-2} y1={D} x2={-13} y2={D} />
        <line x1={fx + W + 2} y1={D - H} x2={fx + W + 13} y2={D - H} /><line x1={fx + W + 2} y1={D} x2={fx + W + 13} y2={D} />
      </g>

      <text x={0} y={D + 10} fontSize={4} fontWeight={500} className="fill-mat-ink font-cond" opacity={0.85}>
        Top, with the tray grid. The front is at the bottom.
      </text>
      <text x={fx} y={D + 10} fontSize={4} fontWeight={500} className="fill-mat-ink font-cond" opacity={0.85}>
        Front. Dashed lines show the floor and the inside walls.
      </text>

      {busy && (
        <g className="nozzle" style={{ "--travel": `${D}px` } as CSSProperties}>
          <line x1={-6} y1={0} x2={fx + W + 6} y2={0} className="stroke-signal" strokeWidth={0.7} />
          <circle cx={fx + W + 6} cy={0} r={1.6} className="fill-signal" />
        </g>
      )}
    </svg>
  );
}
