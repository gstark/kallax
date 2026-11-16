// The page layout: the header, the mat, the side panel, and the status bar.
// On a phone, the mat comes first and the panel scrolls below it.

import type { ReactNode } from "react";

export function Workbench({ nav, mat, panel, status, busy = false }: {
  nav: ReactNode;
  mat: ReactNode;
  panel: ReactNode;
  status: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[21rem_1fr] lg:grid-rows-[auto_1fr_auto]">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-sheet px-5 py-2.5 lg:col-span-2">
        <h1 className="font-cond text-[1.75rem] font-semibold leading-none tracking-[-0.01em]">Kallas workbench</h1>
        {nav}
      </header>
      <main className="relative h-[60svh] min-h-80 shrink-0 bg-mat lg:col-start-2 lg:row-start-2 lg:h-auto lg:min-h-0" aria-busy={busy}>
        {mat}
      </main>
      <aside className="flex-1 border-rule bg-paper lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto lg:border-r">
        {panel}
      </aside>
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule bg-sheet px-5 py-3 lg:static lg:col-span-2">
        {status}
      </footer>
    </div>
  );
}
