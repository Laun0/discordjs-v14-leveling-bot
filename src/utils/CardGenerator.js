/**
 * @description Utilitas untuk membuat gambar kartu rank, level-up, dan leaderboard
 *              menggunakan library node-canvas. Menyediakan metode untuk menghasilkan
 *              AttachmentBuilder Discord.js yang berisi gambar kartu.
 * @requires canvas createCanvas, loadImage, registerFont
 * @requires discord.js AttachmentBuilder
 * @requires path
 */

const { createCanvas, loadImage, registerFont } = require("canvas");
const { AttachmentBuilder } = require("discord.js");
const path = require("path");

// Optional font registration - uncomment and configure if needed
// const customFontPath = path.join(__dirname, '../../assets/fonts/YourFont.ttf');
// try {
//   registerFont(customFontPath, { family: 'YourFontFamily' });
// } catch (err) {
//   console.warn(`[CardGenerator] Failed to register custom font: ${err.message}`);
// }

/**
 * @class CardGenerator
 * @classdesc Kelas utilitas untuk menghasilkan gambar kartu leveling (rank, level up, leaderboard).
 *            Menggunakan node-canvas untuk rendering gambar.
 * @param {object} formatters - Objek yang berisi fungsi utilitas pemformatan.
 * @param {function} formatters.formatNumber - Fungsi untuk memformat angka menjadi string ringkas (misal: 1.5K).
 * @throws {Error} Jika objek `formatters` atau fungsi `formatNumber` tidak disediakan.
 */
class CardGenerator {
  constructor(formatters) {
    if (!formatters || typeof formatters.formatNumber !== "function") {
      throw new Error(
        "[CardGenerator] Memerlukan objek 'formatters' dengan fungsi 'formatNumber'.",
      );
    }
    /**
     * Referensi ke fungsi pemformat angka dari utilitas.
     * @type {function(number, number=): string}
     */
    this.formatNumber = formatters.formatNumber;

    /**
     * Opsi default untuk konfigurasi tampilan kartu.
     * Opsi ini dapat ditimpa oleh konfigurasi spesifik server (`guildConfig`).
     * @type {object}
     * @property {number} width - Lebar kartu default.
     * @property {number} height - Tinggi kartu default.
     * @property {number} borderRadius - Radius sudut kartu.
     * @property {number} padding - Padding internal kartu.
     * @property {number} avatarSize - Ukuran sisi avatar pengguna.
     * @property {string} backgroundColor - Warna latar belakang default jika tidak ada gambar.
     * @property {string|null} backgroundImage - URL/Path ke gambar latar belakang kustom.
     * @property {string} overlayColor - Warna overlay semi-transparan di atas gambar latar belakang.
     * @property {string} progressBarColor - Warna progress bar foreground.
     * @property {string} progressBarBackgroundColor - Warna progress bar background.
     * @property {string} borderColor - Warna border di sekitar avatar.
     * @property {string} usernameColor - Warna teks username.
     * @property {string} levelColor - Warna teks level.
     * @property {string} rankColor - Warna teks rank.
     * @property {string} xpColor - Warna teks XP.
     * @property {string} statusColorOnline - Warna indikator status online.
     * @property {string} statusColorIdle - Warna indikator status idle.
     * @property {string} statusColorDnd - Warna indikator status Do Not Disturb.
     * @property {string} statusColorOffline - Warna indikator status offline.
     * @property {string} fontFamily - Keluarga font default.
     * @property {string} usernameFontSize - Ukuran font username default.
     * @property {string} levelFontSize - Ukuran font level default.
     * @property {string} rankFontSize - Ukuran font rank default.
     * @property {string} xpFontSize - Ukuran font XP default.
     */
    this.defaultOptions = {
      width: 934,
      height: 282,
      borderRadius: 25,
      padding: 40,
      avatarSize: 190,
      backgroundColor: "#2C2F33",
      backgroundImage: null,
      overlayColor: "rgba(0, 0, 0, 0.5)",
      progressBarColor: "#5865F2",
      progressBarBackgroundColor: "#4E5058",
      borderColor: "#FFFFFF",
      usernameColor: "#FFFFFF",
      levelColor: "#FFFFFF",
      rankColor: "#B9BBBE",
      xpColor: "#B9BBBE",
      statusColorOnline: "#43B581",
      statusColorIdle: "#FAA61A",
      statusColorDnd: "#F04747",
      statusColorOffline: "#747F8D",
      fontFamily: "sans-serif",
      usernameFontSize: "38px",
      levelFontSize: "30px",
      rankFontSize: "30px",
      xpFontSize: "26px",
    };
    console.log("[CardGenerator] Siap.");
  }

  /**
   * @private
   * Menggambar path kotak dengan sudut membulat pada konteks canvas.
   * @method _roundRect
   * @param {CanvasRenderingContext2D} ctx - Konteks rendering canvas 2D.
   * @param {number} x - Koordinat X pojok kiri atas kotak.
   * @param {number} y - Koordinat Y pojok kiri atas kotak.
   * @param {number} width - Lebar kotak.
   * @param {number} height - Tinggi kotak.
   * @param {number} radius - Radius sudut yang dibulatkan.
   */
  _roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  /**
   * @private
   * Memotong teks dengan menambahkan elipsis (...) jika melebihi lebar maksimum yang ditentukan.
   * @method _fitText
   * @param {CanvasRenderingContext2D} ctx - Konteks rendering canvas 2D.
   * @param {string} text - Teks asli yang akan diproses.
   * @param {number} maxWidth - Lebar maksimum (dalam piksel) yang diizinkan untuk teks.
   * @returns {string} Teks yang sudah dipotong jika perlu, atau teks asli jika sudah pas.
   */
  _fitText(ctx, text, maxWidth) {
    let currentText = text;
    let width = ctx.measureText(currentText).width;
    if (width <= maxWidth) {
      return currentText;
    }
    while (width > maxWidth && currentText.length > 4) {
      currentText = currentText.slice(0, -4) + "...";
      width = ctx.measureText(currentText).width;
    }
    if (width > maxWidth) {
      currentText = currentText.slice(0, 1) + "...";
    }
    return currentText;
  }

  /**
   * Membuat gambar kartu rank untuk pengguna.
   * @method createRankCard
   * @param {object} data - Objek berisi data pengguna dan statistik leveling.
   * @param {string} data.username - Nama pengguna Discord.
   * @param {string} data.avatarURL - URL avatar pengguna (format PNG/JPG/GIF yang didukung canvas).
   * @param {number} data.level - Level pengguna saat ini.
   * @param {number} data.rank - Peringkat pengguna di server (0 jika tidak berperingkat).
   * @param {number} data.currentXP - Jumlah XP yang dimiliki pengguna pada level saat ini.
   * @param {number} data.requiredXP - Jumlah XP yang dibutuhkan untuk naik ke level berikutnya dari level saat ini.
   * @param {number} data.totalXP - Total akumulasi XP pengguna.
   * @param {string} [data.status='offline'] - Status kehadiran pengguna ('online', 'idle', 'dnd', 'offline').
   * @param {object} [guildConfig={}] - Objek konfigurasi server yang mungkin berisi opsi kustomisasi kartu (`rankCardBackground`, `rankCardOptions`).
   * @returns {Promise<AttachmentBuilder>} Sebuah Promise yang resolve dengan AttachmentBuilder Discord.js berisi buffer gambar PNG kartu rank.
   * @async
   */
  async createRankCard(data, guildConfig = {}) {
    const options = { ...this.defaultOptions };
    if (
      guildConfig.rankCardOptions &&
      typeof guildConfig.rankCardOptions === "object"
    ) {
      Object.assign(options, guildConfig.rankCardOptions);
    }
    const backgroundInput =
      guildConfig.rankCardBackground ||
      options.backgroundImage ||
      options.backgroundColor;

    const canvas = createCanvas(options.width, options.height);
    const ctx = canvas.getContext("2d");

    ctx.save();
    this._roundRect(
      ctx,
      0,
      0,
      options.width,
      options.height,
      options.borderRadius,
    );
    ctx.clip();

    let isUsingImageBackground = false;
    try {
      const background = await loadImage(backgroundInput).catch(() => null);
      if (background && background.complete && background.naturalHeight !== 0) {
        ctx.drawImage(background, 0, 0, options.width, options.height);
        isUsingImageBackground = true;
        if (options.overlayColor) {
          ctx.fillStyle = options.overlayColor;
          ctx.fillRect(0, 0, options.width, options.height);
        }
      } else {
        ctx.fillStyle = backgroundInput;
        ctx.fillRect(0, 0, options.width, options.height);
      }
    } catch (err) {
      console.warn(
        `[CardGenerator] Error memproses background '${backgroundInput}'. Menggunakan warna default. Error: ${err.message}`,
      );
      ctx.fillStyle = this.defaultOptions.backgroundColor;
      ctx.fillRect(0, 0, options.width, options.height);
    }
    ctx.restore();

    const avatarSize = options.avatarSize;
    const avatarX = options.padding;
    const avatarY = (options.height - avatarSize) / 2;
    const avatarBorderWidth = 6;

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2 + avatarBorderWidth,
      0,
      Math.PI * 2,
      true,
    );
    ctx.fillStyle = options.borderColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
      true,
    );
    ctx.closePath();
    ctx.clip();
    try {
      const avatar = await loadImage(
        data.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png",
      );
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch (err) {
      console.error("[CardGenerator] Gagal memuat avatar:", err.message);
      ctx.fillStyle = "#7289DA";
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    const statusRadius = avatarSize * 0.14;
    const statusBorderWidth = avatarBorderWidth - 1;
    const statusX =
      avatarX + avatarSize - statusRadius - statusBorderWidth * 1.5;
    const statusY =
      avatarY + avatarSize - statusRadius - statusBorderWidth * 1.5;

    ctx.beginPath();
    ctx.arc(
      statusX + statusRadius,
      statusY + statusRadius,
      statusRadius + statusBorderWidth,
      0,
      Math.PI * 2,
    );
    if (isUsingImageBackground) {
      ctx.fillStyle = options.overlayColor || "rgba(0,0,0,0.5)";
    } else {
      ctx.fillStyle = backgroundInput;
    }
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      statusX + statusRadius,
      statusY + statusRadius,
      statusRadius,
      0,
      Math.PI * 2,
    );
    const statusKey = `statusColor${
      data.status?.charAt(0).toUpperCase() + data.status?.slice(1)
    }`;
    ctx.fillStyle = options[statusKey] || options.statusColorOffline;
    ctx.fill();

    const textStartX = avatarX + avatarSize + options.padding / 1.5;
    const textEndX = options.width - options.padding;
    const textAreaWidth = textEndX - textStartX;

    const nameY = options.padding + 45;
    ctx.fillStyle = options.usernameColor;
    ctx.font = `bold ${options.usernameFontSize} ${options.fontFamily}`;
    ctx.textAlign = "left";
    const fittedUsername = this._fitText(
      ctx,
      data.username,
      textAreaWidth * 0.9,
    );
    ctx.fillText(fittedUsername, textStartX, nameY);

    const rankLevelY = nameY + parseFloat(options.usernameFontSize) + 15;

    ctx.font = `bold ${options.levelFontSize} ${options.fontFamily}`;
    ctx.fillStyle = options.levelColor;
    ctx.textAlign = "right";
    const levelText = `LEVEL ${this.formatNumber(data.level, 0)}`;
    ctx.fillText(levelText, textEndX, rankLevelY);
    const levelWidth = ctx.measureText(levelText).width;

    ctx.font = `normal ${options.rankFontSize} ${options.fontFamily}`;
    ctx.fillStyle = options.rankColor;
    const rankText =
      data.rank > 0 ? `RANK #${this.formatNumber(data.rank, 0)}` : "UNRANKED";
    ctx.fillText(rankText, textEndX - levelWidth - 25, rankLevelY);

    const barHeight = 40;
    const barY = options.height - options.padding - barHeight;
    const barX = textStartX;
    const barWidth = textAreaWidth;
    const barRadius = barHeight / 2;

    ctx.font = `normal ${options.xpFontSize} ${options.fontFamily}`;
    ctx.fillStyle = options.xpColor;
    ctx.textAlign = "right";
    const xpDisplayText =
      data.requiredXP > 0
        ? `${this.formatNumber(data.currentXP)} / ${this.formatNumber(data.requiredXP)} XP`
        : `${this.formatNumber(data.totalXP)} XP`;
    ctx.fillText(xpDisplayText, textEndX, barY - 12);

    ctx.fillStyle = options.progressBarBackgroundColor;
    this._roundRect(ctx, barX, barY, barWidth, barHeight, barRadius);
    ctx.fill();

    const progress =
      data.requiredXP > 0
        ? Math.max(0, Math.min(1, data.currentXP / data.requiredXP))
        : 1;
    const progressWidth = barWidth * progress;

    if (progressWidth > 0) {
      ctx.save();
      this._roundRect(ctx, barX, barY, barWidth, barHeight, barRadius);
      ctx.clip();
      ctx.fillStyle = options.progressBarColor;
      ctx.fillRect(barX, barY, progressWidth, barHeight);
      ctx.restore();
    }

    const buffer = await canvas.encode("png");
    return new AttachmentBuilder(buffer, { name: `rank-${data.username}.png` });
  }

  /**
   * Membuat gambar kartu notifikasi saat pengguna naik level.
   * @method createLevelUpCard
   * @param {object} data - Objek berisi data level up.
   * @param {string} data.username - Nama pengguna yang naik level.
   * @param {string} data.avatarURL - URL avatar pengguna.
   * @param {number} data.newLevel - Level baru yang dicapai.
   * @param {object} [guildConfig={}] - Objek konfigurasi server (saat ini tidak digunakan secara ekstensif untuk kartu ini).
   * @returns {Promise<AttachmentBuilder>} Sebuah Promise yang resolve dengan AttachmentBuilder Discord.js berisi buffer gambar PNG kartu level up.
   * @async
   */
  async createLevelUpCard(data, guildConfig = {}) {
    const width = 550;
    const height = 180;
    const borderRadius = 15;
    const padding = 25;
    const avatarSize = 90;
    const fontFamily = this.defaultOptions.fontFamily;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#7289DA");
    gradient.addColorStop(1, "#5865F2");
    ctx.fillStyle = gradient;
    this._roundRect(ctx, 0, 0, width, height, borderRadius);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      const starX = Math.random() * width;
      const starY = Math.random() * height;
      const starSize = Math.random() * 3 + 1;
      ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
      ctx.fill();
    }

    const avatarX = padding;
    const avatarY = (height - avatarSize) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2 + 4,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.clip();
    try {
      const avatar = await loadImage(
        data.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png",
      );
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch {}
    ctx.restore();

    const textX = avatarX + avatarSize + padding;
    const textY = height / 2;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";

    ctx.font = `bold 34px ${fontFamily}`;
    ctx.fillText("LEVEL UP!", textX, textY - 15);

    ctx.font = `normal 24px ${fontFamily}`;
    const levelUpText = `${this._fitText(
      ctx,
      data.username,
      width - textX - padding,
    )} naik ke Level ${this.formatNumber(data.newLevel, 0)}!`;
    ctx.fillText(levelUpText, textX, textY + 25);

    const buffer = await canvas.encode("png");
    return new AttachmentBuilder(buffer, {
      name: `levelup-${data.username}.png`,
    });
  }

  /**
   * Membuat gambar kartu leaderboard untuk menampilkan peringkat teratas di server.
   * @method createLeaderboardCard
   * @param {Array<object>} leaderboardData - Array berisi objek data pengguna teratas (minimal `userId`, `xp`, `level`).
   * @param {import('discord.js').Client} client - Instance Discord Client untuk mengambil data pengguna (username, avatar).
   * @param {string} guildName - Nama server untuk ditampilkan di header kartu.
   * @param {object} [guildConfig={}] - Objek konfigurasi server (saat ini tidak digunakan secara ekstensif untuk kartu ini).
   * @returns {Promise<AttachmentBuilder|null>} Sebuah Promise yang resolve dengan AttachmentBuilder Discord.js berisi buffer gambar PNG kartu leaderboard, atau `null` jika `leaderboardData` kosong.
   * @async
   */
  async createLeaderboardCard(
    leaderboardData,
    client,
    guildName,
    guildConfig = {},
  ) {
    if (!leaderboardData || leaderboardData.length === 0) return null;

    const entryHeight = 70;
    const headerHeight = 120;
    const footerHeight = 30;
    const width = 700;
    const maxEntries = Math.min(leaderboardData.length, 15);
    const totalHeight = headerHeight + maxEntries * entryHeight + footerHeight;
    const borderRadius = 15;
    const padding = 20;
    const fontFamily = this.defaultOptions.fontFamily;

    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#2C2F33";
    this._roundRect(ctx, 0, 0, width, totalHeight, borderRadius);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, borderRadius);
    ctx.lineTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.lineTo(width, borderRadius);
    ctx.arcTo(width, 0, width - borderRadius, 0, borderRadius);
    ctx.lineTo(borderRadius, 0);
    ctx.arcTo(0, 0, 0, borderRadius, borderRadius);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#23272A";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.restore();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 34px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText(`🏆 Papan Peringkat Level 🏆`, width / 2, 60);
    ctx.font = `normal 22px ${fontFamily}`;
    ctx.fillStyle = "#B9BBBE";
    ctx.fillText(this._fitText(ctx, guildName, width * 0.8), width / 2, 95);

    for (let i = 0; i < maxEntries; i++) {
      const entry = leaderboardData[i];
      const y = headerHeight + i * entryHeight;

      let user;
      try {
        user = await client.users.fetch(entry.userId);
      } catch {
        user = {
          username: `ID: ${entry.userId.slice(0, 6)}...`, // Tampilkan sebagian ID jika fetch gagal
          displayAvatarURL: () =>
            "https://cdn.discordapp.com/embed/avatars/0.png",
        };
      }

      ctx.fillStyle = i % 2 === 0 ? "#2F3136" : "#36393F";
      if (y + entryHeight < totalHeight - footerHeight + 5) {
        ctx.fillRect(padding / 2, y, width - padding, entryHeight);
      }

      const contentY = y + entryHeight / 2;
      const startX = padding;
      const endX = width - padding;

      let rankColor = "#FFFFFF";
      if (i === 0) rankColor = "#FFD700";
      else if (i === 1) rankColor = "#C0C0C0";
      else if (i === 2) rankColor = "#CD7F32";
      ctx.fillStyle = rankColor;
      ctx.font = `bold ${i < 3 ? 28 : 24}px ${fontFamily}`;
      ctx.textAlign = "left";
      const rankText = `#${i + 1}`;
      ctx.fillText(rankText, startX, contentY + 8);
      const rankWidth = ctx.measureText(rankText).width;

      const avatarSize = 45;
      const avatarX = startX + rankWidth + 15;
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        contentY,
        avatarSize / 2,
        0,
        Math.PI * 2,
      );
      ctx.clip();
      try {
        const avatar = await loadImage(
          user.displayAvatarURL({ extension: "png", size: 128 }),
        );
        ctx.drawImage(
          avatar,
          avatarX,
          contentY - avatarSize / 2,
          avatarSize,
          avatarSize,
        );
      } catch {}
      ctx.restore();

      const textStartX = avatarX + avatarSize + 15;

      ctx.font = `normal 22px ${fontFamily}`;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      const usernameText = this._fitText(ctx, user.username, width * 0.35);
      ctx.fillText(usernameText, textStartX, contentY + 8);

      ctx.textAlign = "right";
      ctx.font = `bold 20px ${fontFamily}`;
      ctx.fillStyle = "#B9BBBE";
      const xpText = `${this.formatNumber(entry.xp)} XP`;
      ctx.fillText(xpText, endX, contentY + 8);
      const xpWidth = ctx.measureText(xpText).width;

      ctx.fillStyle = "#FFFFFF";
      const levelText = `Lvl ${this.formatNumber(entry.level, 0)}`;
      ctx.fillText(levelText, endX - xpWidth - 20, contentY + 8);
    }

    const buffer = await canvas.encode("png");
    const fileName = `leaderboard-${guildName
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}.png`;
    return new AttachmentBuilder(buffer, { name: fileName });
  }
}

module.exports = CardGenerator;
