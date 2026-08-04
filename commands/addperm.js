const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("addperm")
    .setDescription("Grants a Roblox user permanent (unlimited) admin access.")
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

    if (!users.permanent.includes(robloxUserId)) {
      users.permanent.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.editReply({
      content: `⭐ \`${rawInput}\` (\`${robloxUserId}\`) was granted permanent access.`
    });
  }
};