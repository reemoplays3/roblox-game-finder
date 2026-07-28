const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("resumekeys")
    .setDescription("Resumes all paused redeemed keys"),

  async execute(interaction) {
    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

    const now = Date.now();
    let resumedCount = 0;

    for (const item of database.keys) {
      const canResume =
        item.redeemed &&
        !item.revoked &&
        item.paused &&
        item.remainingMs &&
        item.remainingMs > 0;

      if (canResume) {
        item.expiresAt = now + item.remainingMs;
        item.paused = false;
        item.pausedAt = null;
        item.remainingMs = null;

        resumedCount++;
      }
    }

    fs.writeFileSync(
      dataPath,
      JSON.stringify(database, null, 2)
    );

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