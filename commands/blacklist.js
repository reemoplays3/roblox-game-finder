const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Block a Roblox user from all panel access.")
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

    users.redeemAllowed = removeId(users.redeemAllowed, robloxUserId);
    users.permanent = removeId(users.permanent, robloxUserId);

    if (!users.blacklisted.includes(robloxUserId)) {
      users.blacklisted.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.reply({
      content: `🚫 \`${robloxUserId}\` has been blacklisted from the admin panel.`,
      ephemeral: true
    });
  }
};