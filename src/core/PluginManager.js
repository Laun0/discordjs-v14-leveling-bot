/**
 * @description Kelas yang bertanggung jawab untuk mengelola siklus hidup plugin
 *              dalam sistem leveling. Menangani registrasi plugin, dan meneruskan
 *              event-event relevan dari LevelingSystem ke metode handler yang sesuai
 *              di dalam setiap plugin yang terdaftar.
 * @requires ./LevelingSystem - (tipe parameter) Untuk mendapatkan instance LevelingSystem dan mendaftarkan listener event.
 */

/**
 * @class PluginManager
 * @classdesc Mengelola koleksi plugin yang aktif dan berfungsi sebagai jembatan
 *            antara event internal LevelingSystem dan logika kustom dalam plugin.
 * @param {import('./LevelingSystem')} system - Instance LevelingSystem utama yang aktif.
 * @throws {Error} Jika instance `system` tidak disediakan saat konstruksi.
 */
class PluginManager {
  constructor(system) {
    if (!system)
      throw new Error("[PluginManager] Instance LevelingSystem diperlukan.");
    /**
     * Referensi ke instance LevelingSystem utama.
     * @type {import('./LevelingSystem')}
     * @private
     */
    this.system = system;
    /**
     * Array yang menyimpan semua instance plugin yang berhasil didaftarkan dan aktif.
     * @type {Array<object>}
     * @private
     */
    this.plugins = [];
    this._registerPluginEventHandlers();
    console.log("[PluginManager] Siap.");
  }

  /**
   * Mendaftarkan sebuah instance plugin ke dalam manager.
   * Memvalidasi bahwa plugin memiliki metode `register` dan memanggilnya,
   * memberikan akses ke LevelingSystem. Plugin yang gagal mendaftar tidak akan ditambahkan.
   * @method register
   * @param {object} pluginInstance - Instance dari kelas plugin yang akan didaftarkan.
   *                                  Harus memiliki metode `register(system)`.
   *                                  Sebaiknya juga memiliki properti `name` untuk logging.
   */
  register(pluginInstance) {
    if (!pluginInstance || typeof pluginInstance.register !== "function") {
      const name = pluginInstance?.constructor?.name || "Plugin tidak dikenal";
      console.error(
        `[PluginManager] Gagal mendaftarkan plugin '${name}' - metode 'register' tidak ditemukan atau bukan fungsi.`,
      );
      return;
    }

    const pluginName =
      pluginInstance.name ||
      pluginInstance.constructor.name ||
      "Plugin Tanpa Nama";
    try {
      pluginInstance.register(this.system);
      this.plugins.push(pluginInstance);
      console.log(
        `[PluginManager] Plugin '${pluginName}' berhasil didaftarkan.`,
      );
    } catch (error) {
      console.error(
        `[PluginManager] Error saat mendaftarkan plugin '${pluginName}':`,
        error,
      );
    }
  }

  /**
   * Mendaftarkan listener internal pada event-event yang di-emit oleh LevelingSystem.
   * Ketika event terpicu, metode ini akan meneruskannya ke semua plugin terdaftar
   * yang memiliki metode handler yang sesuai (dengan format `onEventName`).
   * @method _registerPluginEventHandlers
   * @private
   */
  _registerPluginEventHandlers() {
    const eventsToForward = [
      "xpGained",
      "xpLost",
      "levelUp",
      "levelDown",
      "roleAwarded",
      "roleRemoved",
      "configUpdated",
      "configDeleted",
      "userLevelReset",
      "guildLevelsReset",
    ];

    eventsToForward.forEach((eventName) => {
      this.system.on(eventName, (data) => {
        const handlerMethodName = `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`;

        this.plugins.forEach((plugin) => {
          if (typeof plugin[handlerMethodName] === "function") {
            try {
              plugin[handlerMethodName](data);
            } catch (error) {
              const pluginName =
                plugin.name || plugin.constructor.name || "Plugin Tanpa Nama";
              console.error(
                `[PluginManager] Error pada plugin '${pluginName}' saat menangani event '${eventName}':`,
                error,
              );
            }
          }
        });
      });
    });
    console.log(
      `[PluginManager] Event forwarders untuk ${eventsToForward.length} event telah disiapkan.`,
    );
  }

  /**
   * Mengembalikan array berisi nama-nama dari semua plugin yang saat ini terdaftar.
   * Berguna untuk diagnostik atau menampilkan daftar plugin aktif.
   * @method getRegisteredPluginNames
   * @returns {string[]} Array string nama plugin. Menggunakan properti `name` plugin jika ada,
   *                   jika tidak menggunakan nama constructor, atau 'Plugin Tanpa Nama' sebagai fallback.
   */
  getRegisteredPluginNames() {
    return this.plugins.map(
      (p) => p.name || p.constructor.name || "Plugin Tanpa Nama",
    );
  }
}

module.exports = PluginManager;
