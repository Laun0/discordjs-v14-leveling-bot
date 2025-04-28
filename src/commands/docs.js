/**
 * @description Slash command untuk menampilkan dokumentasi atau informasi bantuan.
 *              Subcommand 'config' menggunakan autocomplete untuk mencari pengaturan leveling.
 * @requires discord.js SlashCommandBuilder, EmbedBuilder, MessageFlags
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const configDocs = {
  xp_message: {
    title: "Pengaturan: XP per Pesan",
    description:
      "Mengatur jumlah Experience Points (XP) dasar yang diberikan kepada pengguna setiap kali mereka mengirim pesan yang valid (setelah cooldown dan tidak di channel/role yang diabaikan).",
    command: "`/levelconfig settings xp_message amount:<jumlah>`",
    defaultValue: "`15` XP (jika tidak diatur)",
    notes: "Setel ke `0` untuk menonaktifkan pemberian XP dari pesan.",
    example:
      "`/levelconfig settings xp_message amount:20` (memberikan 20 XP per pesan valid)",
  },
  xp_voice: {
    title: "Pengaturan: XP per Menit Suara",
    description:
      "Mengatur jumlah XP dasar yang diberikan kepada pengguna untuk setiap menit mereka aktif (tidak di-mute server/deafen) di voice channel yang valid.",
    command: "`/levelconfig settings xp_voice amount:<jumlah>`",
    defaultValue: "`5` XP per menit (jika tidak diatur)",
    notes:
      "Setel ke `0` untuk menonaktifkan pemberian XP dari aktivitas suara. XP diberikan secara periodik (misal: setiap 5 menit) atau saat keluar VC.",
    example:
      "`/levelconfig settings xp_voice amount:10` (memberikan 10 XP per menit aktif)",
  },
  cooldown: {
    title: "Pengaturan: Cooldown Pesan",
    description:
      "Mengatur jeda waktu minimum (dalam detik) antar pesan dari pengguna yang sama agar bisa mendapatkan XP lagi. Ini mencegah spamming pesan untuk XP.",
    command: "`/levelconfig settings cooldown seconds:<detik>`",
    defaultValue: "`60` detik (jika tidak diatur)",
    notes: "Nilai minimal adalah 1 detik.",
    example:
      "`/levelconfig settings cooldown seconds:45` (pengguna harus menunggu 45 detik antar pesan untuk XP)",
  },
  penalty_system: {
    title: "Pengaturan: Sistem Penalty",
    description:
      "Mengaktifkan atau menonaktifkan kemampuan untuk mengurangi XP pengguna secara manual (misalnya melalui command admin di masa depan atau fitur penalty otomatis).",
    command: "`/levelconfig settings penalty_system enabled:<true|false>`",
    defaultValue: "`false` (Nonaktif)",
    notes:
      "Fitur ini hanya mengaktifkan/menonaktifkan sistemnya, logika pengurangan XP spesifik mungkin memerlukan implementasi lebih lanjut.",
    example: "`/levelconfig settings penalty_system enabled:true`",
  },
  leaderboard_style: {
    title: "Pengaturan: Gaya Leaderboard Default",
    description:
      "Mengatur format tampilan default untuk command `/leaderboard` jika pengguna tidak menentukan gaya secara eksplisit.",
    command: "`/levelconfig settings leaderboard_style style:<card|text>`",
    defaultValue: "`card` (Gambar)",
    notes:
      "Pilihan: `card` (menampilkan gambar visual) atau `text` (menampilkan embed teks).",
    example: "`/levelconfig settings leaderboard_style style:text`",
  },
  levelup_toggle: {
    title: "Pengaturan: Notifikasi Level Up (Aktif/Nonaktif)",
    description:
      "Mengontrol apakah bot akan mengirim pesan notifikasi saat pengguna naik level.",
    command: "`/levelconfig notifications toggle enabled:<true|false>`",
    defaultValue: "`true` (Aktif)",
    notes:
      "Jika dinonaktifkan, tidak ada pesan/kartu level up yang akan dikirim, meskipun channel dan format sudah diatur.",
    example: "`/levelconfig notifications toggle enabled:false`",
  },
  levelup_channel: {
    title: "Pengaturan: Channel Notifikasi Level Up",
    description:
      "Menentukan channel teks spesifik tempat notifikasi level up akan dikirim. Jika tidak diatur, bot akan mencoba mengirim ke channel default server (system channel) atau tempat user terakhir aktif (tergantung implementasi fallback).",
    command: "`/levelconfig notifications channel channel:[#channel]`",
    defaultValue: "`Default Server` (System Channel atau fallback lain)",
    notes:
      "Kosongkan opsi channel pada command untuk kembali ke perilaku default. Bot harus memiliki izin kirim di channel yang dipilih.",
    example: "`/levelconfig notifications channel channel:#pengumuman-level`",
  },
  levelup_message: {
    title: "Pengaturan: Format Pesan Level Up",
    description:
      "Mengatur template teks yang digunakan dalam pesan notifikasi level up. Anda dapat menggunakan variabel placeholder yang akan diganti dengan data pengguna.",
    command:
      '`/levelconfig notifications message_format format:"<teks_format>"`',
    defaultValue:
      "`Selamat {userMention}! 🎉 Kamu telah naik ke **Level {level}**! (Rank: {rank})`",
    notes:
      "Variabel yang tersedia: `{userMention}`, `{username}`, `{userId}`, `{level}` (level baru), `{rank}` (peringkat baru), `{guildName}`. Pesan harus menyertakan minimal `{level}` dan salah satu dari `{userMention}` atau `{username}`.",
    example:
      '`/levelconfig notifications message_format format:"Hore {username}, kamu sekarang Level {level} di {guildName}!"`',
  },
  ignored_roles: {
    title: "Pengaturan: Role yang Diabaikan",
    description:
      "Menambahkan atau menghapus role dari daftar abaikan. Pengguna dengan role ini tidak akan mendapatkan XP dari aktivitas apapun (pesan/suara).",
    command: "`/levelconfig ignores <add_role|remove_role> role:[@role]`",
    defaultValue: "`Tidak ada`",
    notes: "Berguna untuk role bot, role admin khusus, atau role muted.",
    example:
      "`/levelconfig ignores add_role role:@Bot`\n`/levelconfig ignores remove_role role:@Muted`",
  },
  ignored_channels: {
    title: "Pengaturan: Channel yang Diabaikan",
    description:
      "Menambahkan atau menghapus channel (teks atau suara) dari daftar abaikan. Aktivitas di channel ini tidak akan memberikan XP.",
    command:
      "`/levelconfig ignores <add_channel|remove_channel> channel:[#channel]`",
    defaultValue: "`Tidak ada`",
    notes:
      "Berguna untuk channel spam, channel bot commands, atau channel AFK.",
    example:
      "`/levelconfig ignores add_channel channel:#bot-spam`\n`/levelconfig ignores remove_channel channel:#afk-area`",
  },
  role_multiplier: {
    title: "Pengaturan: Multiplier XP Role",
    description:
      "Memberikan pengganda (multiplier) XP kepada pengguna yang memiliki role tertentu. Jika pengguna memiliki beberapa role dengan multiplier, multiplier tertinggi yang akan digunakan.",
    command:
      "`/levelconfig multipliers <set_role|remove_role> role:[@role] [multiplier:<angka>]`",
    defaultValue: "`Tidak ada`",
    notes:
      "Multiplier adalah faktor pengali (misal: `1.5` berarti +50% XP, `2.0` berarti 2x XP, `0.5` berarti -50% XP). Gunakan `remove_role` untuk menghapus multiplier.",
    example:
      "`/levelconfig multipliers set_role role:@VIP multiplier:1.5`\n`/levelconfig multipliers remove_role role:@Booster`",
  },
  channel_multiplier: {
    title: "Pengaturan: Multiplier XP Channel",
    description:
      "Memberikan pengganda (multiplier) XP untuk aktivitas (biasanya pesan) yang terjadi di channel tertentu.",
    command:
      "`/levelconfig multipliers <set_channel|remove_channel> channel:[#channel] [multiplier:<angka>]`",
    defaultValue: "`Tidak ada`",
    notes:
      "Multiplier adalah faktor pengali (misal: `1.2` untuk +20% XP di channel event, `0.8` untuk -20% di channel diskusi umum). Gunakan `remove_channel` untuk menghapus.",
    example:
      "`/levelconfig multipliers set_channel channel:#acara-khusus multiplier:1.2`\n`/levelconfig multipliers remove_channel channel:#general`",
  },
  level_roles: {
    title: "Pengaturan: Role Reward Level",
    description:
      "Secara otomatis memberikan role kepada pengguna ketika mereka mencapai level tertentu. Anda dapat menambahkan, memperbarui, atau menghapus role reward ini.",
    command:
      "`/levelconfig rewards <add_role|remove_role|list_roles> [level:<level>] [role:[@role]]`",
    defaultValue: "`Tidak ada`",
    notes:
      "Gunakan `add_role` untuk menambah/mengupdate, `remove_role` untuk menghapus berdasarkan level, dan `list_roles` untuk melihat daftar saat ini. Pastikan bot memiliki izin untuk mengelola role tersebut dan posisi role bot lebih tinggi.",
    example:
      "`/levelconfig rewards add_role level:10 role:@Member Aktif`\n`/levelconfig rewards remove_role level:5`\n`/levelconfig rewards list_roles`",
  },
  role_strategy: {
    title: "Pengaturan: Strategi Hapus Role Lama",
    description:
      "Menentukan apa yang terjadi pada role level sebelumnya ketika pengguna naik level dan mendapatkan role baru.",
    command: "`/levelconfig rewards role_strategy strategy:<pilihan>`",
    defaultValue: "`keep_all`",
    notes:
      "Pilihan:\n`keep_all`: Semua role level yang didapat akan disimpan.\n`highest_only`: Hanya role dari level tertinggi yang dicapai yang akan disimpan, role level lebih rendah akan dihapus.\n`remove_previous`: Semua role dari level di bawah level baru akan dihapus.",
    example: "`/levelconfig rewards role_strategy strategy:highest_only`",
  },
};

/**
 * @module docsCommand
 * @description Definisi dan eksekusi untuk slash command `/docs`.
 */
module.exports = {
  /**
   * @property {SlashCommandBuilder} data - Konfigurasi slash command `/docs`.
   */
  data: new SlashCommandBuilder()
    .setName("docs")
    .setDescription("📚 Menampilkan dokumentasi atau informasi bantuan.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription(
          "📖 Menampilkan dokumentasi untuk pengaturan konfigurasi leveling.",
        )
        .addStringOption((option) =>
          option
            .setName("setting")
            .setDescription(
              "Mulai ketik nama pengaturan untuk mencari dokumentasi.",
            )
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  /**
   * Fungsi yang menangani permintaan autocomplete untuk opsi 'setting'.
   * @function autocomplete
   * @param {import('discord.js').AutocompleteInteraction} interaction - Objek interaksi autocomplete.
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @async
   */
  async autocomplete(interaction, levelingSystem) {
    const focusedOption = interaction.options.getFocused(true);
    let suggestions = [];

    if (focusedOption.name === "setting") {
      const focusedValue = focusedOption.value.toLowerCase();

      const filteredKeys = Object.keys(configDocs).filter((key) => {
        const title = configDocs[key].title?.toLowerCase() || "";
        return (
          key.toLowerCase().includes(focusedValue) ||
          title.includes(focusedValue)
        );
      });

      suggestions = filteredKeys
        .map((key) => {
          const name =
            configDocs[key].title?.replace("Pengaturan: ", "") ||
            key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          return {
            name: name.length > 100 ? name.slice(0, 97) + "..." : name,
            value: key,
          };
        })
        .slice(0, 25);
    }

    try {
      await interaction.respond(suggestions);
    } catch (error) {
      console.error(`[DocsAutocomplete] Gagal merespon autocomplete:`, error);
    }
  },

  /**
   * Fungsi eksekusi utama untuk command `/docs`.
   * @function execute
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - Objek interaksi command.
   * @param {import('../core/LevelingSystem')} levelingSystem - Instance LevelingSystem.
   * @async
   */
  async execute(interaction, levelingSystem) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "config") {
      const settingKey = interaction.options.getString("setting", true);
      const docData = configDocs[settingKey];

      if (!docData) {
        return interaction.reply({
          content: `❌ Tidak dapat menemukan dokumentasi untuk \`${settingKey}\`. Pastikan Anda memilih dari saran yang muncul.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(docData.title || `Dokumentasi: ${settingKey}`)
        .setDescription(docData.description || "Tidak ada deskripsi.")
        .setColor("#4F545C")
        .addFields(
          {
            name: "🛠️ Cara Mengatur",
            value: docData.command || "Tidak ditentukan.",
          },
          {
            name: "⚙️ Nilai Default",
            value: docData.defaultValue || "Tidak ditentukan.",
          },
        );
      if (docData.notes)
        embed.addFields({ name: "📝 Catatan", value: docData.notes });
      if (docData.example)
        embed.addFields({ name: "💡 Contoh", value: docData.example });

      await interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      await interaction.reply({
        content: "Subcommand dokumentasi tidak dikenal.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
