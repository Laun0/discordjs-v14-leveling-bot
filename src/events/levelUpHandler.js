/**
 * @description Event handler untuk event custom 'levelUp' dari LevelingSystem.
 *              Bertugas mengirimkan notifikasi (pesan teks dan/atau kartu gambar)
 *              ke channel yang sesuai atau DM pengguna saat mereka naik level.
 * @requires discord.js EmbedBuilder, TextChannel
 * @requires ../core/LevelingSystem (tipe parameter)
 * @requires ../core/LevelingManager (implisit melalui levelingSystem)
 * @requires ../managers/GuildConfigManager (implisit melalui levelingSystem)
 * @requires ../utils/CardGenerator (implisit melalui levelingSystem)
 */

const { EmbedBuilder, TextChannel } = require("discord.js");

/**
 * @module levelUpHandler
 * @property {string} name - Nama event custom yang didengarkan ('levelUp').
 * @property {boolean} levelingEvent - Menandakan ini adalah event dari LevelingSystem.
 * @property {function} execute - Fungsi yang dijalankan saat event 'levelUp' diterima.
 */
module.exports = {
  name: "levelUp",
  levelingEvent: true,
  /**
   * Handler untuk event 'levelUp' yang di-emit oleh LevelingManager.
   * Mengirimkan notifikasi ke channel yang sesuai atau DM.
   * Mengambil konfigurasi server untuk menentukan channel tujuan dan format pesan.
   * Membuat dan mengirim kartu level up jika CardGenerator tersedia dan berhasil.
   * @function execute
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @param {object} data - Data event level up.
   * @param {string} data.guildId - ID Guild tempat level up terjadi.
   * @param {string} data.userId - ID User yang naik level.
   * @param {number} data.oldLevel - Level pengguna sebelumnya.
   * @param {number} data.newLevel - Level baru yang dicapai pengguna.
   * @param {object} data.user - Data pengguna lengkap dari database setelah level up ({ xp, level, createdAt, updatedAt, totalMessages, totalVoiceDurationMillis, ... }).
   * @async
   */
  async execute(levelingSystem, data) {
    try {
      const config = await levelingSystem.guildConfigManager.getConfig(
        data.guildId,
      );

      if (!config.levelUpMessageEnabled) {
        return;
      }

      const guild = levelingSystem.client.guilds.cache.get(data.guildId);
      if (!guild) {
        console.warn(
          `[LevelUpHandler] Guild ${data.guildId} tidak ditemukan saat mengirim notifikasi level up.`,
        );
        return;
      }

      const user = await levelingSystem.client.users
        .fetch(data.userId)
        .catch(() => null);
      if (!user) {
        console.warn(
          `[LevelUpHandler] User ${data.userId} tidak dapat di-fetch untuk notifikasi level up.`,
        );
        return;
      }

      let targetChannel = null;
      let sendMethod = "channel";

      if (config.levelUpChannelId) {
        const configuredChannel = guild.channels.cache.get(
          config.levelUpChannelId,
        );
        if (configuredChannel instanceof TextChannel) {
          const botPermissions = configuredChannel.permissionsFor(
            levelingSystem.client.user.id,
          );
          if (
            botPermissions?.has([
              "ViewChannel",
              "SendMessages",
              "EmbedLinks",
              "AttachFiles",
            ])
          ) {
            targetChannel = configuredChannel;
          } else {
            console.warn(
              `[LevelUpHandler] Bot tidak punya izin kirim di channel notifikasi (${config.levelUpChannelId}) guild ${data.guildId}. Mencari fallback...`,
            );
          }
        } else {
          console.warn(
            `[LevelUpHandler] Channel notifikasi (${config.levelUpChannelId}) di guild ${data.guildId} bukan TextChannel.`,
          );
        }
      }

      if (!targetChannel) {
        if (guild.systemChannel) {
          const botPermissions = guild.systemChannel.permissionsFor(
            levelingSystem.client.user.id,
          );
          if (
            botPermissions?.has([
              "ViewChannel",
              "SendMessages",
              "EmbedLinks",
              "AttachFiles",
            ])
          ) {
            targetChannel = guild.systemChannel;
          }
        }
        if (!targetChannel) {
          console.warn(
            `[LevelUpHandler] Tidak ada channel notifikasi valid (spesifik/sistem) di guild ${data.guildId}. Notifikasi tidak dikirim.`,
          );
          return;
        }
      }

      const rank = await levelingSystem.levelingManager.getUserRank(
        data.guildId,
        data.userId,
      );

      const messageFormat =
        config.levelUpMessageFormat ||
        "Selamat {userMention}! 🎉 Kamu telah naik ke **Level {level}**!";
      const replacements = {
        "{userMention}": `<@${data.userId}>`,
        "{username}": user.username,
        "{userId}": data.userId,
        "{level}": data.newLevel,
        "{rank}": rank > 0 ? `#${rank}` : "N/A",
        "{guildName}": guild.name,
      };
      const levelUpMsgContent = messageFormat.replace(
        /{userMention}|{username}|{userId}|{level}|{rank}|{guildName}/g,
        (match) => replacements[match] || match,
      );

      const levelUpCardData = {
        username: user.username,
        avatarURL: user.displayAvatarURL({ extension: "png", size: 128 }),
        newLevel: data.newLevel,
      };
      let cardAttachment = null;
      try {
        cardAttachment = await levelingSystem.cardGenerator.createLevelUpCard(
          levelUpCardData,
          config,
        );
      } catch (cardError) {
        console.error(
          `[LevelUpHandler] Gagal membuat kartu level up untuk ${user.tag}:`,
          cardError,
        );
      }

      try {
        await targetChannel.send({
          content: levelUpMsgContent,
          files: cardAttachment ? [cardAttachment] : [],
          allowedMentions: { users: [data.userId], roles: [] },
        });
      } catch (sendError) {
        console.error(
          `[LevelUpHandler] Gagal mengirim pesan notifikasi ke ${sendMethod === "dm" ? "DM " + user.tag : "channel " + targetChannel.id}:`,
          sendError,
        );
      }
    } catch (error) {
      console.error(
        `[LevelUpHandler] Error memproses event levelUp untuk ${data.userId}@${data.guildId}:`,
        error,
      );
      levelingSystem.emit(
        "error",
        new Error(`Level up handler error: ${error.message}`),
      );
    }
  },
};
