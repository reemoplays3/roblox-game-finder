const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postWhitelistLog(discordUsername, robloxDisplay, robloxUserId) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🟢 User Whitelisted",
            color: 0x2ecc71,
            fields: [
              { name: "👤 User", value: `${robloxDisplay}\n\`${robloxUserId}\``, inline: true },
              { name: "👮 Whitelisted By", value: discordUsername, inline: true }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Could not post whitelist log:", error);
  }
}

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

    postWhitelistLog(interaction.user.tag, rawInput, robloxUserId);

    return interaction.editReply({
      content:
        `✅ \`${rawInput}\` (\`${robloxUserId}\`) is now whitelisted — treated as if they've already ` +
        `redeemed a key: they get the rejoin button and are protected from forced teleports.`
    });