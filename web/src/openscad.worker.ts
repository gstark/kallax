/// <reference lib="webworker" />
// Runs OpenSCAD for WebAssembly. One worker runs one job at a time.
// OpenSCAD can run its main function only once, so each job gets a new instance.
// The compiled WASM module, BOSL2, and the font load once for each worker.

import { unzipSync } from "fflate";

export interface Job {
  id: number;
  file: string;                       // a .scad file name in the repo root
  defines: Record<string, string>;    // -D name=value, value in OpenSCAD syntax
  output: "stl" | "echo";
}

export interface JobResult {
  id: number;
  ok: boolean;
  data?: Uint8Array;                  // the STL, or the echo text
  log: string;
  ms: { setup: number; run: number };
}

interface Instance {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
  callMain(args: string[]): number;
}

type Factory = (options: object) => Promise<Instance>;

// The models, as text, from the repo root
const SOURCES = import.meta.glob("../../*.scad", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

let ready: Promise<{ factory: Factory; wasm: WebAssembly.Module; bosl2: Record<string, Uint8Array>; font: Uint8Array }> | null = null;

function load() {
  ready ??= (async () => {
    const base = new URL("/", self.location.href);
    const [mod, wasm, bosl2, font] = await Promise.all([
      import(/* @vite-ignore */ new URL("openscad/openscad.js", base).href),
      WebAssembly.compileStreaming(fetch(new URL("openscad/openscad.wasm", base))),
      fetch(new URL("BOSL2.zip", base)).then((r) => r.arrayBuffer()).then((b) => unzipSync(new Uint8Array(b))),
      fetch(new URL("fonts/LiberationSans-Bold.ttf", base)).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
    ]);
    return { factory: mod.default as Factory, wasm, bosl2, font };
  })();
  return ready;
}

async function run(job: Job): Promise<JobResult> {
  const t0 = performance.now();
  const { factory, wasm, bosl2, font } = await load();
  const log: string[] = [];
  const instance = await factory({
    noInitialRun: true,
    print: (text: string) => log.push(text),
    printErr: (text: string) => log.push(text),
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
      WebAssembly.instantiate(wasm, imports).then((i) => done(i, wasm));
      return {};
    },
  });
  const fs = instance.FS;
  for (const dir of ["/src", "/libraries", "/libraries/BOSL2", "/fonts"]) fs.mkdir(dir);
  for (const [path, text] of Object.entries(SOURCES)) fs.writeFile(`/src/${path.split("/").pop()}`, text);
  for (const [name, data] of Object.entries(bosl2)) fs.writeFile(`/libraries/BOSL2/${name.replace(/^\.\//, "")}`, data);
  fs.writeFile("/fonts/LiberationSans-Bold.ttf", font);
  instance.ENV.OPENSCADPATH = "/libraries";
  const t1 = performance.now();

  const out = job.output === "stl" ? "/out.stl" : "/out.echo";
  const args = [`/src/${job.file}`, "-o", out];
  if (job.output === "stl") args.push("--export-format", "binstl");
  for (const [name, value] of Object.entries(job.defines)) args.push("-D", `${name}=${value}`);
  let code = 1;
  try {
    code = instance.callMain(args);
  } catch (error) {
    log.push(String(error));
  }
  let data: Uint8Array | undefined;
  try {
    data = fs.readFile(out);
  } catch {
    // no output: the log has the reason
  }
  const t2 = performance.now();
  return { id: job.id, ok: code === 0 && data !== undefined, data, log: log.join("\n"), ms: { setup: t1 - t0, run: t2 - t1 } };
}

self.onmessage = async (event: MessageEvent<Job>) => {
  const result = await run(event.data);
  self.postMessage(result, result.data ? [result.data.buffer] : []);
};
