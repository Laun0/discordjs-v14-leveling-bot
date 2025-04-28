/**
 * @description Kelas inti yang bertanggung jawab untuk mengelola data level pengguna,
 *              perhitungan XP yang dibutuhkan per level, konversi XP ke level,
 *              logika penambahan dan pengurangan XP, penanganan level up (termasuk role),
 *              pengambilan data leaderboard, dan operasi reset data level.
 *              Berinteraksi erat dengan CacheManager dan GuildConfigManager.
 * @requires ../database/schemas/UserLevel - Skema Mongoose untuk data level pengguna.
 * @requires ./LevelingSystem - (tipe parameter) Untuk emit event dan akses komponen lain.
 * @requires ../managers/CacheManager - (tipe parameter) Untuk manajemen cache data level.
 * @requires ../managers/GuildConfigManager - (tipe parameter) Untuk mendapatkan konfigurasi server terkait leveling (misal: role rewards, strategi role).
 */

const UserLevel = require("../database/schemas/UserLevel");

/**
 * @class LevelingManager
 * @classdesc Mengelola semua aspek data dan logika inti dari sistem leveling pengguna.
 *            Menyediakan metode untuk berinteraksi dengan data level di database dan cache,
 *            menghitung level, menangani XP, dan mengelola role berdasarkan level.
 * @param {import('./LevelingSystem')} system - Instance LevelingSystem utama.
 * @param {import('../managers/CacheManager')} cacheManager - Instance CacheManager.
 * @param {import('../managers/GuildConfigManager')} guildConfigManager - Instance GuildConfigManager.
 * @throws {Error} Jika salah satu parameter dependency (system, cacheManager, guildConfigManager) tidak disediakan.
 */
class LevelingManager {
  constructor(system, cacheManager, guildConfigManager) {
    if (!system || !cacheManager || !guildConfigManager) {
      throw new Error(
        "[LevelingManager] System, CacheManager, dan GuildConfigManager diperlukan.",
      );
    }
    /**
     * Referensi ke instance LevelingSystem utama.
     * @type {import('./LevelingSystem')}
     * @public
     */
    this.system = system;
    /**
     * Referensi ke instance CacheManager.
     * @type {import('../managers/CacheManager')}
     * @public
     */
    this.cacheManager = cacheManager;
    /**
     * Referensi ke instance GuildConfigManager.
     * @type {import('../managers/GuildConfigManager')}
     * @public
     */
    this.guildConfigManager = guildConfigManager;
    console.log("[LevelingManager] Siap.");
  }

  /**
   * Menghitung total akumulasi XP yang dibutuhkan untuk mencapai *awal* dari level tertentu.
   * Menggunakan formula standar: `5 * (level^2) + 50 * level + 100`.
   * @method xpForLevel
   * @param {number} level - Level target (dimulai dari 1). Level 0 membutuhkan 0 XP.
   * @returns {number} Jumlah total XP yang dibutuhkan.
   * @todo Pertimbangkan untuk membuat formula ini dapat dikonfigurasi per server melalui GuildConfigManager.
   */
  xpForLevel(level) {
    if (level <= 0) return 0;
    return 5 * level ** 2 + 50 * level + 100;
  }

  /**
   * Menghitung level pengguna berdasarkan total akumulasi XP yang dimiliki.
   * @method getLevelFromXP
   * @param {number} xp - Total XP pengguna.
   * @returns {number} Level pengguna saat ini (dimulai dari 0).
   */
  getLevelFromXP(xp) {
    if (xp <= 0) return 0;
    let level = 0;
    let xpNeededForNextLevel = this.xpForLevel(level + 1);

    while (xp >= xpNeededForNextLevel) {
      level++;
      xpNeededForNextLevel = this.xpForLevel(level + 1);
    }
    return level;
  }

  /**
   * Mendapatkan data level lengkap untuk pengguna tertentu di suatu server.
   * Mengambil data dari cache jika tersedia, jika tidak, mengambil dari database.
   * Jika pengguna belum ada di database, dokumen baru akan dibuat secara otomatis (upsert)
   * dengan nilai default (XP 0, Level 0, dll.).
   * Memastikan field `totalMessages` dan `totalVoiceDurationMillis` ada di data yang dikembalikan.
   * @method getUserLevelData
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @returns {Promise<object>} Sebuah Promise yang resolve dengan objek data level pengguna.
   *                            Objek ini adalah plain JavaScript object (hasil dari `.lean()`)
   *                            dan merupakan salinan dari data cache/DB.
   * @throws {Error} Jika `guildId` atau `userId` tidak disediakan.
   * @async
   */
  async getUserLevelData(guildId, userId) {
    if (!guildId || !userId)
      throw new Error(
        "[LevelingManager] guildId dan userId diperlukan untuk getUserLevelData.",
      );
    const cacheKey = `level-${guildId}-${userId}`;
    let userData = this.cacheManager.get(cacheKey);

    if (!userData) {
      userData = await UserLevel.findOneAndUpdate(
        { guildId, userId },
        {
          $setOnInsert: {
            guildId,
            userId,
            xp: 0,
            level: 0,
            lastMessageTimestamp: 0,
            totalMessages: 0,
            totalVoiceDurationMillis: 0,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();

      if (userData) {
        userData.totalMessages = userData.totalMessages ?? 0;
        userData.totalVoiceDurationMillis =
          userData.totalVoiceDurationMillis ?? 0;
        this.cacheManager.set(cacheKey, userData);
      } else {
        console.error(
          `[LevelingManager] Gagal mendapatkan/membuat data untuk ${userId}@${guildId}`,
        );

        return {
          guildId,
          userId,
          xp: 0,
          level: 0,
          lastMessageTimestamp: 0,
          totalMessages: 0,
          totalVoiceDurationMillis: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    }
    userData.totalMessages = userData.totalMessages ?? 0;
    userData.totalVoiceDurationMillis = userData.totalVoiceDurationMillis ?? 0;

    return { ...userData };
  }

  /**
   * Menambahkan sejumlah XP ke pengguna, menghitung ulang level, dan menangani
   * logika level up (termasuk pemberian/penghapusan role berdasarkan strategi).
   * Mengupdate data di database dan cache. Meng-emit event `xpGained` dan `levelUp`.
   * @method addXP
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @param {number} amount - Jumlah XP yang akan ditambahkan (harus > 0).
   * @param {string} [source='unknown'] - String identifikasi sumber XP (misal: 'message', 'voice', 'plugin:bonus').
   * @returns {Promise<{oldLevel: number, newLevel: number, gainedXp: number, user: object}|null>}
   *          Sebuah Promise yang resolve dengan objek berisi informasi perubahan level dan data user terbaru,
   *          atau `null` jika `amount` tidak positif.
   * @fires LevelingSystem#xpGained
   * @fires LevelingSystem#levelUp
   * @fires LevelingSystem#roleAwarded
   * @fires LevelingSystem#roleRemoved
   * @async
   */
  async addXP(guildId, userId, amount, source = "unknown") {
    if (amount <= 0) return null;

    const userData = await this.getUserLevelData(guildId, userId);
    const oldLevel = userData.level;
    const newXP = userData.xp + amount;
    const newLevel = this.getLevelFromXP(newXP);

    const updatedDataLean = await UserLevel.findOneAndUpdate(
      { guildId, userId },
      { $set: { xp: newXP, level: newLevel } },
      { new: true },
    ).lean();

    if (!updatedDataLean) {
      console.error(
        `[LevelingManager] Gagal update XP/Level untuk ${userId}@${guildId} setelah menambah ${amount} XP.`,
      );
      this.system.emit(
        "error",
        new Error(`Failed to update XP/Level for ${userId}@${guildId}`),
      );
      return {
        oldLevel: oldLevel,
        newLevel: oldLevel,
        gainedXp: 0,
        user: userData,
      };
    }

    const updatedData = {
      ...userData,
      ...updatedDataLean,
    };

    const cacheKey = `level-${guildId}-${userId}`;
    this.cacheManager.set(cacheKey, updatedData);

    /**
     * Event dipicu setelah XP berhasil ditambahkan.
     * @event LevelingSystem#xpGained
     * @type {object}
     * @property {string} guildId
     * @property {string} userId
     * @property {number} amount - Jumlah XP yang baru ditambahkan.
     * @property {string} source - Sumber XP.
     * @property {object} newData - Data pengguna lengkap setelah penambahan XP.
     */
    this.system.emit("xpGained", {
      guildId,
      userId,
      amount,
      source,
      newData: { ...updatedData },
    });

    // --- Logika jika terjadi Level Up ---
    if (newLevel > oldLevel) {
      /**
       * Event dipicu saat pengguna naik level.
       * @event LevelingSystem#levelUp
       * @type {object}
       * @property {string} guildId
       * @property {string} userId
       * @property {number} oldLevel - Level sebelum naik.
       * @property {number} newLevel - Level baru setelah naik.
       * @property {object} user - Data pengguna lengkap setelah naik level.
       */
      this.system.emit("levelUp", {
        guildId,
        userId,
        oldLevel,
        newLevel,
        user: { ...updatedData },
      });

      // --- Penanganan Role Level Up ---
      let guild;
      let member;
      try {
        const config = await this.guildConfigManager.getConfig(guildId);
        const levelRolesMap = config.levelRoles || new Map();

        if (levelRolesMap.size > 0) {
          guild = this.system.client.guilds.cache.get(guildId);
          if (!guild) {
            throw new Error(`Guild ${guildId} not found in cache.`);
          }
          member = await guild.members.fetch(userId).catch(() => null);

          if (member) {
            // --- Penambahan Role ---
            const rolesToAdd = [];
            for (const [levelStr, roleId] of levelRolesMap.entries()) {
              const requiredLevel = parseInt(levelStr, 10);
              if (
                newLevel >= requiredLevel &&
                oldLevel < requiredLevel &&
                !member.roles.cache.has(roleId)
              ) {
                rolesToAdd.push(roleId);
              }
            }
            if (rolesToAdd.length > 0) {
              try {
                await member.roles.add(
                  rolesToAdd,
                  `Mencapai Level ${newLevel}`,
                );
                rolesToAdd.forEach((addedRoleId) => {
                  /**
                   * Event dipicu saat role berhasil diberikan sebagai reward level up.
                   * @event LevelingSystem#roleAwarded
                   * @type {object}
                   * @property {string} guildId
                   * @property {string} userId
                   * @property {number} level - Level yang memicu pemberian role.
                   * @property {string} roleId - ID role yang diberikan.
                   */
                  this.system.emit("roleAwarded", {
                    guildId,
                    userId,
                    level: newLevel,
                    roleId: addedRoleId,
                  });
                });
              } catch (addErr) {
                console.error(
                  `[LevelingManager] Gagal menambah role(s) ${rolesToAdd.join(", ")} ke ${userId}:`,
                  addErr.message,
                );
              }
            }

            // --- Penghapusan Role (Berdasarkan Strategi) ---
            const roleRemovalStrategy =
              config.roleRemovalStrategy || "keep_all";
            if (roleRemovalStrategy !== "keep_all") {
              const rolesToRemove = [];
              const currentMemberRoles = member.roles.cache;

              if (roleRemovalStrategy === "highest_only") {
                let highestQualifiedLevel = -1;
                let highestRoleId = null;
                for (const [levelStr, roleId] of levelRolesMap.entries()) {
                  const requiredLevel = parseInt(levelStr, 10);
                  if (
                    newLevel >= requiredLevel &&
                    requiredLevel > highestQualifiedLevel
                  ) {
                    highestQualifiedLevel = requiredLevel;
                    highestRoleId = roleId;
                  }
                }

                for (const [levelStr, roleId] of levelRolesMap.entries()) {
                  if (
                    roleId !== highestRoleId &&
                    currentMemberRoles.has(roleId)
                  ) {
                    rolesToRemove.push(roleId);
                  }
                }
              } else if (roleRemovalStrategy === "remove_previous") {
                for (const [levelStr, roleId] of levelRolesMap.entries()) {
                  const requiredLevel = parseInt(levelStr, 10);
                  if (
                    requiredLevel < newLevel &&
                    currentMemberRoles.has(roleId)
                  ) {
                    let isRewardForCurrentLevel = false;
                    for (const [
                      lvlStrCheck,
                      roleIdCheck,
                    ] of levelRolesMap.entries()) {
                      if (
                        parseInt(lvlStrCheck, 10) === newLevel &&
                        roleIdCheck === roleId
                      ) {
                        isRewardForCurrentLevel = true;
                        break;
                      }
                    }
                    if (!isRewardForCurrentLevel) {
                      rolesToRemove.push(roleId);
                    }
                  }
                }
              }

              if (rolesToRemove.length > 0) {
                try {
                  await member.roles.remove(
                    rolesToRemove,
                    `Level up to ${newLevel} (${roleRemovalStrategy} strategy)`,
                  );
                  rolesToRemove.forEach((removedRoleId) => {
                    /**
                     * Event dipicu saat role dihapus karena strategi level up.
                     * @event LevelingSystem#roleRemoved
                     * @type {object}
                     * @property {string} guildId
                     * @property {string} userId
                     * @property {number} level - Level baru pengguna.
                     * @property {string} roleId - ID role yang dihapus.
                     * @property {string} reason - Alasan penghapusan (termasuk strategi).
                     */
                    this.system.emit("roleRemoved", {
                      guildId,
                      userId,
                      level: newLevel,
                      roleId: removedRoleId,
                      reason: `level_up_${roleRemovalStrategy}`,
                    });
                  });
                } catch (removeErr) {
                  console.error(
                    `[LevelingManager] Gagal menghapus role(s) ${rolesToRemove.join(", ")} dari ${userId}:`,
                    removeErr.message,
                  );
                }
              }
            }
          } else {
            console.warn(
              `[LevelingManager] Member ${userId} tidak ditemukan di guild ${guildId} saat proses role level up.`,
            );
          }
        }
      } catch (err) {
        console.error(
          `[LevelingManager] Error saat memproses role reward/removal untuk ${userId}@${guildId}:`,
          err,
        );
        this.system.emit(
          "error",
          new Error(`Role handling error on level up: ${err.message}`),
        );
      }
    }

    return { oldLevel, newLevel, gainedXp: amount, user: { ...updatedData } };
  }

  /**
   * Mengurangi sejumlah XP dari pengguna. Menghitung ulang level dan mengupdate
   * database serta cache. Meng-emit event `xpLost` dan `levelDown` jika level turun.
   * @method removeXP
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @param {number} amount - Jumlah XP yang akan dikurangi (harus > 0).
   * @param {string} [reason='penalty'] - Alasan pengurangan XP.
   * @returns {Promise<object|null>} Sebuah Promise yang resolve dengan objek data pengguna terbaru setelah pengurangan,
   *          atau `null` jika `amount` tidak positif atau terjadi error update.
   * @fires LevelingSystem#xpLost
   * @fires LevelingSystem#levelDown
   * @async
   */
  async removeXP(guildId, userId, amount, reason = "penalty") {
    if (amount <= 0) return null;

    const userData = await this.getUserLevelData(guildId, userId);
    if (!userData) return null;

    const oldLevel = userData.level;
    let newXP = Math.max(0, userData.xp - amount);
    const newLevel = this.getLevelFromXP(newXP);

    const updatedDataLean = await UserLevel.findOneAndUpdate(
      { guildId, userId },
      { $set: { xp: newXP, level: newLevel } },
      { new: true },
    ).lean();

    if (!updatedDataLean) {
      console.error(
        `[LevelingManager] Gagal update XP/Level untuk ${userId}@${guildId} setelah mengurangi ${amount} XP.`,
      );
      this.system.emit(
        "error",
        new Error(`Failed to remove XP for ${userId}@${guildId}`),
      );
      return null;
    }

    const updatedData = { ...userData, ...updatedDataLean };

    const cacheKey = `level-${guildId}-${userId}`;
    this.cacheManager.set(cacheKey, updatedData);

    /**
     * Event dipicu setelah XP berhasil dikurangi dari pengguna.
     * @event LevelingSystem#xpLost
     * @type {object}
     * @property {string} guildId
     * @property {string} userId
     * @property {number} amount - Jumlah XP yang dikurangi.
     * @property {string} reason - Alasan pengurangan.
     * @property {object} newData - Data pengguna lengkap setelah pengurangan XP.
     */
    this.system.emit("xpLost", {
      guildId,
      userId,
      amount,
      reason,
      newData: { ...updatedData },
    });

    // --- Logika jika terjadi Level Down ---
    if (newLevel < oldLevel) {
      /**
       * Event dipicu saat level pengguna turun akibat pengurangan XP.
       * @event LevelingSystem#levelDown
       * @type {object}
       * @property {string} guildId
       * @property {string} userId
       * @property {number} oldLevel - Level sebelum turun.
       * @property {number} newLevel - Level baru setelah turun.
       * @property {object} user - Data pengguna lengkap setelah turun level.
       */
      this.system.emit("levelDown", {
        guildId,
        userId,
        oldLevel,
        newLevel,
        user: { ...updatedData },
      });
    }

    return { ...updatedData };
  }

  /**
   * Mengambil data leaderboard (pengguna teratas berdasarkan XP) untuk server tertentu.
   * @method getLeaderboard
   * @param {string} guildId - ID server Discord.
   * @param {number} [limit=10] - Jumlah maksimum entri pengguna yang ingin diambil (dibatasi hingga 50).
   * @returns {Promise<Array<object>>} Sebuah Promise yang resolve dengan array berisi objek data pengguna
   *          (dari `UserLevel.lean()`) yang terurut berdasarkan XP descending. Array kosong jika tidak ada data atau error.
   * @throws {Error} Jika `guildId` tidak disediakan.
   * @async
   */
  async getLeaderboard(guildId, limit = 10) {
    if (!guildId)
      throw new Error(
        "[LevelingManager] guildId diperlukan untuk getLeaderboard.",
      );
    const safeLimit = Math.max(1, Math.min(limit, 50));

    try {
      const leaderboardData = await UserLevel.find({
        guildId: guildId,
        xp: { $gt: 0 },
      })
        .sort({ xp: -1, updatedAt: -1 })
        .limit(safeLimit)
        .lean();
      return leaderboardData;
    } catch (error) {
      console.error(
        `[LevelingManager] Gagal mendapatkan leaderboard untuk guild ${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(`Failed to get leaderboard for ${guildId}: ${error.message}`),
      );
      return [];
    }
  }

  /**
   * Mendapatkan peringkat (posisi leaderboard) pengguna tertentu di server.
   * @method getUserRank
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @returns {Promise<number>} Sebuah Promise yang resolve dengan nomor peringkat pengguna (dimulai dari 1),
   *          atau 0 jika pengguna tidak ditemukan, tidak punya XP, atau terjadi error.
   * @throws {Error} Jika `guildId` atau `userId` tidak disediakan.
   * @async
   */
  async getUserRank(guildId, userId) {
    if (!guildId || !userId)
      throw new Error(
        "[LevelingManager] guildId dan userId diperlukan untuk getUserRank.",
      );
    try {
      const userData = await this.getUserLevelData(guildId, userId);

      if (!userData || userData.xp <= 0) return 0;

      const rank = await UserLevel.countDocuments({
        guildId: guildId,
        xp: { $gt: userData.xp }, // $gt = greater than
      });

      return rank + 1;
    } catch (error) {
      console.error(
        `[LevelingManager] Gagal mendapatkan rank untuk ${userId}@${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(
          `Failed to get rank for ${userId}@${guildId}: ${error.message}`,
        ),
      );
      return 0;
    }
  }

  /**
   * Mereset data leveling (XP, level, timestamp, statistik) untuk satu pengguna di server.
   * Mengupdate database dan menghapus data pengguna dari cache. Meng-emit event `userLevelReset`.
   * @method resetUserLevel
   * @param {string} guildId - ID server Discord.
   * @param {string} userId - ID pengguna Discord.
   * @returns {Promise<boolean>} Sebuah Promise yang resolve dengan `true` jika data berhasil direset (dokumen ditemukan/dimodifikasi), `false` jika gagal atau user tidak ditemukan.
   * @fires LevelingSystem#userLevelReset
   * @async
   */
  async resetUserLevel(guildId, userId) {
    if (!guildId || !userId) return false;
    try {
      const result = await UserLevel.updateOne(
        { guildId, userId },
        {
          $set: {
            xp: 0,
            level: 0,
            lastMessageTimestamp: 0,
            totalMessages: 0,
            totalVoiceDurationMillis: 0,
          },
        },
      );

      const cacheKey = `level-${guildId}-${userId}`;
      this.cacheManager.del(cacheKey);

      console.log(
        `[LevelingManager] Data level direset untuk ${userId}@${guildId}.`,
      );
      /**
       * Event dipicu setelah data level satu pengguna berhasil direset.
       * @event LevelingSystem#userLevelReset
       * @type {object}
       * @property {string} guildId
       * @property {string} userId
       */
      this.system.emit("userLevelReset", { guildId, userId });

      return result.modifiedCount > 0 || result.matchedCount > 0;
    } catch (error) {
      console.error(
        `[LevelingManager] Gagal mereset level untuk ${userId}@${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(
          `Failed to reset level for ${userId}@${guildId}: ${error.message}`,
        ),
      );
      return false;
    }
  }

  /**
   * Mereset (menghapus) SEMUA data leveling pengguna di satu server.
   * Operasi ini **berbahaya** dan tidak dapat dibatalkan.
   * Juga membersihkan cache terkait level untuk server tersebut. Meng-emit event `guildLevelsReset`.
   * @method resetGuildLevels
   * @param {string} guildId - ID server Discord yang datanya akan direset.
   * @returns {Promise<number|null>} Sebuah Promise yang resolve dengan jumlah dokumen (pengguna) yang berhasil dihapus,
   *          atau `null` jika `guildId` tidak disediakan atau terjadi error.
   * @fires LevelingSystem#guildLevelsReset
   * @async
   */
  async resetGuildLevels(guildId) {
    if (!guildId) return null;
    try {
      console.warn(
        `[LevelingManager] MEMULAI RESET SEMUA LEVEL UNTUK GUILD ${guildId}! OPERASI BERBAHAYA!`,
      );

      const result = await UserLevel.deleteMany({ guildId });

      const keys = this.cacheManager.keys();
      const guildKeys = keys.filter((k) => k.startsWith(`level-${guildId}-`));
      if (guildKeys.length > 0) {
        this.cacheManager.del(guildKeys);
        // console.log(`[LevelingManager] Menghapus ${guildKeys.length} kunci cache level untuk guild ${guildId}.`);
      }

      console.log(
        `[LevelingManager] Berhasil menghapus ${result.deletedCount} data level untuk guild ${guildId}.`,
      );
      /**
       * Event dipicu setelah semua data level untuk satu server berhasil dihapus.
       * @event LevelingSystem#guildLevelsReset
       * @type {object}
       * @property {string} guildId - ID server yang datanya direset.
       * @property {number} count - Jumlah data pengguna yang dihapus.
       */
      this.system.emit("guildLevelsReset", {
        guildId,
        count: result.deletedCount,
      });

      return result.deletedCount;
    } catch (error) {
      console.error(
        `[LevelingManager] Gagal mereset semua level untuk guild ${guildId}:`,
        error,
      );
      this.system.emit(
        "error",
        new Error(
          `Failed to reset levels for guild ${guildId}: ${error.message}`,
        ),
      );
      return null;
    }
  }
}

module.exports = LevelingManager;
