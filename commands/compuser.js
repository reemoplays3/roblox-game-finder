const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postCompLog(discordUsername, robloxDisplay, robloxUserId, minutes) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🎁 Time Added",
            color: 0x2ecc71,
            fields: [
              { name: "👤 User", value: `${robloxDisplay}\n\`${robloxUserId}\``, inline: true },
              { name: "⏱️ Amount", value: `${minutes} minute(s)`, inline: true },
              { name: "👮 Added By", value: discordUsername, inline: true }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Could not post comp log:", error);
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("compuser")
    .setDescription("Add bonus time to one Roblox user's active or paused key")
    .addStringOption(option =>
      option
        .setName("roblox_user")
        .setDescription("Roblox username or numeric user ID.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to add")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const rawInput = interaction.options.getString("roblox_user", true).trim();
    const minutes = interaction.options.getInteger("minutes", true);

    await interaction.deferReply({ ephemeral: true });

    const robloxUserId = await resolveRobloxUserId(rawInput);

    if (!robloxUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${rawInput}\`.`
      });
    }

    const addMs = minutes * 60 * 1000;
    const addSeconds = minutes * 60;

    const database = readKeys();
    const now = Date.now();
    let updatedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
        continue;
      }

      if (String(item.redeemedBy || "") !== robloxUserId) {
        continue;
      }

      if (item.paused === true && Number(item.pausedRemainingSeconds) > 0) {
        item.pausedRemainingSeconds =
          Number(item.pausedRemainingSeconds) + addSeconds;
        updatedCount++;
      } else if (item.paused !== true && Number(item.expiresAt) > now) {
        item.expiresAt = Number(item.expiresAt) + addMs;
        updatedCount++;
      }
    }

    if (updatedCount === 0) {
      return interaction.editReply({
        content: `⚠️ \`${rawInput}\` (\`${robloxUserId}\`) does not have an active or paused key right now.`
      });
    }

    writeKeys(database);

    postCompLog(interaction.user.tag, rawInput, robloxUserId, minutes);

    return interaction.editReply({
      content: `🎁 Added ${minutes} minute(s) to \`${rawInput}\`'s (\`${robloxUserId}\`) key.`
    });
  }
};