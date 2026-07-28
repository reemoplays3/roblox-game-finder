const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "keys.json");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Revokes a key")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("The key you want to revoke")
        .setRequired(true)
    ),

  async execute(interaction) {
    const enteredKey = interaction.options
      .getString("key")
      .trim()
      .toUpperCase();

    const database = JSON.parse(
      fs.readFileSync(dataPath, "utf8")
    );

    const foundKey = database.keys.find(
      item => item.key === enteredKey
    );

    if (!foundKey) {
      await interaction.reply({
        content: "That key was not found.",
        ephemeral: true
      });

      return;
    }

    if (foundKey.revoked) {
      await interaction.reply({
        content: "That key is already revoked.",
        ephemeral: true
      });

      return;
    }

    foundKey.revoked = true;
    foundKey.revokedAt = Date.now();

    fs.writeFileSync(
      dataPath,
      JSON.stringify(database, null, 2)
    );

    const embed = new EmbedBuilder()
      .setTitle("Key Revoked")
      .addFields({
        name: "Key",
        value: `\`${foundKey.key}\``
      })
      .setTimestamp();

    await interaction.reply({
  embeds: [embed]
});
  }
};