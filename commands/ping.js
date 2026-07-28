const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks if the bot is working"),

  async execute(interaction) {
    await interaction.reply("Pong! The bot is working.");
  }
};