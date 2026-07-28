const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

function makeKey() {
  return crypto.randomBytes(9).toString("hex").toUpperCase();
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("generatekey")
    .setDescription("Generates a timed key")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How long the key lasts after redemption")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const minutes = interaction.options.getInteger("minutes");
    const key = makeKey();

    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

    database.keys.push({
      key,
      minutes,
      createdAt: Date.now(),

      redeemed: false,
      redeemedAt: null,
      redeemedBy: null,
      expiresAt: null,

      paused: false,
      pausedAt: null,
      remainingMs: null,

      revoked: false,
      revokedAt: null
    });

    fs.writeFileSync(
      dataPath,
      JSON.stringify(database, null, 2)
    );

    const embed = new EmbedBuilder()
      .setTitle("✅   Key Generated")
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        {
          name: "Duration",
          value: `${minutes} minute(s) after redemption`
        },
        {
          name: "Status",
          value: "Unused — timer has not started"
        }
      )
      .setTimestamp();

    await interaction.reply({
  embeds: [embed]
});
  }
};