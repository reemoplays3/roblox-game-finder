const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Revokes and permanently deletes a key")
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

    const database = readKeys();

    const index = database.keys.findIndex(
      item => item.key === enteredKey
    );

    if (index === -1) {
      await interaction.reply({
        content: "That key was not found.",
        ephemeral: true
      });

      return;
    }

    const [removedKey] = database.keys.splice(index, 1);
    writeKeys(database);

    const embed = new EmbedBuilder()
      .setTitle("Key Revoked & Deleted")
      .addFields({
        name: "Key",
        value: `\`${removedKey.key}\``
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};