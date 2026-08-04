const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Fully bans a Roblox user — kicked from the game immediately, can't chat or play at all.")
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

    if (users.banned.includes(robloxUserId)) {
      return interaction.editReply({
        content: `⚠️ \`${rawInput}\` (\`${robloxUserId}\`) is already banned. Use \`/unban\` first if you need to redo this.`
      });
    }

    users.banned.push(robloxUserId);
    writeUsers(users);

    return interaction.editReply({
      content: `🔨 \`${rawInput}\` (\`${robloxUserId}\`) has been banned — they'll be kicked immediately if in-game right now, or the instant they try to join.`
    });
  }
};