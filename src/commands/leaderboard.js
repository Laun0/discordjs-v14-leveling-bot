const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

/**
 * Menampilkan leaderboard sebagai pesan embed teks.
 * @private
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Objek interaksi.
 * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
 * @param {Array<object>} leaderboardData - Data leaderboard dari DB.
 * @param {import('discord.js').Guild} guild - Objek Guild.
 * @param {number} limit - Jumlah entri yang ditampilkan.
 * @returns {Promise<void>}
 */
async function displayAsText(
  interaction,
  levelingSystem,
  leaderboardData,
  guild,
  limit,
) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Papan Peringkat Level - ${guild.name}`)
    .setColor("#FFD700")
    .setTimestamp()
    .setDescription(
      `Menampilkan ${leaderboardData.length} pengguna teratas berdasarkan XP.`,
    );

  const leaderboardEntries = [];
  const userPromises = leaderboardData.map((entry) =>
    interaction.client.users.fetch(entry.userId).catch(() => ({
      id: entry.userId,
      username: `Unknown User (${entry.userId.slice(0, 6)}...)`,
    })),
  );
  const users = await Promise.all(userPromises);
  const userMap = new Map(users.map((u) => [u.id, u]));

  for (let i = 0; i < leaderboardData.length; i++) {
    const entry = leaderboardData[i];
    const user = userMap.get(entry.userId);
    const userTag =
      user?.username ?? `Unknown (${entry.userId.slice(0, 6)}...)`;

    leaderboardEntries.push(
      `**${i + 1}.** ${userTag} - **Lvl ${entry.level}** (${levelingSystem.formatters.formatNumber(entry.xp)} XP)`,
    );
  }

  const descriptionString = leaderboardEntries.join("\n");
  if (descriptionString.length <= 4096) {
    embed.addFields({
      name: `Peringkat 1-${leaderboardData.length}`,
      value: descriptionString || "Tidak ada data.",
    });
  } else {
    embed.addFields({
      name: `Peringkat 1-${leaderboardData.length}`,
      value: descriptionString.slice(0, 4090) + "\n..." || "Tidak ada data.",
    });
    console.warn(
      `[LeaderboardCmd] Deskripsi embed leaderboard terlalu panjang untuk guild ${guild.id}. Dipotong.`,
    );
  }

  try {
    const userRank = await levelingSystem.levelingManager.getUserRank(
      guild.id,
      interaction.user.id,
    );
    const userData = await levelingSystem.levelingManager.getUserLevelData(
      guild.id,
      interaction.user.id,
    );
    if (userRank > 0 && userData?.xp > 0) {
      embed.setFooter({
        text: `Peringkat Anda: #${userRank} (Level ${userData.level} - ${levelingSystem.formatters.formatNumber(userData.xp)} XP)`,
      });
    } else if (userData?.xp === 0) {
      embed.setFooter({ text: "Anda belum mendapatkan XP di server ini." });
    }
  } catch (rankError) {
    console.error(
      `[LeaderboardCmd] Gagal mendapatkan rank pengguna ${interaction.user.id} untuk footer:`,
      rankError,
    );
    embed.setFooter({
      text: "Tidak bisa mendapatkan peringkat Anda saat ini.",
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "📊 Menampilkan papan peringkat level pengguna di server ini.",
    )
    .addStringOption((option) =>
      option
        .setName("display")
        .setDescription("Pilih format tampilan leaderboard (default: card).")
        .setRequired(false)
        .addChoices(
          { name: "🖼️ Card (Gambar)", value: "card" },
          { name: "📄 Text (Embed)", value: "text" },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Jumlah pengguna yang ditampilkan (1-25, default: 10).")
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("global")
        .setDescription("Tampilkan leaderboard global? (Fitur belum tersedia)")
        .setRequired(false),
    ),
  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('../core/LevelingSystem')} levelingSystem
   */
  async execute(interaction, levelingSystem) {
    const isGlobal = interaction.options.getBoolean("global") ?? false;

    if (isGlobal) {
      return interaction.reply({
        content: "🛠️ Fitur leaderboard global saat ini belum tersedia.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "❌ Leaderboard server hanya bisa dilihat di dalam server.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const guildConfig = await levelingSystem.guildConfigManager.getConfig(
      interaction.guildId,
    );
    const displayType =
      interaction.options.getString("display") ??
      guildConfig.leaderboardStyle ??
      "card";
    const limit = interaction.options.getInteger("limit") ?? 10;

    await interaction.deferReply();
    const guild = interaction.guild;

    try {
      const leaderboardData =
        await levelingSystem.levelingManager.getLeaderboard(guild.id, limit);

      if (!leaderboardData || leaderboardData.length === 0) {
        return interaction.editReply(
          "🚫 Belum ada data peringkat di server ini.",
        );
      }

      if (displayType === "card") {
        try {
          const cardAttachment =
            await levelingSystem.cardGenerator.createLeaderboardCard(
              leaderboardData,
              interaction.client,
              guild.name,
              guildConfig,
            );

          if (cardAttachment) {
            let userRankText = "";
            try {
              const userRank = await levelingSystem.levelingManager.getUserRank(
                guild.id,
                interaction.user.id,
              );
              const userData =
                await levelingSystem.levelingManager.getUserLevelData(
                  guild.id,
                  interaction.user.id,
                );
              if (
                userRank > 0 &&
                userData?.xp > 0 &&
                userRank > leaderboardData.length
              ) {
                userRankText = `\n\n*Peringkat Anda saat ini: #${userRank} (Level ${userData.level})*`;
              }
            } catch {
              /* abaikan */
            }

            await interaction.editReply({
              content: userRankText || null,
              files: [cardAttachment],
            });
          } else {
            await interaction.editReply(
              "⚠️ Gagal membuat gambar leaderboard. Menampilkan versi teks...",
            );
            await displayAsText(
              interaction,
              levelingSystem,
              leaderboardData,
              guild,
              limit,
            );
          }
        } catch (cardError) {
          console.error(
            `[LeaderboardCmd] Error membuat kartu leaderboard untuk guild ${guild.id}:`,
            cardError,
          );
          levelingSystem.emit(
            "error",
            new Error(
              `Leaderboard card generation error: ${cardError.message}`,
            ),
          );
          await interaction.editReply(
            "⚠️ Gagal membuat gambar leaderboard. Menampilkan versi teks...",
          );
          await displayAsText(
            interaction,
            levelingSystem,
            leaderboardData,
            guild,
            limit,
          );
        }
      } else {
        await displayAsText(
          interaction,
          levelingSystem,
          leaderboardData,
          guild,
          limit,
        );
      }
    } catch (error) {
      console.error(
        `[LeaderboardCmd] Error saat mengambil data leaderboard untuk guild ${guild.id}:`,
        error,
      );

      await interaction
        .editReply({
          content: "❌ Terjadi kesalahan saat mencoba menampilkan leaderboard.",
        })
        .catch(console.error);

      levelingSystem.emit(
        "error",
        new Error(`Leaderboard command error in ${guild.id}: ${error.message}`),
      );
    }
  },
};
