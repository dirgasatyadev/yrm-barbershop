# YRM Barber

Sistem reservasi barbershop berbahasa Indonesia dengan waktu operasional WIB dan harga dalam rupiah. Pelanggan dapat memilih layanan, waktu, dan capster tanpa akun. Panel admin mengelola reservasi, layanan, capster, shift, hari libur, pola rotasi, serta pengaturan website.

## Menjalankan secara lokal

Gunakan Node.js 22.12 atau lebih baru. Dari direktori proyek, jalankan:

```sh
npm ci
npm run db:migrate:local
npm run db:seed
npm run admin:create
npm run dev
```

Buka `http://127.0.0.1:5173/` untuk halaman pelanggan dan `http://127.0.0.1:5173/admin/login` untuk admin. Jika Vite memilih port lain, gunakan URL dari terminal. `npm run dev:wrangler` membangun bundel dan menjalankannya dengan Wrangler lokal, biasanya di port 8787. Data D1 lokal berada di `.wrangler/state` dan dipakai bersama oleh Wrangler dan Vite.

Seed lokal berisi dua layanan demo (Rp25.000 dan Rp35.000), capster Tio, Angger, dan Yudha, serta tiga shift. Pola tiga minggu berlaku sebagai jadwal dasar mulai dari Senin pada minggu acuan. Hari libur capster bergantian. Seed dapat dijalankan ulang untuk melengkapi data demo yang belum ada. Migrasi nama mengubah placeholder Capster A/B/C menjadi Tio, Angger, dan Yudha, serta mempertahankan nama yang sudah diisi admin.

### Admin pertama

`npm run admin:create` meminta username, email, dan kata sandi 14–256 karakter melalui terminal interaktif. Input kata sandi disembunyikan. Skrip menyimpan hash dengan salt acak dan hanya mengisi database yang masih belum memiliki admin. Masuk memakai username atau email yang dipilih. Tidak ada akun otomatis maupun pendaftaran admin dari website.

## Arsitektur dan penyimpanan

| Lapisan | Implementasi |
| --- | --- |
| Pelanggan | React, Vite, TypeScript strict, Tailwind CSS, Lucide React, React Router |
| Data klien dan validasi | TanStack Query dan Zod; data reservasi disimpan di D1 |
| API | Cloudflare Worker dengan Hono, REST JSON, dan skema yang digunakan bersama |
| Database | Cloudflare D1, model Drizzle ORM, SQL terparameterisasi, dan migrasi Wrangler |
| Foto | Cloudflare R2 menyimpan foto profil, sampul, latar, dan capster. Worker melayani URL foto pada domain yang sama |
| Static assets | Frontend dan API masuk dalam deployment Worker yang sama. SPA fallback menangani URL frontend yang dibuka langsung |
| Keamanan | PBKDF2-SHA-256 dengan salt unik, hash token sesi, cookie HttpOnly selama 12 jam, Secure dan SameSite Strict di production, token CSRF, verifikasi Origin, pembatasan percobaan login dan booking di D1, serta batas ukuran kiriman |

| Tabel | Peran |
| --- | --- |
| `admins`, `admin_sessions` | Identitas admin, hash kata sandi, sesi dan kedaluwarsa |
| `services`, `barbers`, `shifts` | Katalog yang dapat dinonaktifkan dengan histori tetap tersimpan |
| `barber_schedules` | Satu jadwal khusus atau hari libur per capster per tanggal |
| `business_settings` | Jam operasional, identitas, penerimaan booking online, dan pola rotasi |
| `bookings` | Reservasi dan snapshot nama layanan, nama capster, harga, dan durasi |
| `booking_slots` | Unit lima menit dengan indeks unik pada capster, tanggal, dan waktu mulai |
| `booking_idempotency` | Sidik jari dan hasil pertama untuk retry permintaan pembuatan booking |
| `state_version` | Revisi bersama yang melindungi pemeriksaan ketersediaan dari perubahan bersamaan |
| `rate_limits`, `audit_logs` | Pembatasan laju dan pencatatan perubahan admin |

Waktu kedatangan disimpan sebagai tanggal lokal dan jumlah menit sejak pukul 00.00 WIB. Timestamp sistem menggunakan UTC. Harga menggunakan bilangan bulat. Pembuatan reservasi, penguncian slot, dan penyimpanan data idempotensi memakai satu transaksi batch D1. Pembatalan dan penjadwalan ulang juga memakai batch. Indeks unik menolak tumpang tindih. Pemeriksaan revisi membatalkan batch jika jadwal, reservasi, atau pengaturan berubah di antara pembacaan dan penulisan.

### Operasi jadwal dan reservasi

- Jadwal khusus per tanggal memiliki prioritas atas pola rotasi. Jadwal dapat berupa shift, rentang waktu khusus, atau libur. Shift yang dipakai dalam reservasi harus mencakup seluruh durasi layanan dan jam operasional.
- **Buat dari Pola** memakai fase rotasi pada minggu terpilih. **Rotasi Shift** menerapkan fase berikutnya pada minggu itu. **Salin Minggu Lalu** menyalin jadwal efektif dari hari yang sama pada minggu sebelumnya. Ketiga tindakan menampilkan pratinjau sebelum menyimpan. Jika ada perubahan sesudah pratinjau, admin perlu memperbaruinya.
- Perubahan shift, capster, jadwal, pola, atau jam operasi yang akan mengganggu reservasi aktif ditolak. Kode reservasi yang perlu ditangani muncul di pesan konflik.
- Walk-in dapat memakai interval lima menit pada hari berjalan. Reservasi pelanggan memakai interval, rentang tanggal, dan waktu tunggu dari Pengaturan. Penjadwalan ulang admin memilih waktu baru pada masa mendatang dan memakai durasi asli.
- Pelanggan dapat memeriksa jam tersedia, dibooking, dan tidak tersedia untuk tiap capster. Jika pelanggan memilih jam setelah memfilter satu capster, pilihan itu langsung dipakai pada langkah Data Pelanggan.
- Halaman **Reservasi** menampilkan daftar bernomor per capster. Setiap daftar memiliki pagination sendiri, dan jam diurutkan dari awal ke akhir pada tanggal yang sama.
- Di **Pengaturan**, admin dapat mengganti profil, sampul, latar, deskripsi, kontak, dan pesan sebelum konfirmasi. Foto capster diatur di **Capster**. File JPG, PNG, dan WebP maksimal 2 MB diunggah saat formulir disimpan.
- Dashboard memakai data D1. Nilai estimasi berasal dari reservasi terkonfirmasi dan selesai hari ini. Nilai layanan selesai memakai snapshot reservasi berstatus selesai. Aplikasi tidak memiliki pencatatan pembayaran.

## Rute

| Website | Kegunaan |
| --- | --- |
| `/` | Hero, profil dan kontak barbershop, serta jadwal capster hari ini |
| `/booking`, `/booking/berhasil` | Wizard dimulai dari pilihan layanan, diakhiri dengan tanda terima |
| `/admin/login`, `/admin/dashboard` | Login dan ringkasan admin |
| `/admin/reservasi`, `/admin/layanan`, `/admin/capster` | Operasional reservasi dan katalog |
| `/admin/shift`, `/admin/jadwal`, `/admin/hari-libur`, `/admin/pengaturan` | Penjadwalan dan konfigurasi |

Seluruh endpoint berikut memakai prefix `/api`.

| Metode | Path |
| --- | --- |
| GET | `/public/settings`, `/public/services`, `/public/barbers`, `/public/availability` |
| POST | `/public/bookings` |
| GET | `/auth/me` |
| POST | `/auth/login`, `/auth/logout` |
| GET | `/admin/dashboard`, `/admin/availability`, `/admin/bookings`, `/admin/bookings/:id` |
| POST | `/admin/bookings`, `/admin/bookings/:id/cancel` |
| PATCH | `/admin/bookings/:id` |
| GET, POST | `/admin/services`, `/admin/barbers`, `/admin/shifts` |
| PATCH, DELETE | `/admin/services/:id`, `/admin/barbers/:id`, `/admin/shifts/:id` |
| GET, POST | `/admin/schedules` |
| PATCH | `/admin/schedules/:id` |
| POST | `/admin/schedules/generate`, `/admin/schedules/rotate`, `/admin/schedules/copy` |
| GET, PATCH | `/admin/settings`, `/admin/rotation` |
| POST | `/admin/media` (unggah foto, sesi admin dan CSRF) |

URL foto dari R2 dilayani melalui `/media/:filename` di luar prefix API.

Sukses memakai `{ data: ... }`; galat memakai `{ error: { code, message, details? } }`. API daftar reservasi menerima `q`, `date`, `barber_id`, `service_id`, `status`, dan `page`. Ketersediaan menerima `date`, `service_id`, dan `barber_id` opsional. Permintaan yang membuat reservasi harus menyertakan `Idempotency-Key` berupa UUID. Mutasi admin memakai cookie sesi dan `X-CSRF-Token` dari login atau `/auth/me`. Semua permintaan tulis browser dilindungi oleh pengecekan Origin.

## Pengujian

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tes unit memeriksa perhitungan WIB, rotasi, libur, batas durasi, dan interval. Tes integrasi membangun Worker untuk Miniflare/Workerd dan menggunakan D1 sementara yang terisolasi. Tes mencakup autentikasi, CSRF, pembatasan laju, pembuatan booking paralel, idempotensi, pembatalan, reschedule, snapshot harga, perubahan jadwal bersamaan, laporan, dan persistensi setelah restart.

`npm run db:generate` menambahkan migrasi saat skema Drizzle berubah. Jalankan dan periksa migrasi di lokal sebelum menerapkannya di database production.

## Deployment ke Cloudflare Workers

Langkah berikut menulis ke akun Cloudflare yang dipilih operator.

1. Jalankan `npx wrangler login`.
2. Buat database production dengan `npx wrangler d1 create yrm-barber`. Isi ID yang diterbitkan pada `env.production.d1_databases[0].database_id` di `wrangler.jsonc`. Binding wajib bernama `DB`. Jika pengembangan memerlukan database cloud, buat database terpisah dan isi binding top-level dengan ID yang berbeda. Development lokal dapat memakai ID placeholder.
3. Jalankan `npm run db:migrate:remote`. Database production dimulai dengan pengaturan dasar dan katalog kosong.
4. Jalankan `npm run admin:create -- --remote` dari terminal interaktif. Pastikan sesi Wrangler menunjuk akun Cloudflare yang benar.
5. Untuk penyediaan pertama, buat bucket production dengan `npx wrangler r2 bucket create yrm-barber-media --env production`. Jalankan `npm run deploy -- --dry-run` untuk memeriksa bundel, lalu `npm run deploy` untuk menerbitkan. Skrip memilih environment production saat Vite membangun Worker.
6. Jika memakai secret opsional rate limit, jalankan `npx wrangler secret put RATE_LIMIT_SECRET --env production --config wrangler.jsonc`. Isi nilai acak yang panjang saat CLI memintanya. Untuk lokal, contoh tersedia di `.dev.vars.example`.
7. Buka `https://yrm.brantzy.com`, domain yang dipasang melalui konfigurasi production di `wrangler.jsonc`. Masuk ke dashboard admin untuk mengisi layanan, capster, shift, jadwal, dan identitas bisnis resmi. Uji satu reservasi terkontrol.

| Konfigurasi | Kegunaan |
| --- | --- |
| `DB` | Binding D1 wajib, diarahkan ke ID database masing-masing environment |
| `ASSETS` | Binding Worker Static Assets dari konfigurasi build |
| `MEDIA` | Binding R2. Pengembangan lokal memakai penyimpanan emulasi, production memakai `yrm-barber-media` |
| `APP_ENV` | `development` atau `production` dari Wrangler. Mode production menggunakan cookie Secure |
| `RATE_LIMIT_SECRET` | Secret opsional untuk memisahkan hash identitas pembatas laju |
| `CLOUDFLARE_ENV` | Dipilih skrip deploy agar binding production digunakan saat build |

Kata sandi admin diisi di terminal saat bootstrap. Skrip deployment tidak menjalankan seed demo.

## Informasi dari pemilik barbershop

Isi logo, deskripsi resmi, alamat, nomor telepon dan WhatsApp beserta kode negara, tautan media sosial, foto capster, harga dan durasi resmi, jam operasional, dan jadwal tim. Admin dapat mengunggah foto ke R2 atau memasukkan URL HTTPS. Wizard menampilkan tombol konsultasi jika nomor WhatsApp sudah diatur. Foto ilustrasi hero dibuat dengan ImageGen dan tersimpan di `public/images/barbershop.webp`.

<details>
<summary>Prompt aset hero</summary>

> Use case: ads-marketing. Full-bleed wide 3:2 website hero photo, intimate premium Indonesian barbershop. Editorial realistic photo of one Indonesian barber in dark apron using clippers on a seated male client's neat faded haircut, cinematic amber task lighting, walnut and dark walls, natural texture, focus on barber hands and profile. Concentrate the action mid-right, leftmost area fades naturally into shadow. Sophisticated subdued black and amber palette, authentic candid photography, no text, logos or watermarks.

</details>

Tanda terima tampil setelah pengiriman dari wizard. Pada perangkat berbeda, pelanggan perlu membawa kode yang sudah disalin. R2 dan notifikasi WhatsApp otomatis dapat diintegrasikan terpisah. Untuk pengelolaan traffic yang lebih besar, indeks dan revisi global memadai untuk satu lokasi, dengan implikasi bahwa mutasi serentak pada lokasi yang sama dapat meminta retry.

