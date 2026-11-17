// Lazy components that survive a short server fault. GitHub Pages can answer a chunk
// request with a 503 now and then, and a single failed import would break the view.

import { Component, lazy, type ComponentType, type ReactNode } from "react";

const delays = [500, 1500, 4000];

/** Like React's `lazy`, but tries the import again after a failure before it gives up. */
export function lazyRetry<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(async () => {
    for (const delay of delays) {
      try {
        return await load();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return load();
  });
}

/** Shows `fallback` in place of children that failed to load or render. */
export class LoadBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
