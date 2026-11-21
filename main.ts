// KOTA MENTARI — program entri untuk kompetisi "Make GTA 6" (make.fun).
// Menyalin game/ + screenshots/ ke folder output, lalu menulis dossier.json
// memakai buildDossier dari vendor (vendor tidak diubah).
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

await mkdir(outDir, { recursive: true });
await cp(join(repoRoot, "game"), join(outDir, "game"), { recursive: true });
await cp(join(repoRoot, "screenshots"), join(outDir, "screenshots"), {
  recursive: true,
});

const dossier = buildDossier(outDir, { text_max_bytes: 163840 });
await writeFile(join(outDir, "dossier.json"), dossier);
