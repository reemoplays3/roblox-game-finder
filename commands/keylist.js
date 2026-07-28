const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("Shows all saved keys"),

  async execute(interaction) {
    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

    if (database.keys.length === 0) {
      await interaction.reply({
        content: "There are no saved keys.",
        ephemeral: true
      });
      return;
    }

    const now = Date.now();

    const keyLines = database.keys.map(item => {
      let status;
      let timeText;

      if (item.revoked) {
        status = "Revoked";
        timeText = "Unavailable";
      } else if (!item.redeemed) {
        status = "Unused";
        timeText = `${item.minutes} minute(s) after redemption`;
      } else if (item.paused) {
        status = "Paused";

        const minutesLeft = Math.max(
          0,
          Math.ceil((item.remainingMs || 0) / 60000)
        );

        timeText = `${minutesLeft} minute(s)`;
      } else {
        const timeLeftMs = item.expiresAt - now;
        const minutesLeft = Math.max(
          0,
          Math.ceil(timeLeftMs / 60000)
        );

        status = timeLeftMs > 0 ? "Active" : "Expired";
        timeText = `${minutesLeft} minute(s)`;
      }

      return [
        `Key: \`${item.key}\``,
        `Status: ${status}`,
        `Time left: ${timeText}`,
        `Redeemed by: ${item.redeemedBy || "Nobody"}`
      ].join("\n");
    });

    const embed = new EmbedBuilder()
      .setTitle("Key List")
      .setDescription(keyLines.join("\n\n"))
      .setTimestamp();

    await interaction.reply({
  embeds: [embed]
});
  }
};