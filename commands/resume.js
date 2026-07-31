const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resumes every paused key and clears any /pause lock"),

  async execute(interaction) {
    const database = readKeys();

    const now = Date.now();
    let resumedCount = 0;

    for (const item of database.keys) {
      const canResume =
        item.redeemed &&
        !item.revoked &&
        item.paused &&
        item.pausedRemainingSeconds &&
        item.pausedRemainingSeconds > 0;

      if (canResume) {
        item.expiresAt =
          now + item.pausedRemainingSeconds * 1000;
        item.paused = false;
        item.pausedAt = null;
        item.pausedRemainingSeconds = 0;

        // This is the official admin override — clears any lock set by
        // /pause so the key can actually resume.
        item.pausedLocked = false;

        resumedCount++;
      }
    }

    writeKeys(database);

    const embed = new EmbedBuilder()
      .setTitle("Keys Resumed")
      .setDescription(
        `${resumedCount} paused key(s) were resumed. Everything is back to normal.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};