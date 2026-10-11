# Menghubungkan hasil tes ke Google Drive

Siswa tetap membuka aplikasi tanpa login. Nama lengkap dan kelas wajib diisi sebelum tes. Ringkasan nilai dikirim ke Google Sheets, dengan **satu tab khusus untuk setiap mata pelajaran**. Tab dan judul kolom dibuat otomatis saat hasil pertama untuk mapel tersebut dikirim.

## 1. Siapkan Google Sheet

1. Buat Google Sheets di Drive, misalnya **Hasil Tes Ruang Belajar**.
2. Salin ID spreadsheet dari alamatnya, yaitu teks di antara **/d/** dan **/edit**.
3. Tab pertama boleh tetap bernama **Hasil Tes**. Aplikasi akan membuat tab baru sesuai nama mapel, misalnya **Matematika** atau **IPA**.

## 2. Buat akun layanan Google

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dengan akun Google guru, lalu buat atau pilih project.
2. Pada **APIs & Services → Library**, cari **Google Sheets API**, lalu tekan **Enable**.
3. Pada **IAM & Admin → Service Accounts**, buat service account, misalnya **ruangbelajar-drive-writer**.
4. Buka akun layanan tersebut, pilih **Keys → Add key → Create new key → JSON**, lalu unduh berkas JSON. Simpan aman; jangan unggah ke GitHub atau kirim melalui chat.
5. Buka Google Sheet, tekan **Bagikan**, lalu tambahkan email **client_email** dari JSON sebagai **Editor**.

## 3. Simpan rahasia di Vercel

Pada project Vercel **ruangbelajar**, buka **Settings → Environment Variables**. Tambahkan variabel berikut untuk **Production**:

| Nama variabel | Nilai |
| --- | --- |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Nilai client_email dari JSON |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Seluruh nilai private_key dari JSON, termasuk BEGIN PRIVATE KEY dan END PRIVATE KEY |
| GOOGLE_SHEET_ID | ID spreadsheet dari langkah 1 |
| APP_ORIGIN | https://ruangbelajar-ten.vercel.app |

Jangan masukkan private_key ke file aplikasi atau GitHub. Setelah menyimpan Environment Variables, redeploy deployment Production terbaru.

## 4. Cara kerja tab mapel

Saat hasil tes pertama dikirim untuk suatu mapel, aplikasi membuat tab dengan nama mapel itu, mengisi judul kolom, lalu menyimpan hasil. Tes berikutnya untuk mapel yang sama masuk ke tab yang sama. Tab lama bernama **Hasil Tes** tetap ada dan tidak dihapus.

Kolomnya mencakup waktu, nama, kelas, mata pelajaran, topik, tujuan pembelajaran, nilai, KKM, status kelulusan, dan jumlah soal. Jawaban mentah siswa tidak dikirim.

## Catatan

- Nama mapel yang dipakai untuk tab mengikuti nama mapel di aplikasi. Karakter yang tidak diizinkan Google Sheets akan dirapikan otomatis.
- Nilai saat ini dihitung di browser dan cocok untuk latihan formatif, bukan ujian berintegritas tinggi.
- Sesi anonim Supabase tetap menjaga siswa tidak perlu login.
