/**
 * @description Contoh implementasi plugin untuk sistem leveling.
 *              Plugin ini mendemonstrasikan bagaimana cara bereaksi terhadap event
 *              yang di-emit oleh LevelingSystem (seperti 'levelUp', 'xpGained')
 *              untuk menambahkan fungsionalitas kustom, seperti mengirim pesan tambahan
 *              atau memberikan role sementara.
 * @requires discord.js TextChannel
 * @requires ../core/LevelingSystem (tipe properti this.system)
 * @requires ../managers/GuildConfigManager (implisit melalui this.system)
 */

const { TextChannel } = require("discord.js");

/**
 * @class ExampleRewardPlugin
 * @classdesc Sebuah plugin contoh yang menambahkan logika reward sederhana ke sistem leveling.
 *            Plugin harus mengekspor kelas yang memiliki metode `register`.
 *            Metode event handler harus dinamai `onEventName` (misal: `onLevelUp`).
 */
class ExampleRewardPlugin {
  /**
   * Membuat instance ExampleRewardPlugin.
   */
  constructor() {
    /**
     * Nama plugin yang akan ditampilkan di log.
     * @type {string}
     */
    this.name = "Example Reward Plugin";
    /**
     * Versi plugin.
     * @type {string}
     */
    this.version = "1.0.0";
    /**
     * Deskripsi singkat tentang fungsi plugin.
     * @type {string}
     */
    this.description =
      "Memberikan notifikasi tambahan dan contoh role sementara saat level up.";
    /**
     * Referensi ke instance LevelingSystem utama.
     * Diisi oleh PluginManager saat metode `register` dipanggil.
     * @type {import('../core/LevelingSystem')|null}
     */
    this.system = null;
  }

  /**
   * Metode yang dipanggil oleh PluginManager saat plugin dimuat.
   * Digunakan untuk menyimpan referensi ke LevelingSystem dan melakukan inisialisasi plugin.
   * @method register
   * @param {import('../core/LevelingSystem')} system - Instance LevelingSystem.
   */
  register(system) {
    this.system = system;
    console.log(
      `[Plugin: ${this.name}] v${this.version}: Berhasil didaftarkan dan siap.`,
    );
    // Tempat untuk inisialisasi lain, misal: memuat konfigurasi plugin.
  }

  // --- Event Handlers ---

  /**
   * Handler untuk event 'levelUp' dari LevelingSystem.
   * Dipicu setiap kali pengguna naik level.
   * Contoh ini mengirim pesan tambahan dan memberikan role sementara pada level 5.
   * @method onLevelUp
   * @param {object} data - Data event level up.
   * @param {string} data.guildId - ID Guild tempat level up terjadi.
   * @param {string} data.userId - ID User yang naik level.
   * @param {number} data.oldLevel - Level pengguna sebelumnya.
   * @param {number} data.newLevel - Level baru yang dicapai pengguna.
   * @param {object} data.user - Data pengguna lengkap dari database setelah level up.
   * @async
   */
  async onLevelUp(data) {
    if (!this.system) return;
    console.log(
      `[Plugin: ${this.name}] User ${data.userId} di guild ${data.guildId} naik ke level ${data.newLevel}!`,
    );

    try {
      const config = await this.system.guildConfigManager.getConfig(
        data.guildId,
      );
      if (!config.levelUpMessageEnabled) return;

      const guild = this.system.client.guilds.cache.get(data.guildId);
      if (!guild) return;

      let targetChannel = config.levelUpChannelId
        ? guild.channels.cache.get(config.levelUpChannelId)
        : guild.systemChannel;

      if (targetChannel instanceof TextChannel) {
        const user = await this.system.client.users
          .fetch(data.userId)
          .catch(() => null);
        if (user) {
          const botPermissions = targetChannel.permissionsFor(
            this.system.client.user.id,
          );
          if (botPermissions?.has("SendMessages")) {
            await targetChannel.send(
              `✨ **[Plugin Reward]** ${user.username}, selamat atas pencapaian Level ${data.newLevel}! Terus tingkatkan! ✨`,
            );
          } else {
            console.warn(
              `[Plugin: ${this.name}] Bot tidak punya izin kirim di channel ${targetChannel.id} untuk pesan tambahan.`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[Plugin: ${this.name}] Gagal mengirim pesan tambahan level up untuk ${data.userId}:`,
        error,
      );
    }

    if (data.newLevel === 5) {
      try {
        const guild = this.system.client.guilds.cache.get(data.guildId);
        if (!guild) return;

        const member = await guild.members.fetch(data.userId).catch(() => null);
        if (!member) return;

        const tempRoleName = "Semangat Baru";
        // const tempRoleId = 'YOUR_TEMP_ROLE_ID';
        const durationMinutes = 60; // Durasi dalam menit
        // ----------------------------------------------------------

        let tempRole = guild.roles.cache.find(
          (role) => role.name === tempRoleName,
        );
        // let tempRole = guild.roles.cache.get(tempRoleId); // Jika menggunakan ID

        if (tempRole && !member.roles.cache.has(tempRole.id)) {
          const botMember = await guild.members.fetch(
            this.system.client.user.id,
          );
          if (tempRole.position >= botMember.roles.highest.position) {
            console.warn(
              `[Plugin: ${this.name}] Bot tidak dapat memberikan role '${tempRole.name}' karena posisinya lebih tinggi.`,
            );
            return;
          }

          await member.roles.add(tempRole, `Plugin Reward: Mencapai Level 5`);
          console.log(
            `[Plugin: ${this.name}] Memberikan role sementara '${tempRole.name}' ke ${member.user.tag} selama ${durationMinutes} menit.`,
          );

          setTimeout(
            async () => {
              try {
                const currentMember = await guild.members
                  .fetch(data.userId)
                  .catch(() => null);

                if (
                  currentMember &&
                  currentMember.roles.cache.has(tempRole.id)
                ) {
                  await currentMember.roles.remove(
                    tempRole,
                    "Plugin Reward: Durasi role sementara habis",
                  );
                  console.log(
                    `[Plugin: ${this.name}] Menghapus role sementara '${tempRole.name}' dari ${currentMember.user.tag}.`,
                  );
                }
              } catch (removeError) {
                console.error(
                  `[Plugin: ${this.name}] Gagal menghapus role sementara dari ${data.userId}:`,
                  removeError,
                );
              }
            },
            durationMinutes * 60 * 1000,
          );
        } else if (!tempRole) {
          console.warn(
            `[Plugin: ${this.name}] Role sementara '${tempRoleName}' tidak ditemukan di guild ${data.guildId}.`,
          );
        }
      } catch (error) {
        console.error(
          `[Plugin: ${this.name}] Gagal memberikan role sementara level 5 untuk ${data.userId}:`,
          error,
        );
      }
    }
  }

  /**
   * Handler untuk event 'xpGained' dari LevelingSystem.
   * Dipicu setiap kali pengguna mendapatkan XP dari sumber manapun.
   * @method onXpGained
   * @param {object} data - Data event xp gained.
   * @param {string} data.guildId - ID Guild.
   * @param {string} data.userId - ID User.
   * @param {number} data.amount - Jumlah XP yang didapat kali ini.
   * @param {string} data.source - Sumber XP ('message', 'voice', 'plugin:nama', dll).
   * @param {object} data.newData - Data pengguna lengkap setelah XP ditambahkan.
   */
  onXpGained(data) {
    if (data.source.startsWith("plugin:")) {
      console.log(
        `[Plugin: ${this.name}] Info: User ${data.userId} mendapat ${data.amount} XP dari sumber plugin: ${data.source}`,
      );
    }
    // Logika lain bisa ditambahkan di sini
  }

  /**
   * Handler untuk event 'configUpdated' dari LevelingSystem.
   * Dipicu ketika konfigurasi server berhasil diperbarui melalui GuildConfigManager.
   * @method onConfigUpdated
   * @param {object} data - Data event pembaruan konfigurasi.
   * @param {string} data.guildId - ID Guild yang konfigurasinya diperbarui.
   * @param {object} data.newConfig - Objek konfigurasi baru yang sudah dinormalisasi.
   */
  onConfigUpdated(data) {
    console.log(
      `[Plugin: ${this.name}] Info: Konfigurasi untuk guild ${data.guildId} telah diperbarui.`,
    );
    // Plugin bisa memuat ulang konfigurasinya atau bereaksi jika perlu.
  }

  /**
   * @todo Implementasikan handler untuk event lain jika diperlukan.
   * Contoh: onXpLost, onRoleAwarded, onRoleRemoved, onConfigDeleted, onUserLevelReset, onGuildLevelsReset.
   */
}

module.exports = ExampleRewardPlugin;
