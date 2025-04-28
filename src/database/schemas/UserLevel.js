const mongoose = require("mongoose");

const UserLevelSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: [true, "Guild ID diperlukan"],
      index: true,
    },
    userId: {
      type: String,
      required: [true, "User ID diperlukan"],
      index: true,
    },
    xp: {
      type: Number,
      default: 0,
      min: [0, "XP tidak boleh negatif"],
    },
    level: {
      type: Number,
      default: 0,
      min: [0, "Level tidak boleh negatif"],
    },
    lastMessageTimestamp: {
      type: Number,
      default: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalVoiceDurationMillis: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

UserLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });

UserLevelSchema.index({ guildId: 1, xp: -1, updatedAt: -1 });

module.exports = mongoose.model("Leveling:User:Level", UserLevelSchema);
