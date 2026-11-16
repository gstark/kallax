// The items, laid out at true size on the mat, seen from the top.
// The item that the questions are about has a yellow outline.

import { Mat } from "../mat";
import { LETTERS, type Item } from "./fit";

const GAP = 12;        // between items, mm
const ROW_WIDTH = 246; // wrap at the length of the Kallax box interior
const LABEL = 14;      // room under each item for its name

interface Box {
  item: Item;
  letter: string;
  draft: boolean;
  x: number;
  y: number;
  w: number;
  l: number;
}

function layout(items: Item[], draft: Item | null): { boxes: Box[]; width: number; height: number } {
  const all = draft ? [...items, draft] : items;
  const boxes: Box[] = [];
  let x = 0, y = 0, rowHeight = 0, width = 0;
  all.forEach((item, i) => {
    // Lie flat on the largest face, long side across
    const [w, l] = [Math.max(item.w, item.l), Math.min(item.w, item.l)];
    if (x > 0 && x + w > ROW_WIDTH) {
      x = 0;
      y += rowHeight + LABEL + GAP;
      rowHeight = 0;
    }
    boxes.push({ item, letter: LETTERS[i] ?? "?", draft: Boolean(draft) && i === all.length - 1, x, y, w, l });
    x += Math.max(w, 30) + GAP;
    width = Math.max(width, x - GAP);
    rowHeight = Math.max(rowHeight, l);
  });
  return { boxes, width, height: y + rowHeight + LABEL };
}

export function ItemsMat({ items, draft }: { items: Item[]; draft: Item | null }) {
  const { boxes, width, height } = layout(items, draft);
  const margin = 24;
  const viewW = Math.max(width, 160) + 2 * margin, viewH = Math.max(height, 110) + 2 * margin;
  const x0 = (width - viewW) / 2, y0 = (height - viewH) / 2;

  return (
    <svg viewBox={`${x0} ${y0} ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full"
         role="img" aria-label={`${items.length} ${items.length === 1 ? "item" : "items"} at true size on the mat`}>
      <Mat x={0} y={0} />
      {boxes.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={6} className="fill-mat-ink font-cond">
          Your items appear here at true size.
        </text>
      )}
      {boxes.map((b) => {
        const size = Math.max(4, Math.min(12, b.w / 3, b.l / 2));
        const count = b.item.loose ? `${b.item.count}, loose` : b.item.count > 1 ? `× ${b.item.count}` : "";
        return (
          <g key={`${b.letter}-${b.draft}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.l} rx={1.5} filter="url(#lift)"
                  className={b.draft ? "fill-signal-wash stroke-signal" : "fill-pla stroke-pla-shade"} strokeWidth={b.draft ? 0.8 : 0.4} />
            {b.item.loose && b.item.count > 1 && (
              <rect x={b.x + 2.5} y={b.y - 2.5} width={b.w} height={b.l} rx={1.5} fill="none"
                    className="stroke-mat-ink" strokeWidth={0.35} strokeDasharray="1.6 1.2" opacity={0.7} />
            )}
            <text x={b.x + b.w / 2} y={b.y + b.l / 2 + size * 0.35} textAnchor="middle" fontSize={size} fontWeight={600}
                  className="fill-ink font-cond">{b.letter}</text>
            <text x={b.x} y={b.y + b.l + 5.5} fontSize={4.2} fontWeight={600} className="fill-mat-ink font-cond">
              {b.item.name || "No name"} {count && <tspan fontWeight={500} opacity={0.8}>{count}</tspan>}
            </text>
            <text x={b.x} y={b.y + b.l + 10.5} fontSize={3.4} className="fill-mat-ink font-cond" opacity={0.75}>
              {b.item.w} × {b.item.l} × {b.item.h} mm
            </text>
          </g>
        );
      })}
    </svg>
  );
}
