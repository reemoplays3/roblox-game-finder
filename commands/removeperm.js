const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("removeperm")
    .setDescription("Removes a Roblox user's permanent admin access.")
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
    const wasPermanent = users.permanent.includes(robloxUserId);

    users.permanent = removeId(users.permanent, robloxUserId);
    writeUsers(users);

    return interaction.editReply({
      content: wasPermanent
        ? `✅ \`${rawInput}\` (\`${robloxUserId}\`) no longer has permanent access.`
        : `ℹ️ \`${rawInput}\` (\`${robloxUserId}\`) didn't have permanent access.`
    });
  }
};