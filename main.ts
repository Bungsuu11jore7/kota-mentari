// Make GTA 6 — program entri untuk game "KOTA MENTARI".
// Menyalin game/ dan screenshots/ ke folder output, lalu menulis
// dossier.json dengan buildDossier dari vendor/makefun-game.ts.
// Berjalan dua kali menghasilkan byte dossier yang identik.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const gameDir = join(repoRoot, "game");
const screenshotsDir = join(repoRoot, "screenshots");

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, "game"), { recursive: true });
if (existsSync(screenshotsDir)) {
  cpSync(screenshotsDir, join(outputDir, "screenshots"), { recursive: true });
}

const dossier = buildDossier(repoRoot, { text_max_bytes: 163840 });
writeFileSync(join(outputDir, "dossier.json"), dossier);
console.log("dossier written: " + join(outputDir, "dossier.json"));
