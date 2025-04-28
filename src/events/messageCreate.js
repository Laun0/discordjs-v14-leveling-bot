/**
 * @description Event handler untuk event 'messageCreate' dari Discord Client.
 *              Event ini dipicu setiap kali ada pesan baru yang dibuat di channel
 *              yang dapat diakses oleh bot. Handler ini meneruskan pesan ke XPManager
 *              untuk diproses dan kemungkinan pemberian XP.
 * @requires discord.js Events
 * @requires ../core/LevelingSystem (tipe properti client)
 * @requires ../managers/XPManager (implisit melalui client.levelingSystem)
 */

const { Events } = require("discord.js");

/**
 * @module messageCreateEvent
 * @property {Events} name - Nama event Discord.js (Events.MessageCreate).
 * @property {boolean} discordEvent - Menandakan ini adalah event dari Discord Client.
 * @property {function} execute - Fungsi yang akan dijalankan saat event 'messageCreate' dipicu.
 */
module.exports = {
  name: Events.MessageCreate,
  discordEvent: true,
  /**
   * Handler untuk event MessageCreate.
   * Meneruskan objek pesan ke XPManager dalam LevelingSystem untuk diproses.
   * Penanganan filter awal (seperti bot, DM) dilakukan di dalam XPManager.
   * @function execute
   * @param {import('discord.js').Client & {levelingSystem: import('../core/LevelingSystem')}} client - Instance Discord Client, dengan properti levelingSystem terpasang.
   * @param {import('discord.js').Message} message - Objek Message yang baru dibuat.
   * @async
   */
  async execute(client, message) {
    if (!client.levelingSystem?.xpManager) {
      return;
    }

    try {
      await client.levelingSystem.xpManager.handleMessageXP(message);
    } catch (error) {
      console.error(
        "[MessageCreate] Error tidak tertangkap saat memproses XP pesan:",
        error,
      );

      client.levelingSystem.emit(
        "error",
        new Error(`Unhandled Message XP error: ${error.message}`),
      );
    }
  },
};
