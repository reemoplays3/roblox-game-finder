const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Removes a full ban from a Roblox user, allowing them back into the game.")
    .addStringOption(option =>
      option
        .setName("roblox_user")
        .setDescription("Roblox username or numeric user ID.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawInput = interaction.options
      .getString("roblox_user")
      .trim();

    await interaction.deferReply({ ephemeral: true });

    const robloxUserId = await resolveRobloxUserId(rawInput);

    if (!robloxUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${rawInput}\`.`
      });
    }

    const users = readUsers();
    const wasBanned = users.banned.includes(robloxUserId);

    users.banned = removeId(users.banned, robloxUserId);
    writeUsers(users);

    return interaction.editReply({
      content: wasBanned
        ? `✅ \`${rawInput}\` (\`${robloxUserId}\`) has been unbanned and can join the game again.`
        : `ℹ️ \`${rawInput}\` (\`${robloxUserId}\`) wasn't banned.`
    });
  }
};