/**
 * @description Menyediakan kelas CacheManager yang berfungsi sebagai wrapper
 *              untuk library `node-cache`. Digunakan untuk menyimpan data sementara
 *              dalam memori (seperti data level pengguna atau konfigurasi server)
 *              guna mengurangi frekuensi akses ke database dan meningkatkan performa.
 * @requires node-cache
 */

const NodeCache = require("node-cache");

/**
 * @class CacheManager
 * @classdesc Wrapper di sekitar `node-cache` untuk menyediakan antarmuka caching sederhana.
 *            Mengelola penyimpanan, pengambilan, penghapusan, dan pembersihan data cache.
 *            Mendukung TTL (Time To Live) default dan per-item, serta pemeriksaan kadaluarsa berkala.
 */
class CacheManager {
  /**
   * Membuat instance CacheManager baru dengan opsi konfigurasi untuk `node-cache`.
   * @constructor
   * @param {object} [options={}] - Opsi konfigurasi untuk instance `NodeCache`.
   * @param {number} [options.stdTTL=300] - Waktu hidup (Time To Live) standar dalam detik untuk item cache. Default: 300 (5 menit).
   * @param {number} [options.checkperiod=60] - Interval dalam detik untuk memeriksa dan menghapus item cache yang kadaluarsa. Default: 60 (1 menit).
   * @param {boolean} [options.useClones=false] - Jika `true`, metode `get` akan mengembalikan salinan (clone) dari objek yang disimpan, mencegah mutasi objek asli di cache. `false` (default) lebih cepat tetapi data yang dikembalikan bisa termutasi.
   * @param {boolean} [options.deleteOnExpire=true] - Jika `true` (default), item akan dihapus secara otomatis saat TTL-nya habis.
   * @param {number} [options.maxKeys=-1] - Jumlah maksimum kunci yang diizinkan dalam cache. -1 berarti tidak ada batasan (default).
   */
  constructor(options = {}) {
    /**
     * Opsi default yang digabungkan dengan opsi yang diberikan pengguna.
     * @private
     * @type {NodeCache.Options}
     */
    const defaultOptions = {
      stdTTL: options.stdTTL ?? 300, // Gunakan ?? untuk fallback jika 0 valid
      checkperiod: options.checkperiod ?? 60,
      useClones: options.useClones === true, // Eksplisit boolean check
      deleteOnExpire: options.deleteOnExpire !== false, // Default true
      maxKeys: options.maxKeys ?? -1, // Default -1 (tak terbatas)
    };

    /**
     * Instance internal dari `node-cache`.
     * @private
     * @type {NodeCache}
     */
    this.cache = new NodeCache(defaultOptions);
    console.log(
      `[CacheManager] Dimulai. Default TTL: ${this.cache.options.stdTTL}s, Check Interval: ${this.cache.options.checkperiod}s.`,
    );

    // Opsional: Listener untuk event node-cache (berguna untuk debugging)
    this.cache.on("set", (key /*, value*/) => {
      // console.debug(`[CacheManager] Key SET: ${key}`);
    });
    this.cache.on("del", (key /*, value*/) => {
      // console.debug(`[CacheManager] Key DEL: ${key}`);
    });
    this.cache.on("expired", (key /*, value*/) => {
      // console.debug(`[CacheManager] Key EXPIRED: ${key}`);
    });
    this.cache.on("flush", () => {
      // console.debug("[CacheManager] Cache FLUSHED.");
    });
  }

  /**
   * Mengambil nilai dari cache berdasarkan kunci yang diberikan.
   * @method get
   * @param {string} key - Kunci unik item yang ingin diambil dari cache.
   * @returns {any | undefined} Nilai yang tersimpan di cache untuk kunci tersebut,
   *         atau `undefined` jika kunci tidak ditemukan atau item sudah kadaluarsa.
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * Menyimpan pasangan kunci-nilai ke dalam cache.
   * @method set
   * @param {string} key - Kunci unik untuk item yang akan disimpan.
   * @param {any} value - Nilai yang akan disimpan. Nilai `undefined` tidak diizinkan oleh `node-cache` dan akan dicegah.
   * @param {number} [ttl] - (Opsional) Waktu hidup (Time To Live) spesifik untuk item ini dalam detik.
   *                      Jika tidak disediakan, `stdTTL` dari constructor akan digunakan.
   * @returns {boolean} `true` jika item berhasil disimpan, `false` jika `value` adalah `undefined`.
   */
  set(key, value, ttl) {
    if (value === undefined) {
      console.warn(
        `[CacheManager] Mencoba menyimpan 'undefined' untuk kunci '${key}'. Operasi dibatalkan.`,
      );
      return false;
    }
    // Gunakan TTL spesifik jika diberikan, jika tidak, `node-cache` akan gunakan `stdTTL`
    return this.cache.set(key, value, ttl);
  }

  /**
   * Menghapus satu atau beberapa item dari cache berdasarkan kunci (key).
   * @method del
   * @param {string | string[]} keys - Kunci tunggal (string) atau array berisi kunci-kunci yang akan dihapus.
   * @returns {number} Jumlah item yang berhasil dihapus dari cache.
   */
  del(keys) {
    return this.cache.del(keys);
  }

  /**
   * Menghapus *semua* item dari cache. Operasi ini tidak dapat dibatalkan.
   * @method flush
   */
  flush() {
    this.cache.flushAll();
    console.log("[CacheManager] Semua cache telah dibersihkan (flushAll).");
  }

  /**
   * Mengambil statistik penggunaan cache internal dari `node-cache`.
   * Berguna untuk memantau efektivitas cache (hits, misses).
   * @method getStats
   * @returns {NodeCache.Stats} Objek berisi statistik cache (`keys`, `hits`, `misses`, `ksize`, `vsize`, dll.).
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Mengambil daftar semua kunci yang saat ini ada di dalam cache.
   * @method keys
   * @returns {string[]} Array berisi string kunci-kunci cache.
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * Membersihkan interval internal `node-cache` yang digunakan untuk memeriksa item kadaluarsa.
   * Sebaiknya dipanggil saat aplikasi dimatikan untuk mencegah resource leak.
   * @method close
   */
  close() {
    this.cache.close();
    console.log("[CacheManager] Interval pengecekan kadaluarsa dihentikan.");
  }
}

module.exports = CacheManager;
