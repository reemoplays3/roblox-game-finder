const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Block a Roblox user from all panel access.")
    .addStringOption(option =>
      option
        .setName("roblox_user")
        .setDescription("Roblox username or numeric user ID.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawInput = interaction.options.getString("roblox_user").trim();

    await interaction.deferReply({ ephemeral: true });

    const robloxUserId = await resolveRobloxUserId(rawInput);

    if (!robloxUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${rawInput}\`.`
      });
    }

    const users = readUsers();

    users.redeemAllowed = removeId(users.redeemAllowed, robloxUserId);
    users.permanent = removeId(users.permanent, robloxUserId);

    if (!users.blacklisted.includes(robloxUserId)) {
      users.blacklisted.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.editReply({
      content: `🚫 \`${rawInput}\` (\`${robloxUserId}\`) was blacklisted from all panel access.`
    });
  }
};