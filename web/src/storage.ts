// Work that survives a reload: the open designs, and the list of saved ones.
// It lives in this browser's localStorage. Storage can be full or blocked; then the app works without it.

import { useCallback, useEffect, useState } from "react";

function load<T>(key: string, fallback: T, read: (stored: unknown) => T): T {
  try {
    const text = localStorage.getItem(key);
    return text === null ? fallback : read(JSON.parse(text));
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The value stays in memory only.
  }
}

/** Like useState, but the value is written to localStorage after each change and read back on load. */
export function usePersisted<T>(key: string, initial: T, read: (stored: unknown) => T) {
  const [value, setValue] = useState<T>(() => load(key, initial, read));
  useEffect(() => store(key, value), [key, value]);
  return [value, setValue] as const;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a stored spec. Fields that a newer version added get their defaults. */
export const specReader = <S extends object>(defaults: S) => (stored: unknown): S =>
  isObject(stored) ? { ...defaults, ...stored } : defaults;

export interface Saved<S> {
  name: string;    // the 3MF file name, without .3mf. Two different designs can have the same name.
  spec: S;
  saved: number;   // ms since 1970
}

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/** The saved designs of one kind, newest first. A save adds a new entry, unless the same design is in the list. */
export function useSaved<S extends object>(key: string, defaults: S) {
  const read = (stored: unknown): Saved<S>[] =>
    Array.isArray(stored)
      ? stored.filter(isObject).filter((e) => typeof e.name === "string" && isObject(e.spec))
          .map((e) => ({ name: e.name as string, spec: { ...defaults, ...(e.spec as object) }, saved: Number(e.saved) || 0 }))
      : [];
  const [list, setList] = usePersisted<Saved<S>[]>(key, [], read);

  const save = useCallback((name: string, spec: S) =>
    setList((l) => [{ name, spec, saved: Date.now() }, ...l.filter((e) => !same(e.spec, spec))]), [setList]);
  const remove = useCallback((entry: Saved<S>) => setList((l) => l.filter((e) => e !== entry)), [setList]);
  const has = (spec: S) => list.some((e) => same(e.spec, spec));

  return { list, save, remove, has };
}
