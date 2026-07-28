const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revokeall")
    .setDescription("Revokes every key"),

  async execute(interaction) {
    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

    let revokedCount = 0;

    for (const key of database.keys) {
      if (!key.revoked) {
        key.revoked = true;
        key.revokedAt = Date.now();
        revokedCount++;
      }
    }

    fs.writeFileSync(
      dataPath,
      JSON.stringify(database, null, 2)
    );

    const embed = new EmbedBuilder()
      .setTitle("All Keys Revoked")
      .setDescription(
        revokedCount === 0
          ? "Every key was already revoked."
          : `Revoked **${revokedCount}** key(s).`
      )
      .setTimestamp();

    await interaction.reply({
  embeds: [embed]
});
    });
  }
};