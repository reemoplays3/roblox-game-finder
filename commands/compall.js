const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("compall")
    .setDescription("Add bonus time to every currently active or paused key")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to add")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const minutes = interaction.options.getInteger("minutes", true);
    const addMs = minutes * 60 * 1000;
    const addSeconds = minutes * 60;

    const database = readKeys();
    const now = Date.now();
    let updatedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
        continue;
      }

      if (item.paused === true && Number(item.pausedRemainingSeconds) > 0) {
        // Paused key: bank the extra time into the saved seconds.
        item.pausedRemainingSeconds =
          Number(item.pausedRemainingSeconds) + addSeconds;
        updatedCount++;
      } else if (item.paused !== true && Number(item.expiresAt) > now) {
        // Active key: push the expiry further into the future.
        item.expiresAt = Number(item.expiresAt) + addMs;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      writeKeys(database);
    }

    const embed = new EmbedBuilder()
      .setTitle("Bonus Time Added")
      .setDescription(
        updatedCount === 0
          ? "No active or paused keys were found to add time to."
          : `Added **${minutes} minute(s)** to **${updatedCount}** key(s) (active + paused).`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};