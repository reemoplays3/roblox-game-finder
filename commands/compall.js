const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postCompLog(discordUsername, minutes, updatedCount) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🎁 Time Added (All Keys)",
            color: 0x2ecc71,
            fields: [
              { name: "⏱️ Amount", value: `${minutes} minute(s)`, inline: true },
              { name: "🔢 Keys Affected", value: String(updatedCount), inline: true },
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
    .setName("compall")
    .setDescription("Add bonus time to every currently active or paused key")
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to add")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const minutes = interaction.options.getInteger("minutes", true);
    const addMs = minutes * 60 * 1000;
    const addSeconds = minutes * 60;

    const database = readKeys();
    const now = Date.now();
    let updatedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
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

    if (updatedCount > 0) {
      writeKeys(database);
      postCompLog(interaction.user.tag, minutes, updatedCount);
    }

    await interaction.reply({
      ephemeral: true,
      content:
        updatedCount === 0
          ? "🎁 No active or paused keys were found to add time to."
          : `🎁 Added ${minutes} minute(s) to ${updatedCount} key(s).`
    });
  }
};