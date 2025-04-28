/**
 * @description Event handler untuk event 'interactionCreate' dari Discord Client.
 *              Menangani berbagai jenis interaksi yang diterima bot,
 *              terutama Slash Commands (ChatInputCommand), Autocomplete,
 *              dan menyediakan placeholder untuk interaksi lain seperti Buttons, Select Menus, dan Modals.
 * @requires discord.js Events, InteractionType
 * @requires ../core/LevelingSystem (tipe properti client)
 */

const { Events, InteractionType } = require("discord.js");

/**
 * @module interactionCreateEvent
 * @property {Events} name - Nama event Discord.js (Events.InteractionCreate).
 * @property {boolean} discordEvent - Menandakan ini adalah event dari Discord Client.
 * @property {function} execute - Fungsi yang akan dijalankan saat event 'interactionCreate' dipicu.
 */
module.exports = {
  name: Events.InteractionCreate,
  discordEvent: true,
  /**
   * Handler untuk semua jenis interaksi yang diterima bot.
   * Mengarahkan interaksi ke handler yang sesuai (command, autocomplete, dll.).
   * @function execute
   * @param {import('discord.js').Client & {levelingSystem: import('../core/LevelingSystem')}} client - Instance Discord Client dengan properti levelingSystem.
   * @param {import('discord.js').Interaction} interaction - Objek interaksi yang diterima.
   * @async
   */
  async execute(client, interaction) {
    // --- Handle Slash Commands (ChatInputCommand) ---
    if (interaction.isChatInputCommand()) {
      if (!client.levelingSystem?.commands) {
        console.error(
          "[Interaction] LevelingSystem atau command collection tidak ditemukan di client.",
        );
        return;
      }
      const command = client.levelingSystem.commands.get(
        interaction.commandName,
      );

      if (!command) {
        console.error(
          `[Interaction] Command '${interaction.commandName}' tidak ditemukan.`,
        );
        try {
          await interaction.reply({
            content: "❌ Command ini tidak ditemukan atau tidak valid.",
            flags: ["Ephemeral"],
          });
        } catch (err) {
          console.error(
            "[Interaction] Gagal membalas 'command tidak ditemukan':",
            err,
          );
        }
        return;
      }

      try {
        await command.execute(interaction, client.levelingSystem);
      } catch (error) {
        console.error(
          `[Interaction] Error saat menjalankan command '${interaction.commandName}':`,
          error,
        );
        try {
          const errorMessage =
            "❌ Terjadi kesalahan internal saat menjalankan command ini.";
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: errorMessage,
              flags: ["Ephemeral"],
            });
          } else {
            await interaction.reply({
              content: errorMessage,
              flags: ["Ephemeral"],
            });
          }
        } catch (replyError) {
          console.error(
            "[Interaction] Gagal mengirim pesan error ke user setelah command gagal:",
            replyError,
          );
        }
        client.levelingSystem?.emit(
          "error",
          new Error(
            `Command execution error (${interaction.commandName}): ${error.message}`,
          ),
        );
      }
    }

    // --- Handle Autocomplete ---
    else if (interaction.isAutocomplete()) {
      if (!client.levelingSystem?.commands) return;
      const command = client.levelingSystem.commands.get(
        interaction.commandName,
      );
      if (!command || typeof command.autocomplete !== "function") return;

      try {
        await command.autocomplete(interaction, client.levelingSystem);
      } catch (error) {
        console.error(
          `[Interaction] Error pada autocomplete untuk command ${interaction.commandName}:`,
          error,
        );
      }
    }

    // --- Handle Button Interactions (Placeholder) ---
    else if (interaction.isButton()) {
      /**
       * @todo Implementasikan logika untuk menangani interaksi tombol.
       *       Cocokkan `interaction.customId` dengan handler yang sesuai.
       */
      // console.log(`[Interaction] Button ditekan: ${interaction.customId} oleh ${interaction.user.tag}`);
    }

    // --- Handle Select Menu Interactions (Placeholder) ---
    else if (interaction.isStringSelectMenu()) {
      // Atau tipe select menu lain
      /**
       * @todo Implementasikan logika untuk menangani interaksi select menu.
       *       Cocokkan `interaction.customId` dan proses `interaction.values`.
       */
      // console.log(`[Interaction] Opsi dipilih dari menu ${interaction.customId}: ${interaction.values.join(', ')} oleh ${interaction.user.tag}`);
    }

    // --- Handle Modal Submits (Placeholder) ---
    else if (interaction.type === InteractionType.ModalSubmit) {
      /**
       * @todo Implementasikan logika untuk menangani submit modal.
       *       Cocokkan `interaction.customId` dan akses data field modal.
       */
      // console.log(`[Interaction] Modal disubmit: ${interaction.customId} oleh ${interaction.user.tag}`);
    }

    // Tambahkan handler untuk tipe interaksi lain jika diperlukan (ContextMenu, etc.)
  },
};
