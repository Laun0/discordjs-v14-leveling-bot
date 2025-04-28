/**
 * @description Mengelola pelacakan waktu pengguna di voice channel dan memicu
 *              pemberian XP suara secara periodik serta saat pengguna keluar
 *              atau menjadi tidak valid (misalnya, di-deafen).
 * @requires discord.js Collection, VoiceState
 * @requires ../core/LevelingSystem - (tipe parameter) Untuk akses instance dan emit event.
 * @requires ./XPManager - (tipe parameter) Untuk memproses pemberian XP suara.
 */

const { Collection, VoiceState } = require("discord.js");

/**
 * @class VoiceManager
 * @classdesc Melacak pengguna yang aktif (tidak di-deafen/suppressed) di voice channel
 *            dan secara berkala atau saat event tertentu (leave/deafen) memanggil XPManager
 *            untuk memberikan XP berdasarkan durasi.
 */
class VoiceManager {
  /**
   * Membuat instance VoiceManager.
   * @constructor
   * @param {import('../core/LevelingSystem')} system - Instance LevelingSystem utama.
   * @param {import('./XPManager')} xpManager - Instance XPManager untuk memproses XP.
   * @throws {Error} Jika `system` atau `xpManager` tidak disediakan.
   */
  constructor(system, xpManager) {
    if (!system || !xpManager) {
      throw new Error("[VoiceManager] System dan XPManager diperlukan.");
    }
    /**
     * Referensi ke instance LevelingSystem utama.
     * @type {import('../core/LevelingSystem')}
     * @private
     */
    this.system = system;
    /**
     * Referensi ke instance XPManager.
     * @type {import('./XPManager')}
     * @private
     */
    this.xpManager = xpManager;
    /**
     * Koleksi untuk menyimpan timestamp (dalam milidetik) saat pengguna
     * terakhir kali mulai dihitung valid untuk mendapatkan XP suara.
     * Kunci: string format "guildId-userId".
     * Value: number (timestamp Date.now()).
     * @type {Collection<string, number>}
     * @private
     */
    this.voiceJoinTimes = new Collection();
    /**
     * ID dari interval timer Node.js yang digunakan untuk pengecekan periodik.
     * @type {NodeJS.Timeout|null}
     * @private
     */
    this.xpInterval = null;
    /**
     * Interval waktu (dalam menit) untuk memberikan XP suara secara otomatis.
     * @type {number}
     * @private
     */
    this.intervalMinutes = 5;
    /**
     * Interval waktu (dalam milidetik) yang dihitung dari `intervalMinutes`.
     * @type {number}
     * @private
     */
    this.intervalMillis = this.intervalMinutes * 60 * 1000;

    this._startInterval();
    console.log(
      `[VoiceManager] Siap. Interval XP suara: ${this.intervalMinutes} menit.`,
    );
  }

  /**
   * Memulai atau me-restart interval timer untuk {@link checkVoiceActivity}.
   * Menghentikan interval yang sudah ada jika dipanggil kembali.
   * @method _startInterval
   * @private
   */
  _startInterval() {
    if (this.xpInterval) clearInterval(this.xpInterval);
    this.xpInterval = setInterval(() => {
      this.checkVoiceActivity().catch((error) => {
        console.error(
          "[VoiceManager] Error dalam interval pengecekan aktivitas suara:",
          error,
        );
        this.system.emit(
          "error",
          new Error(`Voice check interval error: ${error.message}`),
        );
      });
    }, this.intervalMillis);
  }

  /**
   * Memproses dan memicu pemberian XP untuk durasi yang terakumulasi
   * saat pengguna keluar dari voice channel atau statusnya menjadi tidak valid (deafen/suppress).
   * Hanya memberikan XP jika durasi melebihi batas minimal (misalnya 10 detik).
   * @method _processXpGainOnExit
   * @param {string} guildId - ID Guild.
   * @param {string} userId - ID User.
   * @param {number} joinTime - Timestamp (ms) saat pengguna mulai dihitung valid.
   * @param {string} reason - Alasan mengapa fungsi ini dipanggil (misal: 'leave', 'deafen').
   * @private
   * @async
   */
  async _processXpGainOnExit(guildId, userId, joinTime, reason) {
    const now = Date.now();
    const durationMillis = now - joinTime;

    if (durationMillis > 10000) {
      await this.xpManager.handleVoiceXP(guildId, userId, durationMillis);
    }
  }

  /**
   * Handler utama untuk event `voiceStateUpdate` Discord.js.
   * Menganalisis perubahan status suara pengguna dan memperbarui
   * status pelacakan waktu (`voiceJoinTimes`) serta memicu pemrosesan XP
   * jika pengguna menjadi tidak valid atau valid kembali.
   * @method handleVoiceStateUpdate
   * @param {VoiceState} oldState - Objek VoiceState sebelum perubahan.
   * @param {VoiceState} newState - Objek VoiceState setelah perubahan.
   * @returns {Promise<void>}
   * @async
   */
  async handleVoiceStateUpdate(oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;
    const member = newState.member;

    if (!member || member.user.bot) return;

    const key = `${guildId}-${userId}`;
    const joinTime = this.voiceJoinTimes.get(key);

    const isValidForXp =
      newState.channelId && !newState.deaf && !newState.suppress;
    const wasValidForXp =
      oldState.channelId && !oldState.deaf && !oldState.suppress;

    // --- Logika Transisi State ---
    if (!wasValidForXp && isValidForXp) {
      if (!joinTime) this.voiceJoinTimes.set(key, Date.now());
    } else if (wasValidForXp && !isValidForXp) {
      if (joinTime) {
        let reason = "leave";
        if (newState.channelId) {
          if (newState.deaf) reason = "deafen";
          else if (newState.suppress) reason = "suppress";
          else reason = "invalid_state";
        }
        await this._processXpGainOnExit(guildId, userId, joinTime, reason);
        this.voiceJoinTimes.delete(key);
      }
    }
  }

  /**
   * Fungsi yang dijalankan secara periodik oleh interval timer.
   * Memeriksa semua pengguna yang sedang dilacak di `voiceJoinTimes`.
   * Jika pengguna masih valid, memberikan XP untuk durasi interval tersebut dan mereset timer join.
   * Jika pengguna menjadi tidak valid, memproses XP terakhir dan menghapusnya dari pelacakan.
   * @method checkVoiceActivity
   * @private
   * @async
   */
  async checkVoiceActivity() {
    const now = Date.now();

    for (const [key, joinTime] of this.voiceJoinTimes.entries()) {
      const [guildId, userId] = key.split("-");
      try {
        const guild = this.system.client.guilds.cache.get(guildId);
        if (!guild) {
          this.voiceJoinTimes.delete(key);
          continue;
        }
        const member = await guild.members.fetch(userId).catch(() => null);

        const isValid =
          member &&
          !member.user.bot &&
          member.voice.channel &&
          !member.voice.deaf &&
          !member.voice.suppress;

        if (!isValid) {
          let reason = "check_invalid";
          if (!member) reason = "check_not_found";
          else if (!member.voice.channel) reason = "check_left";
          else if (member.voice.deaf) reason = "check_deafen";
          else if (member.voice.suppress) reason = "check_suppress";
          await this._processXpGainOnExit(guildId, userId, joinTime, reason);
          this.voiceJoinTimes.delete(key);
        } else {
          const durationSinceLastCheckOrJoin = now - joinTime;
          if (durationSinceLastCheckOrJoin >= this.intervalMillis * 0.95) {
            await this.xpManager.handleVoiceXP(
              guildId,
              userId,
              this.intervalMillis,
            );

            this.voiceJoinTimes.set(key, now);
          }
        }
      } catch (error) {
        console.error(
          `[VoiceManager] Error saat cek aktivitas untuk ${key}:`,
          error,
        );
        this.system.emit(
          "error",
          new Error(`Voice check error for ${key}: ${error.message}`),
        );
        // this.voiceJoinTimes.delete(key);
      }
    }
  }

  /**
   * Membersihkan interval timer dan memproses XP terakhir untuk pengguna aktif
   * saat bot dimatikan secara graceful.
   * @method shutdown
   */
  shutdown() {
    if (this.xpInterval) {
      clearInterval(this.xpInterval);
      this.xpInterval = null;
      console.log(
        "[VoiceManager] Interval pengecekan aktivitas suara dihentikan.",
      );

      console.log("[VoiceManager] Memproses XP terakhir sebelum shutdown...");
      const shutdownPromises = [];
      const now = Date.now();

      for (const [key, joinTime] of new Map(this.voiceJoinTimes).entries()) {
        const [guildId, userId] = key.split("-");
        const durationMillis = now - joinTime;
        if (durationMillis > 1000) {
          shutdownPromises.push(
            this.xpManager
              .handleVoiceXP(guildId, userId, durationMillis)
              .catch((e) =>
                console.error(
                  `[VoiceManager] Error proses XP shutdown u/ ${key}: ${e.message}`,
                ),
              ),
          );
        }
      }
      Promise.allSettled(shutdownPromises).then((results) => {
        const fulfilled = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const rejected = results.length - fulfilled;
        console.log(
          `[VoiceManager] Selesai memproses XP terakhir (${fulfilled} sukses, ${rejected} gagal).`,
        );
      });
      this.voiceJoinTimes.clear();
    }
  }
}

module.exports = VoiceManager;
