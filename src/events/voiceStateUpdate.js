/**
 * @description Event handler untuk event 'voiceStateUpdate' dari Discord Client.
 *              Event ini dipicu ketika status suara pengguna (seperti join/leave channel,
 *              mute/unmute, deafen/undeafen) berubah. Handler ini meneruskan
 *              informasi state ke VoiceManager untuk diproses terkait pemberian XP suara.
 * @requires discord.js Events
 * @requires ../core/LevelingSystem (tipe properti client)
 * @requires ../managers/VoiceManager (implisit melalui client.levelingSystem)
 */

const { Events } = require("discord.js");

/**
 * @module voiceStateUpdateEvent
 * @property {Events} name - Nama event Discord.js (Events.VoiceStateUpdate).
 * @property {boolean} discordEvent - Menandakan ini adalah event dari Discord Client.
 * @property {function} execute - Fungsi yang akan dijalankan saat event 'voiceStateUpdate' dipicu.
 */
module.exports = {
  name: Events.VoiceStateUpdate,
  discordEvent: true,
  /**
   * Handler untuk event VoiceStateUpdate.
   * Meneruskan state suara lama dan baru ke VoiceManager di dalam LevelingSystem.
   * Melakukan filter awal untuk mencegah pemrosesan jika tidak ada perubahan state yang relevan dengan XP.
   * @function execute
   * @param {import('discord.js').Client & {levelingSystem: import('../core/LevelingSystem')}} client - Instance Discord Client dengan properti levelingSystem.
   * @param {import('discord.js').VoiceState} oldState - Status suara pengguna sebelum perubahan.
   * @param {import('discord.js').VoiceState} newState - Status suara pengguna setelah perubahan.
   * @async
   */
  async execute(client, oldState, newState) {
    if (!client.levelingSystem?.voiceManager) {
      return;
    }

    // Filter performa: Abaikan event jika tidak ada perubahan pada channel,
    // status deafen, atau status suppress (yang relevan untuk XP suara).
    // Perubahan mute diabaikan karena biasanya tidak memengaruhi XP.
    if (
      oldState.channelId === newState.channelId &&
      oldState.deaf === newState.deaf &&
      // oldState.mute === newState.mute &&
      oldState.suppress === newState.suppress
    ) {
      return;
    }

    try {
      await client.levelingSystem.voiceManager.handleVoiceStateUpdate(
        oldState,
        newState,
      );
    } catch (error) {
      console.error(
        "[VoiceStateUpdate] Error tidak tertangkap saat memproses status suara:",
        error,
      );

      client.levelingSystem.emit(
        "error",
        new Error(`Unhandled Voice State error: ${error.message}`),
      );
    }
  },
};
