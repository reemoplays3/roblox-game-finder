const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revokeall")
    .setDescription("Revokes and permanently deletes every key"),

  async execute(interaction) {
    const database = readKeys();
    const revokedCount = database.keys.length;

    database.keys = [];
    writeKeys(database);

    const embed = new EmbedBuilder()
      .setTitle("All Keys Revoked & Deleted")
      .setDescription(
        revokedCount === 0
          ? "There were no keys to revoke."
          : `Permanently deleted **${revokedCount}** key(s).`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};