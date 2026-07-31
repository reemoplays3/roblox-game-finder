const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("pausekeys")
    .setDescription("Pauses all active redeemed keys"),

  async execute(interaction) {
    const database = readKeys();

    const now = Date.now();
    let pausedCount = 0;

    for (const item of database.keys) {
      const isActive =
        item.redeemed &&
        !item.revoked &&
        !item.paused &&
        item.expiresAt &&
        item.expiresAt > now;

      if (isActive) {
        const remainingSeconds = Math.floor(
          (item.expiresAt - now) / 1000
        );

        item.pausedRemainingSeconds = remainingSeconds;
        item.paused = true;
        item.pausedAt = now;
        item.expiresAt = null;

        pausedCount++;
      }
    }

    writeKeys(database);

    const embed = new EmbedBuilder()
      .setTitle("Keys Paused")
      .setDescription(
        `${pausedCount} active redeemed key(s) were paused.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};