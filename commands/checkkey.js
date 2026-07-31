const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys } = require("./lib/keyStore");

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

async function getRobloxUsername(userId) {
  const id = String(userId || "").trim();
  if (!id) return "Not redeemed";

  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${id}`);
    if (!response.ok) return `Unknown (${id})`;
    const user = await response.json();
    return `[${user.name}](https://www.roblox.com/users/${id}/profile)`;
  } catch (error) {
    console.error(`Could not load Roblox user ${id}:`, error);
    return `Unknown (${id})`;
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("checkkey")
    .setDescription("Checks the current status of a specific key")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("The key to check")
        .setRequired(true)
    ),

  async execute(interaction) {
    const enteredKey = interaction.options
      .getString("key", true)
      .trim()
      .toUpperCase();

    const database = readKeys();
    const now = Date.now();

    const foundKey = database.keys.find(item => item.key === enteredKey);

    if (!foundKey) {
      return interaction.reply({
        content:
          "❌ That key doesn't exist. It may have never existed, been " +
          "revoked, or fully expired and been automatically cleaned up.",
        ephemeral: true
      });
    }

    let statusLine;
    let color;

    if (foundKey.paused === true) {
      const timeLeft = formatDuration(Number(foundKey.pausedRemainingSeconds) || 0);
      statusLine =
        `⏸️ **Paused** — ${timeLeft} banked` +
        (foundKey.pausedLocked ? " 🔒 (locked by an admin)" : "");
      color = 0xf1c40f;
    } else if (foundKey.redeemed === true && Number(foundKey.expiresAt) > now) {
      const timeLeft = formatDuration(Math.floor((Number(foundKey.expiresAt) - now) / 1000));
      statusLine = `🟢 **Active** — ${timeLeft} remaining`;
      color = 0x2ecc71;
    } else if (foundKey.redeemed === true) {
      // In practice this almost never gets seen — readKeys() auto-prunes
      // fully expired keys the moment anything reads keys.json. Kept here
      // as a safety net in case this runs in the same instant it expired.
      statusLine = "⚫ **Expired**";
      color = 0x2c2f33;
    } else {
      statusLine = `🟡 **Unused** — ${Number(foundKey.minutes) || 0}m after redemption`;
      color = 0x95a5a6;
    }

    const user = await getRobloxUsername(foundKey.redeemedBy);
    const userId = foundKey.redeemedBy ? `\`${foundKey.redeemedBy}\`` : "—";
    const createdTimestamp = Math.floor((Number(foundKey.created) || 0) / 1000);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🔑 Key Check: ${foundKey.key}`)
      .setDescription(statusLine)
      .addFields(
        { name: "👤 User", value: `${user}\n${userId}`, inline: true },
        {
          name: "🕒 Created",
          value: createdTimestamp ? `<t:${createdTimestamp}:R>` : "Unknown",
          inline: true
        }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};