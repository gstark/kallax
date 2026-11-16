// The cutting mat under every drawing: a 10 mm grid with a stronger line every 50 mm.
// The grid starts at (x, y), so a part placed there lines up with the lines.

export function Mat({ x, y }: { x: number; y: number }) {
  return (
    <>
      <defs>
        <pattern id="mat-10" width={10} height={10} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d="M 10 0 L 0 0 0 10" fill="none" className="stroke-mat-line" strokeWidth={0.3} />
        </pattern>
        <pattern id="mat-50" width={50} height={50} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d="M 50 0 L 0 0 0 50" fill="none" className="stroke-mat-major" strokeWidth={0.45} />
        </pattern>
        <filter id="lift" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx={0.8} dy={1.4} stdDeviation={1.1} floodColor="#0d2a21" floodOpacity={0.45} />
        </filter>
      </defs>
      {/* The mat runs past the view in every direction */}
      <rect x={-4000} y={-4000} width={8000} height={8000} className="fill-mat" />
      <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#mat-10)" />
      <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#mat-50)" />
    </>
  );
}
