const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("neutral")
    .setDescription("Resets a Roblox user to neutral: can redeem, but no rejoin button")
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

    users.blacklisted = removeId(users.blacklisted, robloxUserId);

    if (!users.neutral.includes(robloxUserId)) {
      users.neutral.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.editReply({
      content: `⚪ \`${rawInput}\` (\`${robloxUserId}\`) was reset to neutral — they can redeem keys, but won't get a rejoin button.`
    });
  }
};