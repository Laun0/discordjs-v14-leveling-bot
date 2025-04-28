const mongoose = require("mongoose");

const GuildConfigSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: [true, "Guild ID diperlukan untuk konfigurasi"],
      unique: true,
      index: true,
    },

    xpPerMessage: {
      type: Number,
      default: 15,
      min: 0,
    },
    xpPerMinuteVoice: {
      type: Number,
      default: 5,
      min: 0,
    },
    messageCooldownSeconds: {
      type: Number,
      default: 60,
      min: 1,
    },

    roleMultipliers: {
      type: Map,
      of: Number,
      default: {},
    },
    channelMultipliers: {
      type: Map,
      of: Number,
      default: {},
    },
    ignoredRoles: {
      type: [String],
      default: [],
    },
    ignoredChannels: {
      type: [String],
      default: [],
    },

    levelUpMessageEnabled: {
      type: Boolean,
      default: true,
    },
    levelUpChannelId: {
      type: String,
      default: null,
    },
    levelUpMessageFormat: {
      type: String,
      default:
        "Selamat {userMention}! 🎉 Kamu telah naik ke **Level {level}**! (Rank: {rank})",
      maxlength: [
        1000,
        "Format pesan level up terlalu panjang (maks 1000 karakter)",
      ],
    },

    levelRoles: {
      type: Map,
      of: String,
      default: {},
    },
    roleRemovalStrategy: {
      type: String,
      default: "keep_all",
      enum: ["keep_all", "highest_only", "remove_previous"],
      required: true,
    },

    enablePenaltySystem: {
      type: Boolean,
      default: false,
    },
    leaderboardStyle: {
      type: String,
      default: "card",
      enum: ["card", "text"],
    },
    rankCardBackground: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

GuildConfigSchema.pre("save", function (next) {
  if (this.ignoredRoles) {
    this.ignoredRoles = [...new Set(this.ignoredRoles)];
  }
  if (this.ignoredChannels) {
    this.ignoredChannels = [...new Set(this.ignoredChannels)];
  }
  if (this.levelUpMessageFormat && this.levelUpMessageFormat.length > 1000) {
    return next(new Error("Format pesan level up melebihi 1000 karakter."));
  }
  const validStrategies = ["keep_all", "highest_only", "remove_previous"];
  if (!validStrategies.includes(this.roleRemovalStrategy)) {
    this.roleRemovalStrategy = "keep_all";
  }
  next();
});

module.exports = mongoose.model("Leveling:Guild:Config", GuildConfigSchema);
