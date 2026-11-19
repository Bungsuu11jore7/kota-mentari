# Kota Mentari — Make GTA 6

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Bungsuu11jore7/kota-mentari/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Bungsuu11jore7/kota-mentari/reward.svg)](https://make.fun/bounty/gta6-01)

**Kota Mentari** adalah game open-world crime 3D orisinal di kota pesisir tropis fiktif **Kota Mentari** — matahari terbenam, laut, dan palm di mana-mana. Kamu bermain sebagai **Raka Pratama** (28), kurir biasa yang menerima paket yang salah. Bos **Darma** menginginkan paket itu kembali, **Geng Ombak** menginginkan Raka mati, dan **Mira Santosa**, satu-satunya orang yang masih percaya padanya, menunggu di ujung kota.

Kota ini hidup: lima distrik (**Menara**, **Pasar Lama**, **Bukit**, **Pesisir**, **Pelabuhan**), jalanan dengan traffic dan pejalan kaki, polisi dengan sistem wanted 0–5 bintang yang mengejar, menabrak, dan menangkapmu, serta dermaga tempat kapal terakhir berlayar saat senja.

## Cara bermain

Jalankan lokal dengan `node serve.ts`, lalu buka http://localhost:8080. Game berjalan penuh offline di browser desktop (three.js sudah di-vendor di `game/vendor/`).

| Tombol | Aksi |
| --- | --- |
| WASD | Jalan kaki / mengemudi |
| Shift | Lari |
| E | Masuk / keluar / curi mobil |
| Space | Handbrake (drift) |
| F | Pukul |
| Klik mouse | Tembak pistol |
| 1 / 2 | Ganti tinju / pistol |
| P / Esc | Jeda |
| M | Bisu |

Ikuti penanda kuning dan kompas misi di HUD. Minimap di kanan bawah menunjukkan jalan, polisi (merah), dan tujuan misi (kuning). Uang hasil misi tersimpan otomatis (localStorage).

## Misi (6)

1. **Paket Kilat** — antar 3 paket ke penjuru kota (tutorial). Hadiah $500.
2. **Mobil Pinjaman** — curi mobil target di Menara, antar ke Bengkel Jaya. Hadiah $1.200.
3. **Kejar Bayangan** — kabur dari polisi, hilangkan wanted 2 bintang. Hadiah $2.000.
4. **Tolong Mira** — selamatkan Mira dari 3 anggota Geng Ombak di gang Pasar Lama. Hadiah $3.000.
5. **Brankas Pelabuhan** — rampok gudang pelabuhan, kabur dengan wanted 4 bintang. Hadiah $8.000.
6. **Jalan Pulang** — hilangkan wanted 5 bintang dan capai kapal terakhir di pelabuhan. Hadiah $15.000.

Tertangkap polisi = BUSTED. Kesehatan habis = game over. Semua nama, tempat, dan cerita adalah fiksi orisinal.

## Struktur

- `game/index.html` — halaman game + HUD DOM + import map three.js
- `game/src/world.js` — kota 800×800: gedung, jalan, graf jalan, spawn
- `game/src/vehicles.js`, `game/src/traffic.js`, `game/src/police.js` — mobil, lalu lintas, polisi
- `game/src/missions.js`, `game/src/combat.js` — misi cerita + combat
- `game/src/player.js`, `game/src/hud.js`, `game/src/audio.js`, `game/src/input.js`, `game/src/shots.js` — pemain, HUD/minimap, suara sintetis, input, staging screenshot
- `game/src/config.js`, `game/src/random.js` — konstanta + RNG deterministik
- `main.ts` — program entri: salin `game/` + `screenshots/` ke `/output`, tulis `dossier.json`
- `screenshots/` — 4 render asli dari game (cover: kejar-kejaran polisi di Menara)
