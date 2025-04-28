/**
 * @description Event handler untuk event custom 'levelDown' yang dipicu oleh LevelingSystem.
 *              Bertugas untuk menghapus role-role level yang tidak lagi sesuai
 *              ketika level pengguna turun.
 * @requires discord.js (implisit melalui levelingSystem.client)
 * @requires ../core/LevelingSystem (tipe parameter)
 */

/**
 * @module levelDownHandler
 * @property {string} name - Nama event custom yang didengarkan ('levelDown').
 * @property {boolean} levelingEvent - Menandakan ini adalah event dari LevelingSystem.
 * @property {function} execute - Fungsi yang dijalankan saat event 'levelDown' diterima.
 */
module.exports = {
  name: "levelDown",
  levelingEvent: true,
  /**
   * Handler untuk event 'levelDown' yang di-emit saat level pengguna turun.
   * Menghapus role-role yang level persyaratannya kini lebih tinggi dari level baru pengguna.
   * @function execute
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @param {object} data - Data event level down.
   * @param {string} data.guildId - ID Guild tempat level turun terjadi.
   * @param {string} data.userId - ID User yang levelnya turun.
   * @param {number} data.oldLevel - Level pengguna sebelum turun.
   * @param {number} data.newLevel - Level baru pengguna setelah turun.
   * @param {object} data.user - Data pengguna lengkap dari database setelah level turun.
   * @async
   */
  async execute(levelingSystem, data) {
    console.log(
      `[LevelDownHandler] Menerima event levelDown: ${data.userId}@${data.guildId} | ${data.oldLevel} -> ${data.newLevel}`,
    );

    try {
      const config = await levelingSystem.guildConfigManager.getConfig(
        data.guildId,
      );
      const levelRolesMap = config.levelRoles || new Map();
      if (!levelRolesMap || levelRolesMap.size === 0) {
        return;
      }

      const guild = levelingSystem.client.guilds.cache.get(data.guildId);
      if (!guild) {
        console.warn(
          `[LevelDownHandler] Guild ${data.guildId} tidak ditemukan.`,
        );
        return;
      }
      const member = await guild.members.fetch(data.userId).catch(() => null);
      if (!member) {
        console.warn(
          `[LevelDownHandler] Member ${data.userId} tidak ditemukan di guild ${data.guildId} saat level down.`,
        );
        return;
      }

      const rolesToRemove = [];
      const currentMemberRoles = member.roles.cache;

      for (const [levelStr, roleId] of levelRolesMap.entries()) {
        const requiredLevel = parseInt(levelStr, 10);
        if (isNaN(requiredLevel)) {
          console.warn(
            `[LevelDownHandler] Level tidak valid '${levelStr}' ditemukan di levelRoles guild ${data.guildId}`,
          );
          continue;
        }

        if (requiredLevel > data.newLevel && currentMemberRoles.has(roleId)) {
          rolesToRemove.push(roleId);
        }
      }

      if (rolesToRemove.length > 0) {
        console.log(
          `[LevelDownHandler] Menghapus ${rolesToRemove.length} role(s) karena level turun ke ${data.newLevel} untuk ${data.userId}@${data.guildId}: ${rolesToRemove.join(", ")}`,
        );
        try {
          await member.roles.remove(
            rolesToRemove,
            `Level turun ke ${data.newLevel}`,
          );

          rolesToRemove.forEach((removedRoleId) => {
            levelingSystem.emit("roleRemoved", {
              guildId: data.guildId,
              userId: data.userId,
              level: data.newLevel,
              roleId: removedRoleId,
              reason: "level_down",
            });
          });
          console.log(
            `[LevelDownHandler] Berhasil menghapus role(s) dari ${member.user.tag}.`,
          );
        } catch (removeErr) {
          console.error(
            `[LevelDownHandler] Gagal menghapus role(s) ${rolesToRemove.join(", ")} dari ${data.userId} saat level turun:`,
            removeErr,
          );
          levelingSystem.emit(
            "error",
            new Error(
              `Failed role removal on level down for ${data.userId}: ${removeErr.message}`,
            ),
          );
        }
      }
    } catch (error) {
      console.error(
        `[LevelDownHandler] Error memproses event levelDown untuk ${data.userId}@${data.guildId}:`,
        error,
      );
      levelingSystem.emit(
        "error",
        new Error(`Level down handler error: ${error.message}`),
      );
    }
  },
};
