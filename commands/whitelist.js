const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Allow a Roblox user to redeem keys again.")
    .addStringOption(option =>
      option
        .setName("roblox_user_id")
        .setDescription("The numeric Roblox user ID.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const robloxUserId = interaction.options
      .getString("roblox_user_id")
      .trim();

    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({
        content: "⚠️ Please enter a valid numeric Roblox user ID.",
        ephemeral: true
      });
    }

    const users = readUsers();
    const wasBlacklisted = users.blacklisted.includes(robloxUserId);

    users.blacklisted = removeId(users.blacklisted, robloxUserId);

    writeUsers(users);

    return interaction.reply({
      content: wasBlacklisted
        ? `✅ \`${robloxUserId}\` has been whitelisted from the admin panel.`
        : `ℹ️ \`${robloxUserId}\` was already whitelisted.`,
      ephemeral: true
    });
  }
};