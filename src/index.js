/**
 * @file src/index.js
 * @description Titik masuk utama untuk bot Discord Leveling.
 *              Menginisialisasi Discord Client, memuat konfigurasi,
 *              menghubungkan ke database, menginisialisasi sistem leveling,
 *              memuat event handlers dan commands, serta menangani login bot dan graceful shutdown.
 * @requires discord.js
 * @requires mongoose
 * @requires fs
 * @requires path
 * @requires dotenv
 * @requires ./core/LevelingSystem
 * @requires ./database/connect
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  REST,
  Routes,
  ActivityType,
} = require("discord.js");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const LevelingSystem = require("./core/LevelingSystem");
const connectDB = require("./database/connect");

/**
 * Token autentikasi untuk bot Discord.
 * Diambil dari environment variable DISCORD_TOKEN.
 * @const {string}
 */
const TOKEN = process.env.DISCORD_TOKEN;
/**
 * URI koneksi untuk database MongoDB.
 * Diambil dari environment variable MONGO_URI.
 * @const {string}
 */
const MONGO_URI = process.env.MONGO_URI;
/**
 * ID Aplikasi (Client ID) dari bot Discord.
 * Diambil dari environment variable CLIENT_ID. Digunakan untuk mendaftarkan slash commands.
 * @const {string}
 */
const CLIENT_ID = process.env.CLIENT_ID;
/**
 * (Opsional) ID Guild spesifik untuk mendaftarkan slash commands saat development.
 * Jika tidak diatur, commands akan didaftarkan secara global.
 * Diambil dari environment variable GUILD_ID.
 * @const {string|undefined}
 */
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !MONGO_URI || !CLIENT_ID) {
  console.error(
    "FATAL ERROR: Pastikan DISCORD_TOKEN, MONGO_URI, dan CLIENT_ID ada di file .env!",
  );
  process.exit(1);
}

/**
 * Instance Discord Client utama.
 * Dikonfigurasi dengan intents dan partials yang diperlukan oleh sistem leveling.
 * @const {Client}
 * @property {LevelingSystem} levelingSystem - Instance dari sistem leveling utama, dipasang untuk akses mudah.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});

/**
 * Instance utama dari LevelingSystem.
 * Mengelola semua logika leveling, database, cache, commands, dll.
 * Dipasang ke properti `client.levelingSystem` untuk akses global dalam bot.
 * @type {LevelingSystem}
 */
client.levelingSystem = new LevelingSystem(client, {
  /** @type {string} URI koneksi MongoDB. */
  mongoURI: MONGO_URI,
  /** @type {object} Konfigurasi default yang akan digunakan untuk server baru atau jika config DB tidak ditemukan. */
  defaultGuildConfig: {
    xpPerMessage: 15,
    xpPerMinuteVoice: 5,
    messageCooldownSeconds: 60,
    levelUpMessageEnabled: true,
    levelUpMessageFormat:
      "Selamat {userMention}! 🎉 Kamu telah naik ke **Level {level}**! (Rank: {rank})",
    ignoredRoles: [],
    ignoredChannels: [],
    roleMultipliers: new Map(),
    channelMultipliers: new Map(),
    levelRoles: new Map(),
    roleRemovalStrategy: "keep_all",
    enablePenaltySystem: false,
    leaderboardStyle: "card",
    rankCardBackground: null,
  },
  /** @type {string} Path absolut ke direktori yang berisi file plugin kustom. */
  pluginsPath: path.join(__dirname, "plugins"),
});

/**
 * Memuat semua file event handler dari direktori `src/events`.
 * Mendaftarkan listener ke Discord Client (`client.on`/`client.once`) atau
 * ke LevelingSystem (`client.levelingSystem.on`) berdasarkan properti
 * `discordEvent` atau `levelingEvent` yang diekspor oleh file event.
 */
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

console.log("[EventManager] Memuat event handlers...");
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  try {
    const event = require(filePath);

    if (!event.name) {
      console.warn(
        `[EventManager] File event ${file} tidak memiliki properti 'name'. Dilewati.`,
      );
      continue;
    }
    if (typeof event.execute !== "function") {
      console.warn(
        `[EventManager] File event ${file} tidak memiliki fungsi 'execute'. Dilewati.`,
      );
      continue;
    }

    if (event.discordEvent) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
      }
    } else if (event.levelingEvent) {
      client.levelingSystem.on(event.name, (...args) =>
        event.execute(client.levelingSystem, ...args),
      );
    } else {
      console.warn(
        `[EventManager] File event ${file} tidak memiliki tanda 'discordEvent' atau 'levelingEvent'. Tidak didaftarkan secara otomatis.`,
      );
    }
  } catch (error) {
    console.error(`[EventManager] Gagal memuat event ${file}:`, error);
  }
}
console.log("[EventManager] Selesai memuat event handlers.");

/**
 * Menjalankan proses inisialisasi asinkron utama:
 * 1. Menghubungkan ke database MongoDB.
 * 2. Menginisialisasi sistem leveling (setelah DB terhubung).
 * 3. Melakukan login bot ke Discord (setelah sistem siap).
 * Menggunakan IIFE (Immediately Invoked Function Expression) untuk menangani async/await di top level.
 */
(async () => {
  try {
    console.log("[Main] Menghubungkan ke MongoDB...");
    await connectDB(MONGO_URI);

    console.log("[Main] Menginisialisasi Sistem Leveling...");
    await client.levelingSystem.initialize();
    console.log("[Main] Sistem Leveling berhasil diinisialisasi.");

    console.log("[Main] Melakukan login bot...");
    await client.login(TOKEN);
  } catch (error) {
    console.error("[Main] Gagal memulai bot:", error);
    process.exit(1);
  }
})();

/**
 * Listener untuk error yang tidak tertangkap dari Discord.js Client.
 * @listens Client#error
 */
client.on(Events.Error, (error) => {
  console.error("[Client Error]", error);
});

/**
 * Listener untuk error yang di-emit oleh instance LevelingSystem.
 * @listens LevelingSystem#error
 */
client.levelingSystem.on("error", (error) => {
  console.error("[LevelingSystem Error]", error.message);
});

/**
 * Listener untuk unhandled promise rejections dalam proses Node.js.
 * @listens process#unhandledRejection
 */
process.on("unhandledRejection", (error) => {
  console.error("[Unhandled Rejection]", error);
});

/**
 * Listener untuk uncaught exceptions dalam proses Node.js.
 * @listens process#uncaughtException
 */
process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", error);
});

/**
 * Fungsi untuk menangani proses shutdown bot secara bersih.
 * Dipanggil saat menerima sinyal SIGINT (Ctrl+C) atau SIGTERM (dari sistem/pm2).
 * @async
 * @param {string} signal - Nama sinyal yang diterima ('SIGINT' atau 'SIGTERM').
 * @returns {Promise<void>}
 */
const shutdown = async (signal) => {
  console.log(`\n[Main] Menerima sinyal ${signal}. Memulai shutdown...`);
  try {
    if (client.levelingSystem?.voiceManager?.shutdown) {
      client.levelingSystem.voiceManager.shutdown();
      console.log("[Shutdown] VoiceManager interval dihentikan.");
    } else {
      console.warn(
        "[Shutdown] VoiceManager atau metode shutdown tidak ditemukan.",
      );
    }

    console.log("[Shutdown] Menghancurkan koneksi Discord...");
    client.destroy();
    console.log("[Shutdown] Koneksi Discord dihancurkan.");

    if (mongoose.connection.readyState === 1) {
      console.log("[Shutdown] Menutup koneksi MongoDB...");
      await mongoose.connection.close(false);
      console.log("[Shutdown] Koneksi MongoDB ditutup.");
    } else {
      console.log("[Shutdown] Koneksi MongoDB sudah tidak aktif.");
    }

    console.log("[Shutdown] Selesai.");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Error saat shutdown:", error);
    process.exit(1);
  }
};

/**
 * Mendaftarkan listener untuk sinyal SIGINT (biasanya dari Ctrl+C).
 * @listens process#SIGINT
 */
process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * Mendaftarkan listener untuk sinyal SIGTERM (biasanya dari sistem operasi atau process manager seperti pm2).
 * @listens process#SIGTERM
 */
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[Main] Bot sedang memulai...");
