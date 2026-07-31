const { SlashCommandBuilder } = require("discord.js");
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
        item.pausedLocked = false;

        resumedCount++;
      }
    }

    writeKeys(database);

    await interaction.reply({
      content: `✅ ${resumedCount} key(s) were unpaused.`
    });
  }
};