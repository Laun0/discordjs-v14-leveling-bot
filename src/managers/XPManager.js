/**
 * @description Kelas yang mengelola logika perhitungan dan pemberian XP
 *              berdasarkan berbagai aktivitas pengguna seperti mengirim pesan dan berada di voice channel.
 *              Memperhitungkan konfigurasi spesifik server (rate XP, cooldown, multiplier, daftar abaikan)
 *              dan mengupdate statistik pengguna seperti total pesan dan durasi suara.
 * @requires discord.js Collection, Message
 * @requires ../database/schemas/UserLevel - Skema Mongoose untuk data level pengguna.
 * @requires ../core/LevelingSystem - (tipe parameter) Untuk akses instance dan dependensi lain.
 * @requires ../core/LevelingManager - (tipe parameter) Untuk memanggil penambahan/pengurangan XP utama.
 * @requires ./GuildConfigManager - (tipe parameter) Untuk mendapatkan konfigurasi server.
 */

const { Collection, Message } = require("discord.js");
const UserLevel = require("../database/schemas/UserLevel");

/**
 * @class XPManager
 * @classdesc Mengelola semua logika terkait perhitungan dan pemberian XP.
 *            Memvalidasi kondisi (cooldown, role/channel ignored), menghitung XP
 *            berdasarkan rate dan multiplier, memanggil LevelingManager untuk update
 *            XP/level utama, dan mengupdate statistik tambahan (totalMessages, totalVoiceDurationMillis)
 *            secara atomik menggunakan `$inc`.
 */
class XPManager {
  /**
   * Membuat instance XPManager.
   * @constructor
   * @param {import('../core/LevelingSystem')} system - Instance LevelingSystem utama.
   * @param {import('../core/LevelingManager')} levelingManager - Instance LevelingManager.
   * @param {import('./GuildConfigManager')} guildConfigManager - Instance GuildConfigManager.
   * @throws {Error} Jika salah satu dependency (system, levelingManager, guildConfigManager) tidak disediakan.
   */
  constructor(system, levelingManager, guildConfigManager) {
    if (!system || !levelingManager || !guildConfigManager) {
      throw new Error(
        "[XPManager] System, LevelingManager, dan GuildConfigManager diperlukan.",
      );
    }
    /** @type {import('../core/LevelingSystem')} @private */
    this.system = system;
    /** @type {import('../core/LevelingManager')} @private */
    this.levelingManager = levelingManager;
    /** @type {import('./GuildConfigManager')} @private */
    this.guildConfigManager = guildConfigManager;
    console.log("[XPManager] Siap.");
  }

  /**
   * Memproses pesan masuk untuk potensi pemberian XP.
   * Melakukan validasi (bot, DM, guild, content, member), memeriksa konfigurasi server
   * (ignored roles/channels, rate XP), memeriksa cooldown pesan, menghitung multiplier,
   * menghitung XP akhir, mengupdate `lastMessageTimestamp` dan `totalMessages` di DB,
   * lalu memanggil `LevelingManager.addXP` untuk penambahan XP/level.
   * @method handleMessageXP
   * @param {Message} message - Objek Message Discord.js yang diterima.
   * @returns {Promise<void>} Promise yang resolve setelah pemrosesan selesai (tidak mengembalikan nilai spesifik).
   * @async
   */
  async handleMessageXP(message) {
    if (
      message.author.bot ||
      !message.guild ||
      !message.content ||
      message.system ||
      !message.member
    )
      return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;
    const member = message.member;

    try {
      const config = await this.guildConfigManager.getConfig(guildId);

      const baseXpPerMessage = config.xpPerMessage ?? 0;
      if (baseXpPerMessage <= 0) return;

      if (config.ignoredChannels?.includes(channelId)) return;
      if (
        member.roles.cache.some((role) =>
          config.ignoredRoles?.includes(role.id),
        )
      )
        return;

      const userData = await this.levelingManager.getUserLevelData(
        guildId,
        userId,
      );
      const now = Date.now();
      const cooldownMillis = (config.messageCooldownSeconds ?? 60) * 1000;
      const lastTimestamp = userData?.lastMessageTimestamp ?? 0;
      if (now < lastTimestamp + cooldownMillis) return;

      let finalMultiplier = 1.0;

      if (
        config.roleMultipliers instanceof Map &&
        config.roleMultipliers.size > 0
      ) {
        let highestRoleMultiplier = 1.0;
        member.roles.cache.forEach((role) => {
          const multiplier = config.roleMultipliers.get(role.id);
          if (multiplier && multiplier > highestRoleMultiplier) {
            highestRoleMultiplier = multiplier;
          }
        });
        finalMultiplier *= highestRoleMultiplier;
      }

      if (
        config.channelMultipliers instanceof Map &&
        config.channelMultipliers.has(channelId)
      ) {
        finalMultiplier *= config.channelMultipliers.get(channelId) || 1.0;
      }
      finalMultiplier = Math.max(0, finalMultiplier);

      const gainedXP = Math.max(
        1,
        Math.floor(baseXpPerMessage * finalMultiplier),
      );

      const cacheKey = `level-${guildId}-${userId}`;
      try {
        await UserLevel.updateOne(
          { guildId, userId },
          {
            $set: { lastMessageTimestamp: now },
            $inc: { totalMessages: 1 },
          },
        );

        this.system.cacheManager.del(cacheKey);
      } catch (updateError) {
        console.error(
          `[XPManager] Error saat update timestamp/totalMessages untuk ${userId}@${guildId}:`,
          updateError,
        );
      }

      await this.levelingManager.addXP(guildId, userId, gainedXP, "message");
    } catch (error) {
      console.error(
        `[XPManager] Error saat memproses XP pesan untuk ${userId}@${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(`Message XP handling error: ${error.message}`),
      );
    }
  }

  /**
   * Memproses pemberian XP untuk durasi waktu yang dihabiskan di voice channel.
   * Dipanggil oleh VoiceManager. Melakukan validasi kelayakan (config, role/channel ignored, status member),
   * menghitung XP berdasarkan durasi dan multiplier, mengupdate `totalVoiceDurationMillis` di DB,
   * dan memanggil `LevelingManager.addXP` untuk penambahan XP/level.
   * @method handleVoiceXP
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @param {number} durationMillis - Durasi waktu di voice channel dalam **milidetik**.
   * @returns {Promise<void>} Promise yang resolve setelah pemrosesan selesai.
   * @async
   */
  async handleVoiceXP(guildId, userId, durationMillis) {
    const durationMinutes = durationMillis / (1000 * 60);
    if (durationMinutes <= 0) return;

    try {
      const config = await this.guildConfigManager.getConfig(guildId);
      const xpPerMinute = config.xpPerMinuteVoice ?? 0;
      if (xpPerMinute <= 0) return;

      const guild = this.system.client.guilds.cache.get(guildId);
      if (!guild) return;
      const member = await guild.members.fetch(userId).catch(() => null);

      if (
        !member ||
        member.user.bot ||
        member.roles.cache.some((role) =>
          config.ignoredRoles?.includes(role.id),
        ) ||
        member.voice.deaf ||
        member.voice.suppress ||
        (member.voice.channelId &&
          config.ignoredChannels?.includes(member.voice.channelId))
      ) {
        return;
      }

      const baseXP = durationMinutes * xpPerMinute;
      let finalMultiplier = 1.0;

      if (
        config.roleMultipliers instanceof Map &&
        config.roleMultipliers.size > 0
      ) {
        let highestRoleMultiplier = 1.0;
        member.roles.cache.forEach((role) => {
          const multiplier = config.roleMultipliers.get(role.id);
          if (multiplier && multiplier > highestRoleMultiplier) {
            highestRoleMultiplier = multiplier;
          }
        });
        finalMultiplier *= highestRoleMultiplier;
      }
      finalMultiplier = Math.max(0, finalMultiplier);
      const gainedXP = Math.max(1, Math.floor(baseXP * finalMultiplier));

      const cacheKey = `level-${guildId}-${userId}`;
      try {
        await UserLevel.updateOne(
          { guildId, userId },
          { $inc: { totalVoiceDurationMillis: Math.round(durationMillis) } },
        );

        this.system.cacheManager.del(cacheKey);
      } catch (updateError) {
        console.error(
          `[XPManager] Error saat update totalVoiceDuration untuk ${userId}@${guildId}:`,
          updateError,
        );
      }

      await this.levelingManager.addXP(guildId, userId, gainedXP, "voice");
    } catch (error) {
      console.error(
        `[XPManager] Error saat memproses XP suara untuk ${userId}@${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(`Voice XP handling error: ${error.message}`),
      );
    }
  }

  /**
   * Menerapkan pengurangan XP (penalty) kepada pengguna.
   * Hanya berjalan jika `enablePenaltySystem` diaktifkan dalam konfigurasi server.
   * Memanggil `LevelingManager.removeXP` untuk melakukan pengurangan.
   * @method applyPenalty
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @param {number} amount - Jumlah XP yang akan dikurangi (harus > 0).
   * @param {string} [reason="Pelanggaran aturan"] - Alasan mengapa penalty diberikan.
   * @returns {Promise<object|null>} Sebuah Promise yang resolve dengan objek data pengguna terbaru setelah pengurangan,
   *          atau `null` jika `amount` tidak positif, sistem penalty nonaktif, atau terjadi error.
   * @async
   */
  async applyPenalty(guildId, userId, amount, reason = "Pelanggaran aturan") {
    if (amount <= 0) return null;

    const config = await this.guildConfigManager.getConfig(guildId);
    if (!config.enablePenaltySystem) {
      console.log(
        `[XPManager] Sistem penalty dinonaktifkan di guild ${guildId}. Pengurangan XP dibatalkan.`,
      );
      return null;
    }

    console.warn(
      `[XPManager] Menerapkan penalty ${amount} XP ke ${userId}@${guildId}. Alasan: ${reason}`,
    );

    return this.levelingManager.removeXP(guildId, userId, amount, reason);
  }
}

module.exports = XPManager;
