const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("resumekeys")
    .setDescription("Resumes all paused redeemed keys"),

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

        resumedCount++;
      }
    }

    writeKeys(database);

    const embed = new EmbedBuilder()
      .setTitle("Keys Resumed")
      .setDescription(
        `${resumedCount} paused key(s) were resumed.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};