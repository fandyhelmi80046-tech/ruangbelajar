# Menyiapkan RuangBelajar online

## 1. Buat proyek database

1. Buat proyek Supabase.
2. Buka **SQL Editor**, jalankan seluruh isi `supabase-schema.sql`.
3. Di **Authentication > Providers**, aktifkan **Anonymous sign-ins** untuk sesi siswa tanpa formulir login.
4. Di **Authentication > Users**, buat **satu akun email/kata sandi bersama** untuk semua guru.
5. Salin UUID akun tersebut, lalu jalankan SQL berikut di SQL Editor:

   ```sql
   insert into public.teachers (user_id) values ('UUID_USER_GURU');
   ```

   Jangan tambahkan akun guru kedua. Indeks `teachers_single_account_only` membatasi tabel itu menjadi satu akun. Kebijakan database membatasi penulisan materi hanya untuk akun bersama yang terdaftar di tabel `teachers`.

## 2. Hubungkan aplikasi ke Supabase

1. Salin `config.example.js` menjadi `config.js`.
2. Isi `RB_SUPABASE_URL` dan `RB_SUPABASE_KEY` dari **Project Settings > API**. Gunakan publishable key/anon key, jangan pernah menggunakan `service_role` atau secret key di browser.
3. Commit/publikasikan `index.html`, `config.js`, dan berkas lain di folder `outputs` ke hosting statis.

## 3. Terbitkan situs

Hubungkan repositori Git ke Vercel (atau hosting statis lain) dan atur folder `outputs` sebagai folder publik/output. Vercel akan memberikan URL situs. Pastikan `config.js` ikut diterbitkan pada path yang sama dengan `index.html`.

## Cara kerja akun dan data

- Siswa tidak perlu mengisi formulir login. Browser membuat sesi anonim Supabase dan memakai ID pengguna anonim untuk menyimpan nilai/progres.
- Progres anonim mengikuti browser/perangkat. Menghapus data browser atau pindah perangkat membuat identitas anonim baru; tanpa akun siswa, progres lama tidak otomatis ikut berpindah.
- Guru masuk memakai akun email/kata sandi yang dibuat di Supabase. Kode rahasia bersama di HTML dihapus karena siapa pun dapat melihat kode yang ditanam di halaman.
- Soal esai tetap dinilai berdasarkan kata kunci yang disetel guru.
- Bila konfigurasi Supabase belum ada, aplikasi tetap dapat dibuka dalam mode lokal dengan data browser.

## Batas keamanan

Supabase URL dan publishable key memang berada di browser. Keamanan berasal dari Row Level Security di `supabase-schema.sql`; jangan menonaktifkan RLS dan jangan menerbitkan secret/service-role key. Kebijakan saat ini mengizinkan siapa pun membaca materi yang ada, sedangkan hanya guru terdaftar dapat mengubahnya. Progres hanya dapat dibaca/ditulis oleh sesi anonim pemiliknya.

**Catatan untuk penggunaan ujian resmi:** versi ini masih menghitung nilai di browser. Karena itu, siswa yang memahami alat pengembang dapat melihat kunci jawaban pada data soal dan memalsukan nilai progresnya. Gunakan alur ini untuk latihan formatif. Sebelum dipakai sebagai penilaian berintegritas tinggi, pindahkan kunci jawaban ke tabel privat dan lakukan pemeriksaan jawaban serta pembaruan nilai lewat fungsi server/database yang tepercaya.
