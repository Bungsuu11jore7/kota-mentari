[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Bungsuu11jore7/kota-mentari/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Bungsuu11jore7/kota-mentari/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# KOTA MENTARI

Game dunia terbuka 3D yang berjalan offline di peramban desktop — kota pesisir tropis fiktif yang bisa dijelajahi dengan berjalan kaki maupun mengemudi.

Kamu adalah **Raka Pratama**, kurir 28 tahun di Kota Mentari. Bos Darma dan Geng Ombak menguasai jalanan, dan hanya Mira Santosa yang masih percaya padamu.
Selesaikan 6 misi berurutan, kumpulkan uang, dan kabur dengan kapal di ujung cerita.

## Cara main

Buka `game/index.html` lewat peladen statis apa pun, misalnya `node serve.ts`, lalu buka http://localhost:8080 di Chrome desktop.

## Misi

1. **Paket Kilat** — antar 3 paket ke Menara. Hadiah $500.
2. **Mobil Pinjaman** — curi mobil oranye di (100, 0), bawa ke Pesisir. Hadiah $1.200.
3. **Kejar Bayangan** — kejar target yang melarikan diri sampai ke Pesisir. Hadiah $2.000.
4. **Tolong Mira** — selamatkan Mira di (-200, 100) dari 3 penyerang Geng Ombak. Hadiah $3.000.
5. **Brankas Pelabuhan** — ambil brankas di Pelabuhan (400, 300). Hadiah $8.000.
6. **Jalan Pulang** — kabur ke kapal di (470, 350). Hadiah $15.000.

Uang akhir bila semua misi selesai: **$29.700**.

## Kontrol

| Tombol | Aksi |
| ------ | ---- |
| W A S D | Jalan / mengemudi |
| Shift | Lari |
| E | Masuk / keluar / curi mobil |
| Spasi | Rem tangan |
| F | Pukul |
| Klik mouse | Tembak |
| 1 / 2 | Tinju / pistol |
| P atau Esc | Jeda |
| M | Bisukan suara |
| Enter | Mulai dari layar awal |

## Fitur

- Kota 3D dengan 5 distrik: Pelabuhan, Pasar Lama, Menara, Pesisir, dan Bukit.
- Lalu lintas 28 mobil dan 45 pejalan kaki, sistem wanted 0–5 bintang, dan polisi yang mengejar.
- Simpan / muat otomatis lewat peramban (localStorage).
- HUD lengkap: nyawa, uang, senjata, bintang wanted, kecepatan, minimap, dan kotak misi.
- Suara disintesis WebAudio tanpa file suara; semua aset dibuat sendiri, tanpa aset komersial.

## Kompetisi

Entri untuk bounty [gta6-01 di make.fun](https://make.fun/bounty/gta6-01) — game dunia terbuka paling lengkap yang bisa dibuat agen dalam seminggu.

Lisensi: MIT — lihat `LICENSE`.
