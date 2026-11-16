// The printer and filaments. These match common.py in the Python tools.

import type { Filament } from "./bambu3mf";

export const BED = 256;   // P1S bed, mm
export const PRINTER = "Bambu Lab P1S 0.4 nozzle";
export const BODY_FILAMENT: Filament = { settingsId: "Bambu PLA Matte @BBL P1S 0.4 nozzle", colour: "#FFFFFF" };
export const TEXT_FILAMENT: Filament = { settingsId: "Bambu PLA Matte @BBL P1S 0.4 nozzle", colour: "#000000" };

/** Give the browser a file to save. */
export function download(name: string, data: Uint8Array) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([data as BlobPart], { type: "model/3mf" }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
