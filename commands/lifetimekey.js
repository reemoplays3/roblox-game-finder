const { SlashCommandBuilder } = require("discord.js");
const { readUsers, writeUsers, removeId } = require("./lib/userStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postLifetimeKeyLog(discordUsername, robloxDisplay, robloxUserId) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "♾️ Lifetime Key Granted",
            color: 0xf1c40f,
            fields: [
              { name: "👤 User", value: `${robloxDisplay}\n\`${robloxUserId}\``, inline: true },
              { name: "👮 Granted By", value: discordUsername, inline: true },
              {
                name: "📋 Access",
                value: "Permanent panel access — no time transfer, no Buyer role requests.",
                inline: false
              }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Could not post lifetime key log:", error);
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("lifetimekey")
    .setDescription("Grants permanent admin panel access with restricted commands (no time transfer / buyer role).")
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

    if (!users.lifetime.includes(robloxUserId)) {
      users.lifetime.push(robloxUserId);
    }

    writeUsers(users);

    postLifetimeKeyLog(interaction.user.tag, rawInput, robloxUserId);

    return interaction.editReply({
      content:
        `♾️ \`${rawInput}\` (\`${robloxUserId}\`) was granted a **lifetime key** — permanent admin panel ` +
        `access, but they cannot transfer time or request the Buyer role.`
    });
  }
};