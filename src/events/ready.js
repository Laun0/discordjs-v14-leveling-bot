/**
 * @description Event handler untuk event 'ready' dari Discord Client.
 *              Menjalankan tugas-tugas setelah bot berhasil login dan siap,
 *              seperti menampilkan log konfirmasi, mengatur status bot,
 *              dan mendaftarkan/menyegarkan slash commands.
 * @requires discord.js Events, REST, Routes, ActivityType
 * @requires dotenv process.env.DISCORD_TOKEN, process.env.CLIENT_ID, process.env.GUILD_ID
 */

const { Events, REST, Routes, ActivityType } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/**
 * @module readyEvent
 * @property {Events} name - Nama event Discord.js (Events.ClientReady).
 * @property {boolean} once - Menandakan bahwa event ini hanya dijalankan sekali.
 * @property {boolean} discordEvent - Menandakan ini adalah event dari Discord Client.
 * @property {function} execute - Fungsi yang akan dijalankan saat event 'ready' dipicu.
 */
module.exports = {
  name: Events.ClientReady,
  once: true,
  discordEvent: true,
  /**
   * Handler untuk event ClientReady. Dipanggil saat bot berhasil login dan siap.
   * Mengatur status bot dan mendaftarkan slash commands.
   * @function execute
   * @param {import('discord.js').Client} client - Instance Discord Client yang sudah siap.
   * @async
   */
  async execute(client) {
    if (!client.user) {
      console.error("[Ready] Client user tidak ditemukan saat event ready!");
      return;
    }
    console.log(
      `[Ready] Logged in as ${client.user.tag} (ID: ${client.user.id})`,
    );
    console.log(
      `[Ready] Bot siap melayani di ${client.guilds.cache.size} server.`,
    );

    try {
      client.user.setPresence({
        activities: [{ name: `Level Pengguna`, type: ActivityType.Watching }],
        status: "online",
      });
      console.log("[Ready] Status bot berhasil diatur.");
    } catch (error) {
      console.error("[Ready] Gagal mengatur status bot:", error);
    }

    if (!TOKEN || !CLIENT_ID) {
      console.error(
        "[DeployCmd] TOKEN atau CLIENT_ID tidak ditemukan di environment variables. Lewati deploy commands.",
      );
      return;
    }

    try {
      console.log(
        "[DeployCmd] Memulai refresh slash commands (/) application.",
      );
      const rest = new REST({ version: "10" }).setToken(TOKEN);

      if (!client.levelingSystem || !client.levelingSystem.commands) {
        console.error(
          "[DeployCmd] LevelingSystem atau koleksi command tidak ditemukan di client. Tidak bisa deploy.",
        );
        return;
      }
      const commandData = client.levelingSystem.commands.map((cmd) =>
        cmd.data.toJSON(),
      );
      console.log(
        `[DeployCmd] Mengumpulkan ${commandData.length} command(s) untuk di-deploy.`,
      );

      if (commandData.length === 0) {
        console.log("[DeployCmd] Tidak ada command untuk di-deploy.");
        return;
      }

      if (GUILD_ID) {
        console.log(`[DeployCmd] Melakukan deploy ke Guild ID: ${GUILD_ID}`);
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
          body: commandData,
        });
        console.log(
          `[DeployCmd] Berhasil me-refresh ${commandData.length} slash command(s) untuk guild ${GUILD_ID}.`,
        );
      } else {
        console.log(
          `[DeployCmd] Melakukan deploy global... (propagasi mungkin butuh waktu)`,
        );
        await rest.put(Routes.applicationCommands(CLIENT_ID), {
          body: commandData,
        });
        console.log(
          `[DeployCmd] Berhasil me-refresh ${commandData.length} slash command(s) secara global.`,
        );
      }
    } catch (error) {
      console.error(
        "[DeployCmd] Gagal me-refresh application (/) commands:",
        error,
      );
      client.levelingSystem?.emit(
        "error",
        new Error(`Command deployment failed: ${error.message}`),
      );
    }
  },
};
