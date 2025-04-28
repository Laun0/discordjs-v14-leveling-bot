/**
 * @description Slash command untuk menampilkan informasi detail tentang bot.
 * @requires discord.js SlashCommandBuilder, EmbedBuilder, version as djsVersion, PermissionsBitField
 * @requires os - Modul Node.js untuk info sistem operasi.
 * @requires process - Modul Node.js untuk info proses.
 * @requires ../core/LevelingSystem (tipe parameter execute)
 * @requires ../utils/formatters (implisit via levelingSystem)
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  version: djsVersion,
  PermissionsBitField,
} = require("discord.js");
const os = require("os");
const process = require("process");

/**
 * @module botInfoCommand
 * @description Definisi dan eksekusi untuk slash command `/botinfo`.
 */
module.exports = {
  /**
   * @property {SlashCommandBuilder} data - Konfigurasi slash command `/botinfo`.
   */
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("ℹ️ Menampilkan informasi lengkap tentang bot ini."),

  /**
   * Fungsi eksekusi utama untuk command `/botinfo`.
   * Mengumpulkan informasi tentang bot, sistem, dan statistik, lalu menampilkannya dalam embed.
   * @function execute
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Objek interaksi command.
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @async
   */
  async execute(interaction, levelingSystem) {
    const client = interaction.client;
    const app = await client.application.fetch();
    const format = levelingSystem.formatters;

    let ownerTag = "";
    if (app.owner) {
      if (app.owner.tag) {
        ownerTag = app.owner.tag;
      } else if (app.owner.name) {
        ownerTag = `Team ${app.owner.name}`;
        const members = await app.owner.fetchMembers();
        ownerTag += ` (${members.size} anggota)`;
      }
    }

    const clientUptime = format.formatDuration(client.uptime);
    const processUptime = format.formatDuration(process.uptime() * 1000);
    const levelingSystemUptime = levelingSystem.startTime
      ? format.formatDuration(Date.now() - levelingSystem.startTime)
      : "N/A";

    const serverCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0,
    );
    const channelCount = client.channels.cache.size;

    const cachedUsers = levelingSystem.cacheManager.getStats().keys;
    const totalLevelEntries =
      await require("../database/schemas/UserLevel").countDocuments();

    const nodeVersion = process.version;
    const memoryUsage = format.formatBytes(process.memoryUsage().rss);

    const osType = `${os.type()} (${os.release()})`;
    const cpuModel = os.cpus()[0]?.model || "Tidak Diketahui";
    const cpuCores = os.cpus().length;

    const invitePerms = [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.ManageRoles,
    ];
    const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=${new PermissionsBitField(invitePerms).bitfield}&scope=bot%20applications.commands`;
    const supportServer = process.env.SUPPORT_SERVER_INVITE || null;
    const sourceCode = process.env.SOURCE_CODE_URL || null;

    const embed = new EmbedBuilder()
      .setColor(client.user.accentColor || "#5865F2")
      .setAuthor({
        name: `${client.user.username} - Informasi Bot`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: "🏷️ Nama Bot", value: client.user.tag, inline: true },
        {
          name: "🆔 ID Bot",
          value: `\`${client.user.id}\``,
          inline: true,
        },
        { name: "👑 Owner", value: `\`${ownerTag}\``, inline: true },
        {
          name: "🌐 Server",
          value: `\`${format.formatNumber(serverCount, 0)}\``,
          inline: true,
        },
        {
          name: "👥 Pengguna (Est.)",
          value: `\`${format.formatNumber(userCount, 0)}\``,
          inline: true,
        },
        {
          name: "📺 Channels",
          value: `\`${format.formatNumber(channelCount, 0)}\``,
          inline: true,
        },
        {
          name: "⏱️ Uptime Bot",
          value: `\`${clientUptime}\``,
          inline: true,
        },
        {
          name: "⚙️ Uptime Proses",
          value: `\`${processUptime}\``,
          inline: true,
        },
        {
          name: "📊 Uptime Leveling",
          value: `\`${levelingSystemUptime}\``,
          inline: true,
        },
        {
          name: " DJS Version",
          value: `\`v${djsVersion}\``,
          inline: true,
        },
        {
          name: "Node.js Version",
          value: `\`${nodeVersion}\``,
          inline: true,
        },
        {
          name: "💾 Memory Usage",
          value: `\`${memoryUsage}\``,
          inline: true,
        },
        {
          name: "💻 Sistem Operasi",
          value: `\`${osType}\``,
          inline: true,
        },
        {
          name: "🔩 Arsitektur CPU",
          value: `\`${process.arch}\``,
          inline: true,
        },
        {
          name: "🧠 CPU Core",
          value: `\`${cpuCores} Core(s)\``,
          inline: true,
        },
        {
          name: "💡 CPU Model",
          value: `\`${cpuModel}\``,
          inline: false,
        },
        {
          name: "💾 User Level di Cache",
          value: `\`${format.formatNumber(cachedUsers, 0)}\``,
          inline: true,
        },
        {
          name: "🗃️ Total Data Level (DB)",
          value: `\`${format.formatNumber(totalLevelEntries, 0)}\``,
          inline: true,
        },
      )
      .setTimestamp();

    let linkField = `[Undang Bot](${inviteLink})`;
    if (supportServer) linkField += ` • [Server Support](${supportServer})`;
    if (sourceCode) linkField += ` • [Source Code](${sourceCode})`;
    embed.addFields({
      name: "🔗 Link Penting",
      value: linkField,
      inline: false,
    });

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (replyError) {
      console.error("[BotInfoCmd] Gagal mengirim balasan:", replyError);
    }
  },
};
