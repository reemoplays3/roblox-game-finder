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
  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!response.ok) return `Unknown (${userId})`;
    const user = await response.json();
    return `[${user.name}](https://www.roblox.com/users/${userId}/profile)`;
  } catch (error) {
    console.error(`Could not load Roblox user ${userId}:`, error);
    return `Unknown (${userId})`;
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("topkeys")
    .setDescription("Shows the top keys by time remaining")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("How many to show (default 10, max 25)")
        .setMinValue(1)
        .setMaxValue(25)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const amount = interaction.options.getInteger("amount") || 10;

    const database = readKeys();
    const now = Date.now();

    const entries = [];

    for (const item of database.keys) {
      if (item.revoked || item.redeemed !== true) {
        continue;
      }

      let remainingSeconds = 0;
      let status;

      if (item.paused === true && Number(item.pausedRemainingSeconds) > 0) {
        remainingSeconds = Number(item.pausedRemainingSeconds);
        status = "Paused";
      } else if (item.paused !== true && Number(item.expiresAt) > now) {
        remainingSeconds = Math.floor((Number(item.expiresAt) - now) / 1000);
        status = "Active";
      } else {
        continue;
      }

      entries.push({
        key: item.key,
        robloxUserId: item.redeemedBy,
        discordUserId: item.discordUserId,
        remainingSeconds,
        status
      });
    }

    entries.sort((a, b) => b.remainingSeconds - a.remainingSeconds);
    const top = entries.slice(0, amount);

    const embed = new EmbedBuilder()
      .setColor(0x1fb8f0)
      .setTitle(`🏆 Top ${top.length} Keys by Time Remaining`)
      .setTimestamp();

    if (top.length === 0) {
      embed.setDescription("No active or paused keys right now.");
    } else {
      for (let i = 0; i < top.length; i++) {
        const entry = top[i];
        const user = await getRobloxUsername(entry.robloxUserId);
        const discordText = entry.discordUserId
          ? `<@${entry.discordUserId}>`
          : "—";
        const statusIcon = entry.status === "Active" ? "🟢" : "⏸️";

        embed.addFields({
          name: `#${i + 1} — ${formatDuration(entry.remainingSeconds)}`,
          value:
            `${statusIcon} ${entry.status}\n` +
            `👤 ${user}\n` +
            `🆔 \`${entry.robloxUserId}\`\n` +
            `💬 Discord: ${discordText}`,
          inline: true
        });
      }
    }

    await interaction.editReply({
      embeds: [embed]
    });
  }
};