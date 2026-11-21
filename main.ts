// Make GTA 6 — KOTA MENTARI entry program (Node 22, erasable TypeScript).
// Copies game/ and screenshots/ to the output folder and writes dossier.json
// with buildDossier from the kit vendor library (vendor/makefun-game.ts).
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDossier } from "./vendor/makefun-game.ts";

const outDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(outDir, { recursive: true });
cpSync("game", join(outDir, "game"), { recursive: true });
cpSync("screenshots", join(outDir, "screenshots"), { recursive: true });
const dossier: Uint8Array = buildDossier(outDir, { text_max_bytes: 163840 });
writeFileSync(join(outDir, "dossier.json"), dossier);
console.log("KOTA MENTARI dossier written to " + join(outDir, "dossier.json"));
