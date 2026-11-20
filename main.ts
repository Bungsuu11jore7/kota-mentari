// KOTA MENTARI — entri untuk kompetisi "Make GTA 6" (make.fun gta6-01).
//
// Program penyerah (Node 22, pustaka standar saja). Tugasnya hanya
// menyalin game dan screenshot ke folder output, lalu menulis dossier
// JSON dengan memanggil fungsi pembuat dossier dari vendor.
//
// Di luar grader, folder output diambil dari environment
// MAKEFUN_OUTPUT_DIR; di dalam grader folder itu adalah /output.
// Program ini berjalan dua kali dan kedua jalan itu harus menulis
// byte yang sama persis, jadi tidak ada stempel waktu atau nilai acak
// di dalam keluaran apa pun.

import { buildDossier } from "./vendor/makefun-game.ts";
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Akar repositori: folder yang memuat berkas ini (main.ts di root).
const repoRoot = dirname(fileURLToPath(import.meta.url));

// Folder output: dari environment di luar grader, /output di grader.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Folder sumber di dalam repositori.
const gameDir = join(repoRoot, "game");
const screenshotsDir = join(repoRoot, "screenshots");

// Folder tujuan di dalam folder output.
const outputGameDir = join(outputDir, "game");
const outputScreenshotsDir = join(outputDir, "screenshots");
const dossierPath = join(outputDir, "dossier.json");

// Siapkan folder output. Salinan lama dihapus dulu supaya tidak ada
// berkas basi yang tertinggal dari jalan sebelumnya.
mkdirSync(outputDir, { recursive: true });
rmSync(outputGameDir, { recursive: true, force: true });
rmSync(outputScreenshotsDir, { recursive: true, force: true });

// Salin seluruh isi game dan screenshot ke folder output.
cpSync(gameDir, outputGameDir, { recursive: true });
cpSync(screenshotsDir, outputScreenshotsDir, { recursive: true });

// Bangun dossier dari folder output (yang memuat game/ dan screenshots/),
// lalu tulis sebagai dossier.json. Fungsi vendor mengembalikan byte
// dossier yang sudah jadi; batas teksnya 163840 byte sesuai gate.
const dossier = buildDossier(outputDir, { text_max_bytes: 163840 });
writeFileSync(dossierPath, dossier);

console.log(`KOTA MENTARI: game disalin ke ${outputGameDir}`);
console.log(`KOTA MENTARI: screenshot disalin ke ${outputScreenshotsDir}`);
console.log(`KOTA MENTARI: dossier ditulis ke ${dossierPath}`);
