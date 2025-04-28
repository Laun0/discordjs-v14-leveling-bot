/**
 * @description Slash command untuk menampilkan informasi leveling pengguna,
 *              termasuk peringkat server, level, XP, progress ke level berikutnya,
 *              statistik pesan dan waktu suara, serta kartu rank visual.
 * @requires discord.js SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags
 * @requires ../core/LevelingSystem (tipe parameter execute)
 * @requires ../core/LevelingManager (implisit via levelingSystem)
 * @requires ../managers/GuildConfigManager (implisit via levelingSystem)
 * @requires ../utils/CardGenerator (implisit via levelingSystem)
 * @requires ../utils/formatters (implisit via levelingSystem)
 */

const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

/**
 * Membuat representasi teks dari progress bar.
 * @param {number} current - Nilai saat ini.
 * @param {number} required - Nilai total yang dibutuhkan.
 * @param {number} [length=15] - Panjang bar dalam karakter blok.
 * @returns {string} String progress bar.
 * @private
 */
function createProgressBar(current, required, length = 55) {
  if (required <= 0) return "▓".repeat(length) + " Max";
  const percentage = Math.max(0, Math.min(1, current / required));
  const filledBlocks = Math.round(percentage * length);
  const emptyBlocks = length - filledBlocks;
  const safeFilledBlocks = Math.max(0, filledBlocks);
  const safeEmptyBlocks = Math.max(0, length - safeFilledBlocks);
  return "▓".repeat(safeFilledBlocks) + "░".repeat(safeEmptyBlocks);
}

/**
 * @module rankCommand
 * @description Definisi dan eksekusi untuk slash command `/rank`.
 */
module.exports = {
  /**
   * @property {SlashCommandBuilder} data - Konfigurasi slash command '/rank'.
   */
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription(
      "🏅 Menampilkan kartu rank dan statistik level Anda atau pengguna lain.",
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Pengguna yang ingin dilihat ranknya (opsional).")
        .setRequired(false),
    ),
  /**
   * Fungsi eksekusi utama untuk command `/rank`.
   * Mengambil data leveling pengguna, menghitung statistik, membuat kartu rank visual,
   * membuat embed berisi statistik lengkap, dan mengirimkan keduanya sebagai balasan.
   * @function execute
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Objek interaksi command.
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @async
   */
  async execute(interaction, levelingSystem) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "❌ Command ini hanya bisa digunakan di dalam server.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guild = interaction.guild;

    if (targetUser.bot) {
      return interaction.editReply({
        content: "🤖 Bot tidak memiliki rank level.",
      });
    }

    try {
      const userData = await levelingSystem.levelingManager.getUserLevelData(
        guild.id,
        targetUser.id,
      );
      if (!userData || userData.xp <= 0) {
        const message =
          targetUser.id === interaction.user.id ? "Anda" : targetUser.username;
        return interaction.editReply({
          content: `📉 ${message} belum mendapatkan XP di server ini.`,
        });
      }
      const rank = await levelingSystem.levelingManager.getUserRank(
        guild.id,
        targetUser.id,
      );

      const xpForCurrentLevel = levelingSystem.levelingManager.xpForLevel(
        userData.level,
      );
      const xpForNextLevel = levelingSystem.levelingManager.xpForLevel(
        userData.level + 1,
      );
      const currentLevelXP = userData.xp - xpForCurrentLevel;
      const requiredXPForNext = xpForNextLevel - xpForCurrentLevel;
      const progressPercent =
        requiredXPForNext > 0
          ? Math.floor((currentLevelXP / requiredXPForNext) * 100)
          : 100;

      let status = "offline";
      try {
        const member = await guild.members
          .fetch({ user: targetUser.id, force: false, cache: true })
          .catch(() => null);
        if (member?.presence) {
          status = member.presence.status;
        }
      } catch (fetchErr) {
        console.warn(
          `[RankCmd] Gagal fetch member presence: ${fetchErr.message}`,
        );
      }

      const cardData = {
        username: targetUser.username,
        avatarURL: targetUser.displayAvatarURL({ extension: "png", size: 256 }),
        level: userData.level,
        rank: rank,
        currentXP: currentLevelXP,
        requiredXP: requiredXPForNext,
        totalXP: userData.xp,
        status: status,
      };

      const guildConfig = await levelingSystem.guildConfigManager.getConfig(
        guild.id,
      );
      const attachment = await levelingSystem.cardGenerator.createRankCard(
        cardData,
        guildConfig,
      );

      const embed = new EmbedBuilder()
        .setColor(
          targetUser.accentColor ||
            guild.members.me?.displayHexColor ||
            "#5865F2",
        )
        .setAuthor({
          name: `Statistik Leveling - ${targetUser.username}`,
          iconURL: targetUser.displayAvatarURL(),
        })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
        .setImage(`attachment://${attachment.name}`)
        .addFields(
          {
            name: "🏆 Peringkat",
            value: `**#${levelingSystem.formatters.formatNumber(rank, 0)}**`,
            inline: true,
          },
          {
            name: "✨ Level",
            value: `**${levelingSystem.formatters.formatNumber(userData.level, 0)}**`,
            inline: true,
          },
          {
            name: "⭐ Total XP",
            value: `\`${levelingSystem.formatters.formatNumber(userData.xp)}\``,
            inline: true,
          },
          {
            name: `📈 Progress Lvl ${userData.level + 1}`,
            value: `\`\`\`${createProgressBar(currentLevelXP, requiredXPForNext)} [${progressPercent}%]\`\`\`\n*(${levelingSystem.formatters.formatNumber(currentLevelXP)} / ${requiredXPForNext > 0 ? levelingSystem.formatters.formatNumber(requiredXPForNext) : "Max"}) XP*`,
            inline: false,
          },
          {
            name: "💬 Pesan Terhitung",
            value: `\`${levelingSystem.formatters.formatNumber(userData.totalMessages ?? 0, 0)}\``,
            inline: true,
          },
          {
            name: "🔊 Waktu Suara Terhitung",
            value: `\`${(userData.totalVoiceDurationMillis ?? 0) > 0 ? levelingSystem.formatters.formatDuration(userData.totalVoiceDurationMillis) : "N/A"}\``,
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `Diminta oleh ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        });

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error(
        `[RankCmd] Error saat membuat rank card/embed untuk ${targetUser.id} di guild ${guild.id}:`,
        error,
      );

      try {
        await interaction.editReply({
          content: "❌ Terjadi kesalahan saat mencoba menampilkan rank.",
          files: [],
          embeds: [],
        });
      } catch (followUpError) {
        console.error("[RankCmd] Gagal mengirim pesan error:", followUpError);
      }
      levelingSystem.emit(
        "error",
        new Error(
          `Rank command error for ${targetUser.id} in ${guild.id}: ${error.message}`,
        ),
      );
    }
  },
};
