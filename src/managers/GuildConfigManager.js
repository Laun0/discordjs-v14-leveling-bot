/**
 * @description Kelas yang bertanggung jawab untuk mengelola pengambilan, caching,
 *              pembaruan, dan penghapusan data konfigurasi spesifik server (guild)
 *              yang disimpan di database MongoDB. Menggunakan CacheManager untuk optimasi.
 * @requires ../database/schemas/GuildConfig - Skema Mongoose untuk konfigurasi guild.
 * @requires ../core/LevelingSystem - (tipe parameter) Untuk akses instance dan emit event.
 * @requires ./CacheManager - (tipe parameter) Untuk interaksi dengan cache.
 */

const GuildConfig = require("../database/schemas/GuildConfig");

/**
 * @class GuildConfigManager
 * @classdesc Mengelola siklus hidup data konfigurasi untuk setiap server Discord.
 *            Menyediakan metode terpusat untuk mengakses dan memodifikasi pengaturan server,
 *            dengan lapisan caching untuk mengurangi beban database.
 * @param {import('../core/LevelingSystem')} system - Instance LevelingSystem utama.
 * @param {import('./CacheManager')} cacheManager - Instance CacheManager yang digunakan.
 * @param {object} [defaultConfig={}] - Objek konfigurasi default mentah yang akan digunakan jika server belum memiliki konfigurasi di DB.
 * @throws {Error} Jika `system` atau `cacheManager` tidak disediakan.
 */
class GuildConfigManager {
  constructor(system, cacheManager, defaultConfig = {}) {
    if (!system || !cacheManager) {
      throw new Error(
        "[GuildConfigManager] System dan CacheManager diperlukan.",
      );
    }
    /**
     * Referensi ke instance LevelingSystem utama.
     * @type {import('../core/LevelingSystem')}
     * @private
     */
    this.system = system;
    /**
     * Referensi ke instance CacheManager.
     * @type {import('./CacheManager')}
     * @private
     */
    this.cacheManager = cacheManager;
    /**
     * Objek konfigurasi default yang sudah dinormalisasi.
     * Digunakan sebagai basis dan fallback.
     * @type {object}
     * @private
     */
    this.defaultConfig = this._normalizeConfig(defaultConfig);
    console.log(
      "[GuildConfigManager] Siap. Konfigurasi default dinormalisasi.",
    );
  }

  /**
   * Menormalisasi objek konfigurasi mentah (dari DB atau default) untuk memastikan
   * struktur data konsisten saat digunakan dalam aplikasi (misalnya, mengubah objek menjadi Map,
   * memastikan tipe data, memvalidasi enum).
   * @method _normalizeConfig
   * @param {object} config - Objek konfigurasi mentah.
   * @returns {object} Objek konfigurasi yang sudah dinormalisasi.
   * @private
   */
  _normalizeConfig(config) {
    if (!config) return {};

    const normalized = { ...config };

    normalized.roleMultipliers = new Map(
      Object.entries(config.roleMultipliers || {}),
    );
    normalized.channelMultipliers = new Map(
      Object.entries(config.channelMultipliers || {}),
    );
    normalized.levelRoles = new Map(Object.entries(config.levelRoles || {}));

    normalized.ignoredRoles = Array.isArray(config.ignoredRoles)
      ? config.ignoredRoles
      : [];
    normalized.ignoredChannels = Array.isArray(config.ignoredChannels)
      ? config.ignoredChannels
      : [];

    normalized.xpPerMessage = Number(
      config.xpPerMessage ?? this.defaultConfig?.xpPerMessage ?? 15,
    );
    normalized.xpPerMinuteVoice = Number(
      config.xpPerMinuteVoice ?? this.defaultConfig?.xpPerMinuteVoice ?? 5,
    );
    normalized.messageCooldownSeconds = Number(
      config.messageCooldownSeconds ??
        this.defaultConfig?.messageCooldownSeconds ??
        60,
    );
    normalized.levelUpMessageEnabled = config.levelUpMessageEnabled !== false;
    normalized.enablePenaltySystem = config.enablePenaltySystem === true;
    normalized.leaderboardStyle = ["card", "text"].includes(
      config.leaderboardStyle,
    )
      ? config.leaderboardStyle
      : "card";

    const validStrategies = ["keep_all", "highest_only", "remove_previous"];
    normalized.roleRemovalStrategy = validStrategies.includes(
      config.roleRemovalStrategy,
    )
      ? config.roleRemovalStrategy
      : "keep_all";

    return normalized;
  }

  /**
   * Mengambil konfigurasi untuk server (guild) tertentu.
   * Prioritas: Cache -> Database -> Default Config.
   * Hasilnya akan disimpan di cache jika diambil dari DB atau default.
   * @method getConfig
   * @param {string} guildId - ID server Discord yang konfigurasinya ingin diambil.
   * @returns {Promise<object>} Sebuah Promise yang resolve dengan objek konfigurasi
   *          server yang sudah dinormalisasi dan merupakan salinan data.
   * @throws {Error} Jika `guildId` tidak disediakan.
   * @async
   */
  async getConfig(guildId) {
    if (!guildId)
      throw new Error(
        "[GuildConfigManager] guildId diperlukan untuk getConfig.",
      );

    const cacheKey = `config-${guildId}`;
    let cachedConfig = this.cacheManager.get(cacheKey);

    if (cachedConfig) {
      return { ...cachedConfig };
    }

    const dbConfig = await GuildConfig.findOne({ guildId }).lean();

    let finalConfig;
    if (!dbConfig) {
      finalConfig = { ...this.defaultConfig, guildId };
    } else {
      finalConfig = this._normalizeConfig({
        ...this.defaultConfig,
        ...dbConfig,
        guildId,
      });
    }

    this.cacheManager.set(cacheKey, finalConfig, 1800);

    return { ...finalConfig };
  }

  /**
   * Memperbarui (atau membuat jika belum ada) konfigurasi untuk server tertentu di database.
   * Data yang diberikan (`newSettings`) akan di-merge dengan konfigurasi yang ada.
   * Secara otomatis mengonversi Map ke Object sebelum menyimpan ke DB dan menormalisasi kembali hasilnya.
   * Mengupdate cache setelah berhasil menyimpan ke DB dan meng-emit event `configUpdated`.
   * @method updateConfig
   * @param {string} guildId - ID server Discord yang konfigurasinya akan diperbarui.
   * @param {object} newSettings - Objek berisi pengaturan baru yang akan diterapkan.
   *                                Kunci harus sesuai dengan field di skema `GuildConfig`.
   *                                Nilai Map dapat berupa Map atau Object.
   * @returns {Promise<object>} Sebuah Promise yang resolve dengan objek konfigurasi server yang sudah diperbarui dan dinormalisasi.
   * @throws {Error} Jika `guildId` atau `newSettings` tidak disediakan, atau terjadi error saat interaksi database.
   * @fires LevelingSystem#configUpdated
   * @async
   */
  async updateConfig(guildId, newSettings) {
    if (!guildId || !newSettings)
      throw new Error(
        "[GuildConfigManager] guildId dan newSettings diperlukan untuk updateConfig.",
      );

    try {
      const updateData = { ...newSettings };
      const mapFields = ["roleMultipliers", "channelMultipliers", "levelRoles"];
      mapFields.forEach((field) => {
        if (updateData[field] instanceof Map) {
          updateData[field] = Object.fromEntries(updateData[field]);
        } else if (updateData[field] == null) {
          delete updateData[field];
        }
      });

      const validStrategies = ["keep_all", "highest_only", "remove_previous"];
      if (
        updateData.roleRemovalStrategy &&
        !validStrategies.includes(updateData.roleRemovalStrategy)
      ) {
        console.warn(
          `[GuildConfigManager] Nilai tidak valid untuk roleRemovalStrategy: ${updateData.roleRemovalStrategy}. Update field ini dilewati.`,
        );
        delete updateData.roleRemovalStrategy;
      }
      const validStyles = ["card", "text"];
      if (
        updateData.leaderboardStyle &&
        !validStyles.includes(updateData.leaderboardStyle)
      ) {
        console.warn(
          `[GuildConfigManager] Nilai tidak valid untuk leaderboardStyle: ${updateData.leaderboardStyle}. Update field ini dilewati.`,
        );
        delete updateData.leaderboardStyle;
      }

      const updatedConfigLean = await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: updateData },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      ).lean();

      if (!updatedConfigLean) {
        throw new Error(
          "Gagal mendapatkan hasil konfigurasi setelah operasi findOneAndUpdate.",
        );
      }

      const finalConfig = this._normalizeConfig({
        ...this.defaultConfig,
        ...updatedConfigLean,
        guildId,
      });
      const cacheKey = `config-${guildId}`;
      this.cacheManager.set(cacheKey, finalConfig, 1800);

      console.log(
        `[GuildConfigManager] Konfigurasi berhasil diperbarui untuk guild ${guildId}.`,
      );

      /**
       * Event dipicu setelah konfigurasi guild berhasil diperbarui di database dan cache.
       * @event LevelingSystem#configUpdated
       * @type {object}
       * @property {string} guildId - ID guild yang konfigurasinya diperbarui.
       * @property {object} newConfig - Objek konfigurasi baru yang sudah dinormalisasi.
       */
      this.system.emit("configUpdated", {
        guildId,
        newConfig: { ...finalConfig },
      });

      return { ...finalConfig };
    } catch (error) {
      console.error(
        `[GuildConfigManager] Gagal update konfigurasi untuk guild ${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(`Failed to update config for ${guildId}: ${error.message}`),
      );
      throw error;
    }
  }

  /**
   * Menghapus data konfigurasi kustom untuk server tertentu dari database.
   * Ini akan menyebabkan server tersebut kembali menggunakan `defaultConfig`.
   * Juga menghapus entri konfigurasi dari cache. Meng-emit event `configDeleted`.
   * @method deleteConfig
   * @param {string} guildId - ID server Discord yang konfigurasinya akan dihapus.
   * @returns {Promise<boolean>} Sebuah Promise yang resolve dengan `true` jika konfigurasi kustom berhasil dihapus,
   *          `false` jika tidak ada konfigurasi kustom untuk dihapus atau terjadi error.
   * @fires LevelingSystem#configDeleted
   * @async
   */
  async deleteConfig(guildId) {
    if (!guildId) return false;
    try {
      const result = await GuildConfig.deleteOne({ guildId });

      const cacheKey = `config-${guildId}`;
      this.cacheManager.del(cacheKey);

      if (result.deletedCount > 0) {
        console.log(
          `[GuildConfigManager] Konfigurasi kustom dihapus dari DB untuk guild ${guildId}.`,
        );
        /**
         * Event dipicu setelah konfigurasi kustom guild berhasil dihapus dari database.
         * @event LevelingSystem#configDeleted
         * @type {object}
         * @property {string} guildId - ID guild yang konfigurasinya dihapus.
         */
        this.system.emit("configDeleted", { guildId });
        return true;
      } else {
        console.log(
          `[GuildConfigManager] Tidak ada konfigurasi kustom untuk dihapus di guild ${guildId}.`,
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[GuildConfigManager] Gagal menghapus konfigurasi untuk guild ${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(`Failed to delete config for ${guildId}: ${error.message}`),
      );
      return false;
    }
  }
}

module.exports = GuildConfigManager;
