/**
 * @description Kelas utama yang mengorkestrasi seluruh fungsionalitas sistem leveling.
 *              Menginisialisasi dan menyediakan akses ke semua manajer (Leveling, XP, Voice, Cache, GuildConfig, Plugin),
 *              utilitas (CardGenerator, Formatters), memuat commands dan plugins, serta meng-emit event internal.
 * @requires discord.js Client, Collection
 * @requires events EventEmitter
 * @requires mongoose (implisit, digunakan oleh manajer)
 * @requires path
 * @requires fs
 * @requires ./LevelingManager
 * @requires ../managers/XPManager
 * @requires ../managers/VoiceManager
 * @requires ../managers/CacheManager
 * @requires ../managers/GuildConfigManager
 * @requires ./PluginManager
 * @requires ../utils/CardGenerator
 * @requires ../utils/formatters
 */

const { Client, Collection } = require("discord.js");
const EventEmitter = require("events");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const LevelingManager = require("./LevelingManager");
const XPManager = require("../managers/XPManager");
const VoiceManager = require("../managers/VoiceManager");
const CacheManager = require("../managers/CacheManager");
const GuildConfigManager = require("../managers/GuildConfigManager");
const PluginManager = require("./PluginManager");
const CardGenerator = require("../utils/CardGenerator");
const formatters = require("../utils/formatters");

/**
 * @class LevelingSystem
 * @classdesc Kelas sentral yang mengelola semua komponen sistem leveling.
 *            Bertanggung jawab untuk inisialisasi manajer, memuat commands dan plugins,
 *            dan menyediakan titik akses terpusat ke fungsionalitas leveling.
 * @extends EventEmitter
 * @param {Client} client - Instance Discord.js Client yang aktif.
 * @param {object} options - Objek opsi konfigurasi untuk sistem leveling.
 * @param {string} options.mongoURI - URI koneksi MongoDB (wajib).
 * @param {object} [options.defaultGuildConfig={}] - Objek konfigurasi default untuk server baru.
 * @param {string} [options.pluginsPath] - Path kustom ke direktori plugins. Jika tidak ada, default ke `../plugins`.
 * @throws {Error} Jika `client` atau `options.mongoURI` tidak disediakan.
 */
class LevelingSystem extends EventEmitter {
  constructor(client, options = {}) {
    super();
    if (!client)
      throw new Error("[LevelingSystem] Discord.js Client diperlukan.");
    if (!options.mongoURI)
      throw new Error("[LevelingSystem] MongoDB URI diperlukan dalam opsi.");

    /**
     * Instance Discord Client yang digunakan oleh sistem.
     * @type {Client}
     * @public
     */
    this.client = client;
    /**
     * Objek opsi yang diberikan saat inisialisasi sistem.
     * @type {object}
     * @public
     */
    this.options = options;
    /**
     * Timestamp (ms) saat instance LevelingSystem dibuat.
     * @type {number}
     * @private
     */
    this.startTime = Date.now();

    /**
     * Instance CacheManager untuk caching data.
     * @type {CacheManager}
     * @public
     */
    this.cacheManager = new CacheManager();
    /**
     * Instance GuildConfigManager untuk mengelola konfigurasi per server.
     * @type {GuildConfigManager}
     * @public
     */
    this.guildConfigManager = new GuildConfigManager(
      this,
      this.cacheManager,
      options.defaultGuildConfig || {},
    );
    /**
     * Instance LevelingManager untuk mengelola data level dan logika inti.
     * @type {LevelingManager}
     * @public
     */
    this.levelingManager = new LevelingManager(
      this,
      this.cacheManager,
      this.guildConfigManager,
    );
    /**
     * Instance XPManager untuk logika perhitungan dan pemberian XP.
     * @type {XPManager}
     * @public
     */
    this.xpManager = new XPManager(
      this,
      this.levelingManager,
      this.guildConfigManager,
    );
    /**
     * Instance VoiceManager untuk melacak aktivitas suara dan XP suara.
     * @type {VoiceManager}
     * @public
     */
    this.voiceManager = new VoiceManager(this, this.xpManager);
    /**
     * Instance PluginManager untuk mengelola plugin kustom.
     * @type {PluginManager}
     * @public
     */
    this.pluginManager = new PluginManager(this);

    /**
     * Objek berisi fungsi utilitas pemformatan.
     * @type {object}
     * @property {function} formatNumber
     * @property {function} formatDuration
     * @public
     */
    this.formatters = formatters;
    /**
     * Instance CardGenerator untuk membuat gambar kartu.
     * @type {CardGenerator}
     * @public
     */
    this.cardGenerator = new CardGenerator(this.formatters);

    /**
     * Koleksi Discord.js untuk menyimpan semua slash command yang dimuat.
     * Kunci adalah nama command, value adalah objek command.
     * @type {Collection<string, object>}
     * @public
     */
    this.commands = new Collection();

    this._loadCommands(path.join(__dirname, "../commands"));
    this._loadPlugins(
      options.pluginsPath || path.join(__dirname, "../plugins"),
    );

    console.log(
      "[LevelingSystem] Konstruktor selesai. Siap untuk diinisialisasi.",
    );
  }

  /**
   * Memuat semua file slash command dari direktori yang ditentukan.
   * Hanya memuat file `.js` yang mengekspor properti `data` (SlashCommandBuilder) dan `execute` (fungsi).
   * Menyimpan command yang valid ke dalam `this.commands`.
   * @method _loadCommands
   * @param {string} commandsPath - Path absolut ke direktori berisi file command.
   * @private
   */
  _loadCommands(commandsPath) {
    console.log(`[CommandLoader] Memuat commands dari: ${commandsPath}`);
    if (!fs.existsSync(commandsPath)) {
      console.warn(
        `[CommandLoader] Direktori command tidak ditemukan di ${commandsPath}`,
      );
      return;
    }
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"));
    console.log(
      `[CommandLoader] Ditemukan ${commandFiles.length} file command.`,
    );

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);

        if (command.data?.name && typeof command.execute === "function") {
          this.commands.set(command.data.name, command);
        } else {
          console.warn(
            `[CommandLoader] Command di ${filePath} tidak valid (kurang 'data.name' atau 'execute').`,
          );
        }
      } catch (error) {
        console.error(`[CommandLoader] Gagal memuat command ${file}:`, error);
      }
    }
    console.log(
      `[CommandLoader] Selesai memuat ${this.commands.size} command(s).`,
    );
  }

  /**
   * Memuat semua file plugin dari direktori yang ditentukan.
   * Hanya memuat file `.js` yang mengekspor sebuah kelas dengan metode `register`.
   * Mendaftarkan instance plugin yang valid ke `this.pluginManager`.
   * @method _loadPlugins
   * @param {string} pluginsPath - Path absolut ke direktori berisi file plugin.
   * @private
   */
  _loadPlugins(pluginsPath) {
    console.log(`[PluginLoader] Memuat plugins dari: ${pluginsPath}`);
    if (!fs.existsSync(pluginsPath)) {
      console.warn(
        `[PluginLoader] Direktori plugin tidak ditemukan di ${pluginsPath}`,
      );
      return;
    }
    const pluginFiles = fs
      .readdirSync(pluginsPath)
      .filter((file) => file.endsWith(".js"));
    console.log(`[PluginLoader] Ditemukan ${pluginFiles.length} file plugin.`);

    for (const file of pluginFiles) {
      const pluginPath = path.join(pluginsPath, file);
      try {
        delete require.cache[require.resolve(pluginPath)];
        const PluginClass = require(pluginPath);

        if (
          typeof PluginClass === "function" &&
          typeof PluginClass.prototype.register === "function"
        ) {
          const pluginInstance = new PluginClass();
          this.pluginManager.register(pluginInstance);
        } else {
          console.warn(
            `[PluginLoader] File ${file} tidak mengekspor kelas plugin yang valid dengan metode 'register'.`,
          );
        }
      } catch (error) {
        console.error(`[PluginLoader] Gagal memuat plugin ${file}:`, error);
      }
    }
    console.log(`[PluginLoader] Selesai memuat plugins.`);
  }

  /**
   * Metode inisialisasi akhir untuk sistem leveling.
   * Dipanggil setelah koneksi database berhasil dibuat.
   * Dapat digunakan untuk tugas setup tambahan yang memerlukan koneksi DB aktif atau client yang siap.
   * Meng-emit event 'ready' internal saat sistem sepenuhnya siap digunakan.
   * @method initialize
   * @returns {Promise<void>} Sebuah Promise yang resolve saat inisialisasi selesai.
   * @fires LevelingSystem#ready
   * @async
   */
  async initialize() {
    try {
      // Tempat untuk logika inisialisasi tambahan jika perlu
      // Contoh: await this.someAsyncSetup();
      const initTime = Date.now() - this.startTime;
      console.log(
        `[LevelingSystem] Inisialisasi selesai dalam ${initTime}ms. Sistem siap digunakan.`,
      );
      /**
       * Event dipicu saat LevelingSystem telah selesai diinisialisasi dan siap digunakan.
       * @event LevelingSystem#ready
       */
      this.emit("ready");
    } catch (error) {
      console.error("[LevelingSystem] Gagal dalam proses inisialisasi:", error);
      /**
       * Event dipicu jika terjadi error selama inisialisasi atau operasi sistem leveling.
       * @event LevelingSystem#error
       * @type {Error}
       */
      this.emit("error", new Error(`Initialization failed: ${error.message}`));
      throw error;
    }
  }
}

module.exports = LevelingSystem;
