// Kota Mentari — entri gta6-01 "Make GTA 6" (Node 22, standard library only).
// Game open-world crime 3D orisinal (three.js, vendored di game/vendor/):
// kota pesisir tropis fiktif Kota Mentari, 6 misi cerita Raka Pratama,
// mengemudi, polisi wanted 0-5 bintang, combat Geng Ombak, traffic,
// HUD + minimap, suara sintetis WebAudio — semua offline, tanpa network.
// Program ini menyalin game/ dan screenshots/ dari sebelah file ini ke
// /output (atau MAKEFUN_OUTPUT_DIR di luar container grader) lalu menulis
// /output/dossier.json, ringkasan yang dibaca judge, via library make.fun
// yang di-vendor (vendor/makefun-game.ts, jangan diubah).
//
// Serve lokal: `node serve.ts`, lalu buka http://localhost:8080.
// Di luar container grader, MAKEFUN_OUTPUT_DIR menggantikan /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Direktori repo ini (di sebelah main.ts) dan direktori keluaran grader.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Siapkan keluaran, lalu salin seluruh game dan semua screenshot asli.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Cap scorer (reference/gate.json): hanya text_max_bytes yang membentuk
// byte dossier; cap lain menolak entri yang scorer akan tolak (lebih dari
// 4 screenshot atau satu di atas 256 KiB; lebih dari 993 file di game/ atau
// 48 MiB total, atau path di bawah game/ di atas 1000 byte: game/ dihitung
// di samping cap 1000 entri /output itu sendiri, bersama screenshots/ dan
// dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
