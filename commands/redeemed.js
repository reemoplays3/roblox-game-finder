const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { readKeys } = require("./lib/keyStore");

const redemptionsPath = path.join(process.cwd(), "data", "redemptions.json");

function readRedemptionLog() {
  try {
    const data = JSON.parse(fs.readFileSync(redemptionsPath, "utf8"));
    if (!Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch (_error) {
    return { entries: [] };
  }
}

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
  if (!id) return "Unknown";

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
    .setName("redeem")
    .setDescription("Shows the 5 most recently redeemed keys"),

  async execute(interaction) {
    await interaction.deferReply();

    const log = readRedemptionLog();
    const recent = [...log.entries]
      .sort((a, b) => Number(b.redeemedAt || 0) - Number(a.redeemedAt || 0))
      .slice(0, 5);

    const embed = new EmbedBuilder()
      .setColor(0x1fb8f0)
      .setTitle("🔑 5 Most Recent Redemptions")
      .setTimestamp();

    if (recent.length === 0) {
      embed.setDescription("No redemptions have been logged yet.");
    } else {
      const database = readKeys();
      const now = Date.now();

      for (const entry of recent) {
        // Whatever their CURRENT active/paused key looks like right now
        // (not what it looked like at the moment they redeemed).
        const holder = database.keys.find(item =>
          String(item.redeemedBy || "") === entry.robloxUserId &&
          !item.revoked &&
          (
            (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
            (item.paused !== true && Number(item.expiresAt) > now)
          )
        );

        let activeTimeText = "No active/paused time";
        if (holder) {
          activeTimeText = holder.paused === true
            ? `${formatDuration(Number(holder.pausedRemainingSeconds) || 0)} (paused)`
            : formatDuration(Math.floor((Number(holder.expiresAt) - now) / 1000));
        }

        const grantType = entry.wasFirstRedeem
          ? "🆕 First redeem — granted admin panel access"
          : "➕ Added time to an existing session";

        const user = await getRobloxUsername(entry.robloxUserId);
        const redeemedTimestamp = Math.floor((Number(entry.redeemedAt) || 0) / 1000);

        embed.addFields(
          { name: "🔑 Key", value: `\`${entry.key}\``, inline: true },
          { name: "👤 User", value: `${user}\n\`${entry.robloxUserId}\``, inline: true },
          { name: "⏱️ Active Time", value: activeTimeText, inline: true },
          {
            name: "📋 Details",
            value: `${grantType}\nRedeemed <t:${redeemedTimestamp}:R>`,
            inline: false
          }
        );
      }
    }

    await interaction.editReply({
      embeds: [embed]
    });
  }
};