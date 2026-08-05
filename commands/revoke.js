const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys, archiveRevokedKey } = require("./lib/keyStore");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postRevokeLog(discordUsername, categoryLabel, count) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🗑️ Keys Revoked",
            color: 0xed4245,
            fields: [
              { name: "📋 Category", value: categoryLabel, inline: true },
              { name: "🔢 Count", value: String(count), inline: true },
              { name: "👮 Revoked By", value: discordUsername, inline: true }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Could not post revoke log:", error);
  }
}

const CATEGORY_LABELS = {
  active: "Active",
  paused: "Paused",
  unused: "Unused"
};

function matchesCategory(key, category, now) {
  if (category === "active") {
    return (
      key.redeemed === true &&
      key.paused !== true &&
      Number(key.expiresAt) > now
    );
  }

  if (category === "paused") {
    return key.paused === true;
  }

  if (category === "unused") {
    return key.redeemed !== true;
  }

  return false;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revokes every key in one category (can be undone per-key with /restorekey)")
    .addStringOption(option =>
      option
        .setName("category")
        .setDescription("Which keys to revoke")
        .setRequired(true)
        .addChoices(
          { name: "Active", value: "active" },
          { name: "Paused", value: "paused" },
          { name: "Unused", value: "unused" }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString("category", true);
    const categoryLabel = CATEGORY_LABELS[category];

    const database = readKeys();
    const now = Date.now();

    const toRevoke = database.keys.filter(key => matchesCategory(key, category, now));

    for (const key of toRevoke) {
      archiveRevokedKey(key);
    }

    database.keys = database.keys.filter(key => !matchesCategory(key, category, now));
    const revokedCount = toRevoke.length;

    if (revokedCount > 0) {
      writeKeys(database);
      postRevokeLog(interaction.user.tag, categoryLabel, revokedCount);
    }

    await interaction.reply({
      content:
        revokedCount === 0
          ? `🗑️ There were no ${categoryLabel.toLowerCase()} keys to revoke.`
          : `🗑️ ${revokedCount} ${categoryLabel.toLowerCase()} key(s) were revoked. Each can be undone individually with \`/restorekey\`.`
    });
  }
};