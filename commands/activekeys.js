const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys } = require("./lib/keyStore");

// Discord embeds cap out at 25 fields. Each key uses exactly 3 fields
// here (key, user, time), which divides evenly into rows of 3 — no
// spacer field needed. 25 / 3 = 8 keys safely fit.
const MAX_KEYS_SHOWN = 8;
const UPDATE_EVERY_MS = 30_000;

const usernameCache = new Map();

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
  if (usernameCache.has(id)) return usernameCache.get(id);

  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${id}`);
    if (!response.ok) return `Unknown (${id})`;
    const user = await response.json();
    const result = `[${user.name}](https://www.roblox.com/users/${id}/profile)`;
    usernameCache.set(id, result);
    return result;
  } catch (error) {
    console.error(`Could not load Roblox user ${id}:`, error);
    return `Unknown (${id})`;
  }
}

async function buildEmbed() {
  const database = readKeys();
  const now = Date.now();

  const activeKeys = database.keys.filter(
    key => key.redeemed === true && key.paused !== true && Number(key.expiresAt) > now
  );

  const pausedKeys = database.keys.filter(key => key.paused === true);

  // Active first, then Paused — newest first within each group.
  const combined = [
    ...[...activeKeys].sort((a, b) => Number(b.created || 0) - Number(a.created || 0)),
    ...[...pausedKeys].sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
  ];

  const embed = new EmbedBuilder()
    .setColor(0x1fb8f0)
    .setTitle(`🔑 Active & Paused Keys (${combined.length})`)
    .setDescription(
      `🟢 **${activeKeys.length} Active**  •  ⏸️ **${pausedKeys.length} Paused**`
    )
    .setFooter({ text: "Updates every 30 seconds" })
    .setTimestamp();

  if (combined.length === 0) {
    embed.addFields({
      name: "Nothing here",
      value: "No active or paused keys right now."
    });
    return embed;
  }

  const shown = combined.slice(0, MAX_KEYS_SHOWN);
  const hiddenCount = combined.length - shown.length;

  for (const key of shown) {
    const isPaused = key.paused === true;
    const icon = isPaused ? (key.pausedLocked ? "⏸️🔒" : "⏸️") : "🟢";

    const timeText = isPaused
      ? formatDuration(Number(key.pausedRemainingSeconds) || 0)
      : formatDuration(Math.floor((Number(key.expiresAt) - now) / 1000));

    const user = await getRobloxUsername(key.redeemedBy);
    const userId = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";

    embed.addFields(
      { name: "🔑 Key", value: `${icon} \`${key.key}\``, inline: true },
      { name: "👤 User", value: `${user}\n${userId}`, inline: true },
      { name: "⏱️ Time", value: timeText, inline: true }
    );
  }

  if (hiddenCount > 0) {
    embed.addFields({
      name: "\u200b",
      value: `+${hiddenCount} more not shown (Discord's embed limit).`
    });
  }

  return embed;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("activekeys")
    .setDescription("Shows only Active and Paused keys — key, user, and time left"),

  async execute(interaction) {
    await interaction.deferReply();

    const firstEmbed = await buildEmbed();

    // Editing through the interaction only works for ~15 minutes before
    // Discord expires the token. Grabbing the actual Message object here
    // and calling message.edit() on it from now on uses the bot's normal
    // channel permissions instead, so it can keep refreshing forever.
    const message = await interaction.editReply({ embeds: [firstEmbed] });

    setInterval(async () => {
      try {
        const embed = await buildEmbed();
        await message.edit({ embeds: [embed] });
      } catch (error) {
        console.error("Could not refresh /activekeys:", error);
      }
    }, UPDATE_EVERY_MS);
  }
};