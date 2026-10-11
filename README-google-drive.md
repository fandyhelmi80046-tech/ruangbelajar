# Menghubungkan hasil tes ke Google Drive

Aplikasi tetap bisa dibuka siswa tanpa login. Nama lengkap dan kelas diminta saat siswa menekan tombol mulai tes. Setelah jawaban dikumpulkan, aplikasi mengirim ringkasan hasil (waktu, nama, kelas, mapel, topik, tujuan, nilai, KKM, status, dan jumlah soal) ke Google Sheets milik guru. Jawaban mentah siswa tidak dikirim.

## 1. Siapkan Google Sheet

1. Buat Google Sheets baru di Google Drive guru, misalnya `Hasil Tes RuangBelajar`.
2. Ubah nama tab pertama menjadi `Hasil Tes`.
3. Isi baris pertama dengan judul kolom berikut:

   `Waktu | Nama Lengkap | Kelas | Mata Pelajaran | Topik | Tujuan Pembelajaran | Nilai | KKM | Status | Jumlah Soal`

4. Salin ID Sheet dari alamatnya. ID adalah bagian di antara `/d/` dan `/edit` pada alamat Google Sheets.

## 2. Buat akun layanan Google

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dengan akun Google guru, lalu buat atau pilih project.
2. Di **APIs & Services → Library**, cari **Google Sheets API**, lalu tekan **Enable**.
3. Di **IAM & Admin → Service Accounts**, buat service account, misalnya `ruangbelajar-drive-writer`.
4. Buka service account tersebut, pilih **Keys → Add key → Create new key → JSON**, lalu unduh berkas JSON. Simpan dengan aman; jangan unggah ke GitHub atau kirim di chat.
5. Buka Google Sheet, tekan **Share**, lalu tambahkan nilai `client_email` dari JSON sebagai **Editor**.

## 3. Simpan konfigurasi rahasia di Vercel

Pada project Vercel `ruangbelajar`, buka **Settings → Environment Variables**. Tambahkan variabel berikut untuk **Production**:

| Nama variabel | Nilai |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Nilai `client_email` dari JSON |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Seluruh nilai `private_key` dari JSON, termasuk baris `BEGIN PRIVATE KEY` dan `END PRIVATE KEY` |
| `GOOGLE_SHEET_ID` | ID spreadsheet dari langkah 1 |
| `GOOGLE_SHEET_TAB` | `Hasil Tes` |
| `APP_ORIGIN` | `https://ruangbelajar-ten.vercel.app` |

Jangan menaruh `private_key` di `index.html`, `student-results.js`, atau berkas GitHub. Setelah mengisi variabel, pilih **Redeploy** deployment Production terbaru atau lakukan commit baru agar konfigurasi digunakan oleh fungsi API.

## 4. Periksa hasil

Buka situs, pilih materi, tekan **Mulai kerjakan soal**, lalu isi nama lengkap dan kelas. Setelah mengumpulkan tes, halaman akan memberi tahu apakah hasil berhasil dikirim. Pastikan baris baru muncul pada tab `Hasil Tes` di Google Sheets.

Jika muncul pesan bahwa integrasi belum disiapkan, periksa semua Environment Variables dan lakukan redeploy. Jika Google menolak akses, pastikan Sheet sudah dibagikan kepada `client_email` service account sebagai Editor dan nama tab sama persis.

## Catatan

- Siswa tetap tanpa login; aplikasi menggunakan sesi anonim Supabase di belakang layar.
- Nama dan kelas dikumpulkan untuk mengidentifikasi hasil siswa. Data hasil tes masuk ke Sheet guru.
- Nilai dihitung oleh browser, mengikuti cara kerja tes aplikasi saat ini. Gunakan untuk latihan formatif; belum cocok sebagai nilai ujian berintegritas tinggi karena kode dan kunci jawaban dapat diperiksa dari perangkat siswa.
- Endpoint API memverifikasi sesi anonim Supabase dan hanya menyimpan hasil ke spreadsheet yang ID-nya disimpan di Vercel. Kredensial service account tidak dikirim ke browser.
