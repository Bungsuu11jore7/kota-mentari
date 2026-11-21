# KOTA MENTARI

[![make.fun](https://img.shields.io/badge/make.fun-gta6--01-blue)](https://make.fun/c/gta6-01)
[![Prize $1,666](https://img.shields.io/badge/prize-%241%2C666-gold)](https://make.fun/c/gta6-01)
[![Open World](https://img.shields.io/badge/open--world-3D%20crime-green)](https://make.fun/c/gta6-01)

**KOTA MENTARI** — game open-world crime 3D yang berjalan offline di browser desktop,
dibangun untuk bounty [gta6-01 di make.fun](https://make.fun/c/gta6-01) (total hadiah $1.666,
100 tempat berbayar, deadline 24 November 2026).

Raka Pratama, 28 tahun, kurir paket di kota pesisir tropis fiktif Kota Mentari.
Satu paket terakhir mengubah segalanya: Bos Darma dan Geng Ombak memburu Mira Santosa,
dan hanya Raka yang bisa membawanya pulang.

## Yang ada di dalam game

- Kota pesisir tropis dengan 5 distrik: Pelabuhan, Pasar Lama, Menara, Pesisir, Bukit
- Jalan kaki dan mengemudi, curi mobil, traffic 28 mobil + 45 pejalan kaki
- Sistem wanted 0–5 bintang dengan polisi yang merespons, roadblock, dan BUSTED
- 6 misi berurutan dengan cerita, hadiah kumulatif $500 → $29.700
- Combat: pukul (F) dan tembak (klik mouse), senjata tinju + pistol
- HUD lengkap: nyawa, uang, senjata, bintang wanted, kecepatan, minimap, kotak misi, toast
- Save/load via localStorage, audio WebAudio, musik latar
- Layar mulai / jeda / TAMAT / BUSTED

## Kontrol

| Tombol | Aksi |
| --- | --- |
| WASD | Jalan / mengemudi |
| Shift | Lari |
| E | Masuk / keluar / curi mobil |
| Space | Rem tangan |
| F | Pukul |
| Klik mouse | Tembak |
| 1 / 2 | Tinju / pistol |
| P / Esc | Jeda |
| M | Bisu |
| Enter | Mulai dari layar awal |

## Mainkan

```sh
node serve.ts
# buka http://localhost:8080
```

Game murni file statis di `game/` — tanpa build step, tanpa request jaringan.
`main.ts` (Node 22) menyalin `game/` + `screenshots/` ke folder output dan
menulis `dossier.json` lewat `buildDossier` dari `vendor/makefun-game.ts`.

## Lisensi

MIT — lihat [LICENSE](LICENSE).
