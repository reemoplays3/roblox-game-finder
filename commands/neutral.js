const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("neutral")
    .setDescription("Resets a Roblox user to neutral: can redeem, but no rejoin button")
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

    // Neutral means: allowed to redeem again (so make sure they're not
    // blacklisted), but explicitly does NOT count as having redeemed
    // before for rejoin-button purposes — even if they actually have.
    users.blacklisted = removeId(users.blacklisted, robloxUserId);

    if (!users.neutral.includes(robloxUserId)) {
      users.neutral.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.reply({
      content: `⚪ \`${robloxUserId}\` was reset to neutral — they can redeem keys, but won't get a rejoin button.`,
      ephemeral: true
    });
  }
};