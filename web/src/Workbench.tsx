// The layout under the page header: the mat, the side panel, and the status bar.
// On a phone, the mat comes first and the panel scrolls below it.

import type { ReactNode } from "react";

export function Workbench({ mat, panel, status, busy = false }: {
  mat: ReactNode;
  panel: ReactNode;
  status: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[21rem_1fr] lg:grid-rows-[1fr_auto]">
      <main className="relative h-[60svh] min-h-80 shrink-0 bg-mat lg:col-start-2 lg:row-start-1 lg:h-auto lg:min-h-0" aria-busy={busy}>
        {mat}
      </main>
      <aside className="flex-1 border-rule bg-paper lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:border-r">
        {panel}
      </aside>
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule bg-sheet px-5 py-3 lg:static lg:col-span-2">
        {status}
      </footer>
    </div>
  );
}
