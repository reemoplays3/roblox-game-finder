const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("pausekeys")
    .setDescription("Pauses all active redeemed keys"),

  async execute(interaction) {
    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

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
        item.remainingMs = item.expiresAt - now;
        item.paused = true;
        item.pausedAt = now;
        item.expiresAt = null;

        pausedCount++;
      }
    }

    fs.writeFileSync(
      dataPath,
      JSON.stringify(database, null, 2)
    );

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