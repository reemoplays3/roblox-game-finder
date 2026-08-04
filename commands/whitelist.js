const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Grants a Roblox user 'already redeemed' status: rejoin button + teleport protection.")
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
    users.neutral = removeId(users.neutral, robloxUserId);

    if (!users.everRedeemed.includes(robloxUserId)) {
      users.everRedeemed.push(robloxUserId);
    }

    writeUsers(users);

    return interaction.editReply({
      content:
        `✅ \`${rawInput}\` (\`${robloxUserId}\`) is now whitelisted — treated as if they've already ` +
        `redeemed a key: they get the rejoin button and are protected from forced teleports.`
    });
  }
};