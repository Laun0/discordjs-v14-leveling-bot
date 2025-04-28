# Discord.js v14 Leveling Bot (MongoDB)

[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Bot Discord.js v14 canggih yang mengimplementasikan sistem leveling pengguna yang kompleks dan dapat dikonfigurasi, menggunakan MongoDB sebagai backend database dan `node-cache` untuk optimasi performa.

## ✨ Fitur Utama

*   **Sistem XP Komprehensif:**
    *   XP dari pesan teks (dengan cooldown yang dapat diatur).
    *   XP dari durasi aktif di voice channel (tidak di-mute server/deafen).
    *   Pelacakan total pesan valid dan total durasi suara valid per pengguna.
*   **Leveling Dinamis:**
    *   Formula XP untuk naik level yang terdefinisi (default: `5 * (level^2) + 50 * level + 100`).
    *   Perhitungan level otomatis berdasarkan total XP.
*   **Konfigurasi Per Server (via `/levelconfig`):**
    *   Rate XP untuk pesan dan suara.
    *   Durasi cooldown XP pesan.
    *   Pengaturan notifikasi level up (aktif/nonaktif, channel spesifik, format pesan kustom dengan variabel).
    *   Daftar role dan channel yang diabaikan (tidak mendapat XP).
    *   Pengganda (multiplier) XP berdasarkan role atau channel tertentu.
    *   Reward role otomatis saat pengguna mencapai level tertentu.
    *   Strategi penghapusan role level lama saat naik level (`keep_all`, `highest_only`, `remove_previous`).
    *   Mengaktifkan/menonaktifkan sistem penalty XP.
    *   Mengatur gaya tampilan default leaderboard (`card` atau `text`).
    *   Melihat konfigurasi saat ini dan mereset data level server.
*   **Kartu Dinamis (`canvas`):**
    *   Kartu rank (`/rank`) yang menampilkan avatar, nama, status online, level, rank, progress XP (visual & teks), total XP, total pesan, dan total waktu suara.
    *   Kartu notifikasi level up yang menarik.
    *   Kartu leaderboard (`/leaderboard`) visual.
*   **Leaderboard:**
    *   Leaderboard per server (`/leaderboard`) dengan batas entri yang dapat diatur.
    *   Opsi tampilan: gambar (`card`) atau teks (`text`).
    *   Menampilkan peringkat pengguna yang meminta di footer (jika tampilan teks).
*   **Arsitektur Modular:**
    *   Kode terstruktur dalam kelas-kelas terpisah (Core, Managers, Database, Utils, Commands, Events) untuk kemudahan pengelolaan dan perluasan.
    *   Penggunaan Base Class (`LevelingManager`) untuk logika inti XP/Level.
    *   Pemanfaatan `EventEmitter` untuk komunikasi antar komponen.
*   **Sistem Plugin:**
    *   Memungkinkan penambahan fungsionalitas kustom melalui plugin eksternal (lihat `src/plugins/exampleRewardPlugin.js`).
*   **Caching:**
    *   Implementasi caching layer menggunakan `node-cache` untuk data level pengguna dan konfigurasi server, mengurangi query database.
*   **Database MongoDB:**
    *   Penyimpanan data level yang efisien dan skalabel.
    *   Optimasi query dengan index database yang sesuai.
*   **Dokumentasi Kode:**
    *   Komentar JSDoc yang detail untuk sebagian besar kelas dan metode penting.
*   **Command Tambahan:**
    *   `/botinfo`: Menampilkan informasi lengkap tentang bot, statistik, dan sistem.
    *   `/docs config`: Menampilkan dokumentasi interaktif untuk setiap pengaturan konfigurasi menggunakan autocomplete.

## 📋 Prasyarat

*   **Node.js:** Versi 20.0.0 atau lebih tinggi.
*   **MongoDB:** Server MongoDB yang berjalan (lokal atau di cloud seperti MongoDB Atlas). Dapatkan Connection String Anda.
*   **Akun Bot Discord:** Anda memerlukan Token Bot dan Application (Client) ID dari [Discord Developer Portal](https://discord.com/developers/applications).

## 🚀 Instalasi

1.  **Clone Repository:**
    ```bash
    git clone https://github.com/Laun0/discordjs-v14-leveling-bot.git
    cd discordjs-v14-leveling-bot
    ```

2.  **Install Dependensi:**
    ```bash
    npm install
    ```
    atau jika menggunakan Yarn:
    ```bash
    yarn install
    ```
    *   **Catatan `node-canvas`:** Instalasi `canvas` mungkin memerlukan dependensi sistem tambahan (seperti `build-essential`, `pkg-config`, `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`, `libgif-dev`, `librsvg2-dev` di sistem berbasis Debian/Ubuntu). Silakan merujuk ke [dokumentasi `node-canvas`](https://github.com/Automattic/node-canvas#compiling) untuk sistem operasi Anda jika terjadi masalah instalasi.

3.  **Konfigurasi Environment (`.env`):**
    *   Buat file bernama `.env` di direktori root proyek.
    *   Salin konten dari contoh di bawah dan ganti placeholder dengan nilai Anda:

    ```dotenv
    # .env - Environment Variables for Discord Leveling Bot

    # --- Core Bot Credentials (WAJIB) ---
    DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
    CLIENT_ID=YOUR_APPLICATION_CLIENT_ID_HERE

    # --- Database Configuration (WAJIB) ---
    # Contoh MongoDB Atlas: mongodb+srv://<username>:<password>@<your-cluster-url>/<database-name>?retryWrites=true&w=majority
    # Contoh Lokal: mongodb://localhost:27017/discord_leveling
    MONGO_URI=YOUR_MONGODB_CONNECTION_STRING_HERE

    # --- Development & Deployment ---
    NODE_ENV=development # 'development' atau 'production'

    # (Opsional) ID Server (Guild) untuk testing command secara instan.
    # Kosongkan untuk mendaftarkan command secara global (produksi).
    GUILD_ID=YOUR_TESTING_SERVER_ID_HERE

    # --- Optional Information (Digunakan oleh /botinfo) ---
    # (Opsional) URL Invite permanen ke server support Discord Anda.
    SUPPORT_SERVER_INVITE=https://discord.gg/invitekodeanda

    # (Opsional) URL ke repository source code bot Anda.
    SOURCE_CODE_URL=https://github.com/Laun0/discordjs-v14-leveling-bot
    ```
    *   **PENTING:** Jangan pernah membagikan file `.env` Anda. Tambahkan `.env` ke file `.gitignore` Anda.

## ▶️ Menjalankan Bot

*   **Untuk Produksi:**
    ```bash
    npm start
    ```
*   **Untuk Development (dengan `nodemon`):**
    ```bash
    npm run dev
    ```

    Saat pertama kali dijalankan, bot akan mendaftarkan slash commands ke Discord. Jika `GUILD_ID` diatur di `.env`, command akan muncul segera di server tersebut. Jika tidak, pendaftaran global mungkin memerlukan waktu hingga 1 jam untuk muncul di semua server.

## ⚙️ Commands Utama

*   `/rank [user]` : Menampilkan kartu rank visual dan embed statistik level untuk Anda atau pengguna lain.
*   `/leaderboard [display] [limit]` : Menampilkan papan peringkat server. `display` bisa `card` (default) atau `text`. `limit` maksimal 25 (default 10).
*   `/levelconfig <subcommand_group> <subcommand> [options]` : (Memerlukan Izin `Manage Guild`) Mengelola semua pengaturan sistem leveling untuk server ini. Lihat detail di bawah atau gunakan `/docs config`.
*   `/botinfo` : Menampilkan informasi lengkap tentang bot, termasuk statistik dan detail teknis.
*   `/docs config [setting]` : Menampilkan dokumentasi untuk pengaturan konfigurasi spesifik menggunakan autocomplete.

## 🔧 Detail Command Konfigurasi (`/levelconfig`)

Command ini memiliki beberapa grup subcommand:

*   **`/levelconfig settings`**: Mengatur dasar leveling.
    *   `xp_message`: XP per pesan.
    *   `xp_voice`: XP per menit suara.
    *   `cooldown`: Cooldown XP pesan (detik).
    *   `penalty_system`: Aktifkan/nonaktifkan sistem penalty.
    *   `leaderboard_style`: Gaya default leaderboard (`card`/`text`).
*   **`/levelconfig notifications`**: Mengatur notifikasi level up.
    *   `toggle`: Aktifkan/nonaktifkan notifikasi.
    *   `channel`: Set channel notifikasi spesifik.
    *   `message_format`: Kustomisasi format pesan level up (gunakan variabel seperti `{username}`, `{level}`, dll.).
*   **`/levelconfig ignores`**: Mengatur apa yang diabaikan untuk XP.
    *   `add_role`/`remove_role`: Tambah/hapus role yang diabaikan.
    *   `add_channel`/`remove_channel`: Tambah/hapus channel yang diabaikan.
*   **`/levelconfig multipliers`**: Mengatur pengganda XP.
    *   `set_role`/`remove_role`: Atur/hapus multiplier untuk role.
    *   `set_channel`/`remove_channel`: Atur/hapus multiplier untuk channel.
*   **`/levelconfig rewards`**: Mengatur role reward otomatis.
    *   `add_role`: Tambah/update role reward untuk suatu level.
    *   `remove_role`: Hapus role reward dari suatu level.
    *   `list_roles`: Tampilkan daftar role reward saat ini.
    *   `role_strategy`: Pilih strategi penghapusan role lama saat naik level (`keep_all`, `highest_only`, `remove_previous`).
*   **`/levelconfig view`**: Menampilkan semua pengaturan konfigurasi saat ini dalam bentuk embed.
*   **`/levelconfig reset_guild_data confirm:True`**: **(BERBAHAYA!)** Menghapus *semua* data level pengguna di server ini. Membutuhkan konfirmasi eksplisit.

Gunakan `/docs config` untuk penjelasan detail setiap pengaturan.

## 🔌 Sistem Plugin

Bot ini mendukung plugin kustom untuk memperluas fungsionalitas.

*   Letakkan file plugin Anda (file `.js`) di dalam direktori `src/plugins` (atau direktori lain yang ditentukan di `options.pluginsPath` pada `index.js`).
*   Setiap file plugin harus mengekspor sebuah `class` yang memiliki metode `register(system)`.
*   Di dalam kelas plugin, Anda dapat mendefinisikan metode event handler dengan format `onEventName` (misalnya `onLevelUp`, `onXpGained`) untuk bereaksi terhadap event yang di-emit oleh `LevelingSystem`.
*   Lihat `src/plugins/exampleRewardPlugin.js` untuk contoh implementasi dasar.

## 🤝 Berkontribusi

Kontribusi selalu diterima! Silakan fork repository ini, buat branch fitur Anda, dan buat Pull Request.

## 📄 Lisensi

Proyek ini dilisensikan di bawah Lisensi Publik Umum GPL-3.0 - lihat file [LICENSE](LICENSE) untuk detailnya.

## 👤 Author

**Laun0**
