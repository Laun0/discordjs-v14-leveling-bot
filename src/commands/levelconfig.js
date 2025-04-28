/**
 * @description Slash command untuk mengelola konfigurasi sistem leveling per server.
 *              Memerlukan izin 'Manage Guild'. Menyediakan subcommand untuk mengatur
 *              berbagai aspek seperti rate XP, cooldown, notifikasi, role rewards,
 *              daftar abaikan, multiplier, dan melihat/mereset konfigurasi.
 * @requires discord.js SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, Role, TextChannel, MessageFlags
 * @requires ../core/LevelingSystem (tipe parameter execute)
 * @requires ../managers/GuildConfigManager (implisit via levelingSystem)
 * @requires ../core/LevelingManager (implisit via levelingSystem, untuk reset)
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  Role,
  TextChannel,
  MessageFlags,
} = require("discord.js");

/**
 * Membuat dan mengembalikan EmbedBuilder yang menampilkan ringkasan konfigurasi leveling saat ini.
 * @function createConfigEmbed
 * @param {object} config - Objek konfigurasi server yang sudah dinormalisasi.
 * @param {string} guildName - Nama server untuk ditampilkan di judul embed.
 * @returns {EmbedBuilder} Instance EmbedBuilder yang siap dikirim.
 * @private
 */
function createConfigEmbed(config, guildName) {
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Konfigurasi Leveling - ${guildName}`)
    .setColor("#7289DA")
    .setTimestamp()
    .setFooter({ text: "Gunakan subcommand lain untuk mengubah pengaturan." });

  embed.addFields(
    {
      name: "💰 XP per Pesan",
      value: `\`${config.xpPerMessage ?? 0}\` XP`,
      inline: true,
    },
    {
      name: "🎤 XP per Menit Suara",
      value: `\`${config.xpPerMinuteVoice ?? 0}\` XP/menit`,
      inline: true,
    },
    {
      name: "⏳ Cooldown Pesan",
      value: `\`${config.messageCooldownSeconds ?? 60}\` detik`,
      inline: true,
    },
  );

  const luChannel = config.levelUpChannelId
    ? `<#${config.levelUpChannelId}>`
    : "`Channel Saat Ini`";
  embed.addFields(
    {
      name: "📢 Notifikasi Level Up",
      value: config.levelUpMessageEnabled
        ? `✅ Aktif (${luChannel})`
        : "❌ Nonaktif",
      inline: false,
    },
    {
      name: "📄 Format Pesan Level Up",
      value: `\`\`\`\n${config.levelUpMessageFormat || "Default"}\n\`\`\``,
      inline: false,
    },
  );

  const ignoredRolesText =
    config.ignoredRoles?.map((id) => `<@&${id}>`).join(", ") || "`Tidak ada`";
  const ignoredChannelsText =
    config.ignoredChannels?.map((id) => `<#${id}>`).join(", ") || "`Tidak ada`";
  embed.addFields(
    {
      name: "🚫 Role Diabaikan",
      value:
        ignoredRolesText.length > 1024
          ? ignoredRolesText.slice(0, 1020) + "..."
          : ignoredRolesText,
      inline: true,
    },
    {
      name: "🔇 Channel Diabaikan",
      value:
        ignoredChannelsText.length > 1024
          ? ignoredChannelsText.slice(0, 1020) + "..."
          : ignoredChannelsText,
      inline: true,
    },
  );

  let roleMultipliersText = "`Tidak ada`";
  if (
    config.roleMultipliers instanceof Map &&
    config.roleMultipliers.size > 0
  ) {
    roleMultipliersText = Array.from(config.roleMultipliers.entries())
      .map(([id, multi]) => `<@&${id}>: \`${multi}x\``)
      .join("\n");
  }
  let channelMultipliersText = "`Tidak ada`";
  if (
    config.channelMultipliers instanceof Map &&
    config.channelMultipliers.size > 0
  ) {
    channelMultipliersText = Array.from(config.channelMultipliers.entries())
      .map(([id, multi]) => `<#${id}>: \`${multi}x\``)
      .join("\n");
  }
  embed.addFields(
    {
      name: "✨ Role Multiplier",
      value:
        roleMultipliersText.length > 1024
          ? roleMultipliersText.slice(0, 1020) + "..."
          : roleMultipliersText,
      inline: true,
    },
    {
      name: "🔊 Channel Multiplier",
      value:
        channelMultipliersText.length > 1024
          ? channelMultipliersText.slice(0, 1020) + "..."
          : channelMultipliersText,
      inline: true,
    },
  );

  let levelRolesText = "`Tidak ada`";
  if (config.levelRoles instanceof Map && config.levelRoles.size > 0) {
    const sortedLevelRoles = Array.from(config.levelRoles.entries()).sort(
      (a, b) => parseInt(a[0], 10) - parseInt(b[0], 10),
    );
    levelRolesText = sortedLevelRoles
      .map(([lvl, id]) => `Lvl ${lvl}: <@&${id}>`)
      .join("\n");
  }
  embed.addFields(
    {
      name: "🎁 Role Rewards",
      value:
        levelRolesText.length > 1024
          ? levelRolesText.slice(0, 1020) + "..."
          : levelRolesText,
      inline: false,
    },
    {
      name: "🗑️ Strategi Hapus Role Lama",
      value: `\`${config.roleRemovalStrategy || "keep_all"}\``,
      inline: true,
    },
  );

  embed.addFields(
    {
      name: "📉 Sistem Penalty",
      value: config.enablePenaltySystem ? "✅ Aktif" : "❌ Nonaktif",
      inline: true,
    },
    {
      name: "🎨 Style Leaderboard",
      value: `\`${config.leaderboardStyle || "card"}\``,
      inline: true,
    },
  );

  return embed;
}

/**
 * @module levelConfigCommand
 * @description Definisi dan eksekusi untuk slash command `/levelconfig`.
 */
module.exports = {
  /**
   * @property {SlashCommandBuilder} data - Konfigurasi slash command, termasuk nama, deskripsi,
   *                                       izin default, dan struktur subcommand/group/options.
   */
  data: new SlashCommandBuilder()
    .setName("levelconfig")
    .setDescription("🔧 Mengatur konfigurasi sistem leveling untuk server ini.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("settings")
        .setDescription("⚙️ Ubah pengaturan dasar leveling.")
        .addSubcommand((sub) =>
          sub
            .setName("xp_message")
            .setDescription("Atur jumlah XP yang didapat per pesan.")
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("Jumlah XP (0=nonaktif).")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(1000),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("xp_voice")
            .setDescription(
              "Atur jumlah XP yang didapat per menit di voice chat.",
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("Jumlah XP/menit (0=nonaktif).")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(500),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("cooldown")
            .setDescription("Atur cooldown XP antar pesan (dalam detik).")
            .addIntegerOption((opt) =>
              opt
                .setName("seconds")
                .setDescription("Durasi cooldown (min 1 detik).")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(3600),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("penalty_system")
            .setDescription(
              "Aktifkan atau nonaktifkan sistem pengurangan XP (penalty).",
            )
            .addBooleanOption((opt) =>
              opt
                .setName("enabled")
                .setDescription("True=aktif, False=nonaktif.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("leaderboard_style")
            .setDescription("Atur tampilan default leaderboard.")
            .addStringOption((opt) =>
              opt
                .setName("style")
                .setDescription("Pilih tampilan")
                .setRequired(true)
                .addChoices(
                  { name: "🖼️ Card (Gambar)", value: "card" },
                  { name: "📄 Text (Embed)", value: "text" },
                ),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("notifications")
        .setDescription("📢 Atur notifikasi level up.")
        .addSubcommand((sub) =>
          sub
            .setName("toggle")
            .setDescription("Aktifkan/nonaktifkan pesan notifikasi level up.")
            .addBooleanOption((opt) =>
              opt
                .setName("enabled")
                .setDescription("True=aktif, False=nonaktif.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("channel")
            .setDescription("Atur channel spesifik untuk notifikasi level up.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription(
                  "Pilih channel teks (kosongkan = channel default).",
                )
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("message_format")
            .setDescription("Atur format pesan level up.")
            .addStringOption((opt) =>
              opt
                .setName("format")
                .setDescription(
                  "Variabel: {userMention}, {username}, {level}, {rank}.",
                )
                .setRequired(true)
                .setMaxLength(1000),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("ignores")
        .setDescription(
          "🚫 Atur role atau channel yang diabaikan (tidak dapat XP).",
        )
        .addSubcommand((sub) =>
          sub
            .setName("add_role")
            .setDescription("Tambahkan role ke daftar abaikan.")
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role yang akan diabaikan.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_role")
            .setDescription("Hapus role dari daftar abaikan.")
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role yang akan dihapus.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("add_channel")
            .setDescription("Tambahkan channel ke daftar abaikan.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel yang akan diabaikan.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_channel")
            .setDescription("Hapus channel dari daftar abaikan.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel yang akan dihapus.")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("multipliers")
        .setDescription("✨ Atur pengganda XP untuk role atau channel.")
        .addSubcommand((sub) =>
          sub
            .setName("set_role")
            .setDescription("Atur/Update multiplier XP untuk role.")
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role target.")
                .setRequired(true),
            )
            .addNumberOption((opt) =>
              opt
                .setName("multiplier")
                .setDescription("Faktor pengali (e.g., 1.5 = +50%).")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(10),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_role")
            .setDescription("Hapus multiplier XP dari role.")
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role target.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("set_channel")
            .setDescription("Atur/Update multiplier XP untuk channel.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel target.")
                .setRequired(true),
            )
            .addNumberOption((opt) =>
              opt
                .setName("multiplier")
                .setDescription("Faktor pengali (e.g., 1.2 = +20%).")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(5),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_channel")
            .setDescription("Hapus multiplier XP dari channel.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel target.")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("rewards")
        .setDescription("🎁 Atur role reward otomatis berdasarkan level.")
        .addSubcommand((sub) =>
          sub
            .setName("add_role")
            .setDescription(
              "Tambahkan/Update role reward untuk level tertentu.",
            )
            .addIntegerOption((opt) =>
              opt
                .setName("level")
                .setDescription("Level minimum.")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000),
            )
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role yang diberikan.")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_role")
            .setDescription("Hapus role reward dari level tertentu.")
            .addIntegerOption((opt) =>
              opt
                .setName("level")
                .setDescription("Level target.")
                .setRequired(true)
                .setMinValue(1),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("list_roles")
            .setDescription("Tampilkan daftar role reward yang sudah diatur."),
        )
        .addSubcommand((sub) =>
          sub
            .setName("role_strategy")
            .setDescription(
              "Atur bagaimana role level lama dihapus saat naik level.",
            )
            .addStringOption((opt) =>
              opt
                .setName("strategy")
                .setDescription("Pilih strategi penghapusan")
                .setRequired(true)
                .addChoices(
                  { name: "Keep All (Biarkan semua role)", value: "keep_all" },
                  {
                    name: "Highest Only (Hanya role tertinggi)",
                    value: "highest_only",
                  },
                  {
                    name: "Remove Previous (Hapus level sebelumnya)",
                    value: "remove_previous",
                  },
                ),
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription(
          "👀 Menampilkan konfigurasi leveling saat ini untuk server ini.",
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset_guild_data")
        .setDescription(
          "🚨 HAPUS SEMUA data level pengguna di server ini! (Butuh konfirmasi)",
        )
        .addBooleanOption((opt) =>
          opt
            .setName("confirm")
            .setDescription("Ketik `true` untuk konfirmasi penghapusan total.")
            .setRequired(true),
        ),
    ),

  /**
   * Fungsi eksekusi utama untuk command `/levelconfig`.
   * @function execute
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Objek interaksi command.
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @async
   */
  async execute(interaction, levelingSystem) {
    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guildId = interaction.guildId;
    const configManager = levelingSystem.guildConfigManager;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      let currentConfig = await configManager.getConfig(guildId);
      let update = {};
      let message = "";

      if (subcommand === "view") {
        const embed = createConfigEmbed(currentConfig, interaction.guild.name);
        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === "reset_guild_data") {
        const confirmation = interaction.options.getBoolean("confirm");
        if (confirmation === true) {
          const deletedCount =
            await levelingSystem.levelingManager.resetGuildLevels(guildId);
          message =
            deletedCount !== null
              ? `✅ Berhasil menghapus **${deletedCount}** data level pengguna di server ini.`
              : `❌ Terjadi kesalahan saat mencoba mereset data level server.`;
        } else {
          message = `ℹ️ Reset data level server dibatalkan. Konfirmasi tidak valid.`;
        }
        return interaction.editReply({ content: message });
      }

      switch (group) {
        case "settings":
          switch (subcommand) {
            case "xp_message":
              update.xpPerMessage = interaction.options.getInteger("amount");
              message = `✅ XP per pesan diatur ke \`${update.xpPerMessage}\`.`;
              break;
            case "xp_voice":
              update.xpPerMinuteVoice =
                interaction.options.getInteger("amount");
              message = `✅ XP per menit suara diatur ke \`${update.xpPerMinuteVoice}\`.`;
              break;
            case "cooldown":
              update.messageCooldownSeconds =
                interaction.options.getInteger("seconds");
              message = `✅ Cooldown XP pesan diatur ke \`${update.messageCooldownSeconds}\` detik.`;
              break;
            case "penalty_system":
              update.enablePenaltySystem =
                interaction.options.getBoolean("enabled");
              message = `✅ Sistem penalty diatur ke: ${update.enablePenaltySystem ? "**Aktif**" : "**Nonaktif**"}.`;
              break;
            case "leaderboard_style":
              update.leaderboardStyle = interaction.options.getString("style");
              message = `✅ Tampilan default leaderboard diatur ke \`${update.leaderboardStyle}\`.`;
              break;
          }
          break;

        case "notifications":
          switch (subcommand) {
            case "toggle":
              update.levelUpMessageEnabled =
                interaction.options.getBoolean("enabled");
              message = `✅ Notifikasi level up diatur ke: ${update.levelUpMessageEnabled ? "**Aktif**" : "**Nonaktif**"}.`;
              break;
            case "channel":
              const channel = interaction.options.getChannel("channel");
              update.levelUpChannelId = channel ? channel.id : null;
              message = channel
                ? `✅ Notifikasi level up akan dikirim ke ${channel}.`
                : `✅ Notifikasi level up akan dikirim di channel default.`;
              break;
            case "message_format":
              const format = interaction.options.getString("format");
              if (
                !format.includes("{userMention}") &&
                !format.includes("{username}")
              ) {
                return interaction.editReply(
                  "⚠️ Format pesan harus menyertakan `{userMention}` atau `{username}`.",
                );
              }
              if (!format.includes("{level}")) {
                return interaction.editReply(
                  "⚠️ Format pesan harus menyertakan `{level}`.",
                );
              }
              update.levelUpMessageFormat = format;
              message = `✅ Format pesan level up diatur:\n\`\`\`\n${format}\n\`\`\``;
              break;
          }
          break;

        case "ignores":
          const roleIgnore = interaction.options.getRole("role");
          const channelIgnore = interaction.options.getChannel("channel");
          switch (subcommand) {
            case "add_role":
              if (!currentConfig.ignoredRoles.includes(roleIgnore.id)) {
                update.ignoredRoles = [
                  ...currentConfig.ignoredRoles,
                  roleIgnore.id,
                ];
                message = `✅ Role ${roleIgnore} telah ditambahkan ke daftar abaikan XP.`;
              } else {
                message = `ℹ️ Role ${roleIgnore} sudah ada di daftar abaikan.`;
                update = null;
              }
              break;
            case "remove_role":
              if (currentConfig.ignoredRoles.includes(roleIgnore.id)) {
                update.ignoredRoles = currentConfig.ignoredRoles.filter(
                  (id) => id !== roleIgnore.id,
                );
                message = `✅ Role ${roleIgnore} telah dihapus dari daftar abaikan XP.`;
              } else {
                message = `ℹ️ Role ${roleIgnore} tidak ditemukan di daftar abaikan.`;
                update = null;
              }
              break;
            case "add_channel":
              if (!currentConfig.ignoredChannels.includes(channelIgnore.id)) {
                update.ignoredChannels = [
                  ...currentConfig.ignoredChannels,
                  channelIgnore.id,
                ];
                message = `✅ Channel ${channelIgnore} telah ditambahkan ke daftar abaikan XP.`;
              } else {
                message = `ℹ️ Channel ${channelIgnore} sudah ada di daftar abaikan.`;
                update = null;
              }
              break;
            case "remove_channel":
              if (currentConfig.ignoredChannels.includes(channelIgnore.id)) {
                update.ignoredChannels = currentConfig.ignoredChannels.filter(
                  (id) => id !== channelIgnore.id,
                );
                message = `✅ Channel ${channelIgnore} telah dihapus dari daftar abaikan XP.`;
              } else {
                message = `ℹ️ Channel ${channelIgnore} tidak ditemukan di daftar abaikan.`;
                update = null;
              }
              break;
          }
          break;

        case "multipliers":
          const roleMulti = interaction.options.getRole("role");
          const channelMulti = interaction.options.getChannel("channel");
          const multiplier = interaction.options.getNumber("multiplier");
          switch (subcommand) {
            case "set_role":
              const newRoleMultipliers = new Map(currentConfig.roleMultipliers);
              newRoleMultipliers.set(roleMulti.id, multiplier);
              update.roleMultipliers = newRoleMultipliers;
              message = `✅ Multiplier XP untuk role ${roleMulti} diatur ke \`${multiplier}x\`.`;
              break;
            case "remove_role":
              const currentRoleMultipliers = new Map(
                currentConfig.roleMultipliers,
              );
              if (currentRoleMultipliers.delete(roleMulti.id)) {
                update.roleMultipliers = currentRoleMultipliers;
                message = `✅ Multiplier XP untuk role ${roleMulti} telah dihapus.`;
              } else {
                message = `ℹ️ Role ${roleMulti} tidak memiliki multiplier XP.`;
                update = null;
              }
              break;
            case "set_channel":
              const newChannelMultipliers = new Map(
                currentConfig.channelMultipliers,
              );
              newChannelMultipliers.set(channelMulti.id, multiplier);
              update.channelMultipliers = newChannelMultipliers;
              message = `✅ Multiplier XP untuk channel ${channelMulti} diatur ke \`${multiplier}x\`.`;
              break;
            case "remove_channel":
              const currentChannelMultipliers = new Map(
                currentConfig.channelMultipliers,
              );
              if (currentChannelMultipliers.delete(channelMulti.id)) {
                update.channelMultipliers = currentChannelMultipliers;
                message = `✅ Multiplier XP untuk channel ${channelMulti} telah dihapus.`;
              } else {
                message = `ℹ️ Channel ${channelMulti} tidak memiliki multiplier XP.`;
                update = null;
              }
              break;
          }
          break;

        case "rewards":
          const level = interaction.options.getInteger("level");
          const roleReward = interaction.options.getRole("role");
          switch (subcommand) {
            case "add_role":
              const botMember = await interaction.guild.members.fetch(
                interaction.client.user.id,
              );
              if (roleReward.position >= botMember.roles.highest.position) {
                return interaction.editReply(
                  `❌ Saya tidak bisa memberikan role ${roleReward} karena posisinya lebih tinggi atau sama dengan role tertinggi saya.`,
                );
              }
              const newLevelRoles = new Map(currentConfig.levelRoles);
              newLevelRoles.set(level.toString(), roleReward.id);
              update.levelRoles = newLevelRoles;
              message = `✅ Role ${roleReward} akan diberikan saat pengguna mencapai **Level ${level}**.`;
              break;
            case "remove_role":
              const currentLevelRoles = new Map(currentConfig.levelRoles);
              if (currentLevelRoles.delete(level.toString())) {
                update.levelRoles = currentLevelRoles;
                message = `✅ Role reward untuk **Level ${level}** telah dihapus.`;
              } else {
                message = `ℹ️ Tidak ada role reward yang terdaftar untuk Level ${level}.`;
                update = null;
              }
              break;
            case "list_roles":
              const listEmbed = new EmbedBuilder()
                .setTitle("🎁 Daftar Role Reward Level")
                .setColor(
                  currentConfig.levelRoles?.size > 0 ? "#00FF00" : "#FFA500",
                )
                .setTimestamp();
              let listDescription = "Belum ada role reward yang diatur.";
              if (
                currentConfig.levelRoles instanceof Map &&
                currentConfig.levelRoles.size > 0
              ) {
                const sortedRewards = Array.from(
                  currentConfig.levelRoles.entries(),
                ).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
                listDescription = sortedRewards
                  .map(([lvl, id]) => `**Level ${lvl}:** <@&${id}>`)
                  .join("\n");

                if (listDescription.length > 4090) {
                  listDescription =
                    listDescription.slice(0, 4080) + "\n... (dan lainnya)";
                }
              }
              listEmbed.setDescription(listDescription);
              return interaction.editReply({ embeds: [listEmbed] });
            case "role_strategy":
              update.roleRemovalStrategy =
                interaction.options.getString("strategy");
              message = `✅ Strategi penghapusan role lama saat naik level diatur ke \`${update.roleRemovalStrategy}\`.`;
              break;
          }
          break;

        default:
          console.warn(
            `[LevelConfig] Subcommand/Group tidak valid: ${group}/${subcommand}`,
          );
          return interaction.editReply({
            content: "❌ Perintah konfigurasi tidak valid.",
          });
      }

      if (update && Object.keys(update).length > 0) {
        await configManager.updateConfig(guildId, update);
        await interaction.editReply({ content: message });
      } else if (message) {
        await interaction.editReply({ content: message });
      } else {
        await interaction.editReply({
          content: "ℹ️ Tidak ada perubahan yang dilakukan.",
        });
      }
    } catch (error) {
      console.error(
        `[LevelConfig] Error pada ${group ? group + "/" : ""}${subcommand} di guild ${guildId}:`,
        error,
      );
      await interaction
        .editReply({
          content: "❌ Terjadi kesalahan saat memproses konfigurasi.",
        })
        .catch(console.error);
      levelingSystem.emit(
        "error",
        new Error(
          `Levelconfig command error (${subcommand}): ${error.message}`,
        ),
      );
    }
  },
};
