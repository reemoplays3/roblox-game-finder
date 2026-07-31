const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys } = require("./lib/keyStore");

// Discord embeds cap out at 25 fields. Each key uses 3 fields here (key,
// user, and a blank spacer field so rows line up cleanly), so this is
// the most keys that safely fit in a single embed.
const MAX_KEYS_SHOWN = 8;

const UPDATE_EVERY_MS = 30_000;
const LIVE_FOR_MS = 6 * 60 * 60 * 1000;

const usernameCache = new Map();

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

function statusIcon(key, now) {
  if (key.paused === true) return key.pausedLocked ? "⏸️🔒" : "⏸️";
  if (key.redeemed === true && Number(key.expiresAt) > now) return "🟢";
  return "🟡";
}

// 0 = Active, 1 = Paused, 2 = Unused — this ordering is what makes
// Active always list first, then Paused, then Unused.
function statusRank(key, now) {
  if (key.redeemed === true && key.paused !== true && Number(key.expiresAt) > now) return 0;
  if (key.paused === true) return 1;
  return 2;
}

async function buildEmbed(liveUpdatesEnded) {
  const database = readKeys();
  const now = Date.now();

  const sorted = [...database.keys].sort((a, b) => {
    const rankDiff = statusRank(a, now) - statusRank(b, now);
    if (rankDiff !== 0) return rankDiff;
    return Number(b.created || 0) - Number(a.created || 0);
  });

  const activeCount = sorted.filter(k => statusRank(k, now) === 0).length;
  const pausedCount = sorted.filter(k => statusRank(k, now) === 1).length;
  const unusedCount = sorted.filter(k => statusRank(k, now) === 2).length;

  const embed = new EmbedBuilder()
    .setColor(0x1fb8f0)
    .setTitle(`🔑 Sweet TP Key List (${sorted.length})`)
    .setDescription(
      `🟢 **${activeCount} Active**  •  ⏸️ **${pausedCount} Paused**  •  🟡 **${unusedCount} Unused**`
    )
    .setFooter({
      text: liveUpdatesEnded
        ? "Live updates ended"
        : "Updates every 30 seconds"
    })
    .setTimestamp();

  if (sorted.length === 0) {
    embed.addFields({ name: "No keys found", value: "Generate one with `/generatekey`." });
    return embed;
  }

  const shown = sorted.slice(0, MAX_KEYS_SHOWN);
  const hiddenCount = sorted.length - shown.length;

  for (const key of shown) {
    const keyLabel = `${statusIcon(key, now)} \`${key.key}\``;
    const user = await getRobloxUsername(key.redeemedBy);
    const userId = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";

    embed.addFields(
      { name: "🔑 Key", value: keyLabel, inline: true },
      { name: "👤 User", value: `${user}\n${userId}`, inline: true },
      // Blank spacer field so each key's 2 columns get a full row
      // instead of bleeding into the next key's fields.
      { name: "\u200b", value: "\u200b", inline: true }
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
    .setName("keylist")
    .setDescription("View every Sweet TP key in one list, sorted Active > Paused > Unused."),

  async execute(interaction) {
    await interaction.deferReply();

    const firstEmbed = await buildEmbed(false);
    await interaction.editReply({ embeds: [firstEmbed] });

    const updateInterval = setInterval(async () => {
      try {
        const embed = await buildEmbed(false);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("Could not refresh /keylist:", error);
      }
    }, UPDATE_EVERY_MS);

    setTimeout(async () => {
      clearInterval(updateInterval);
      try {
        const embed = await buildEmbed(true);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("Could not close out /keylist:", error);
      }
    }, LIVE_FOR_MS);
  }
};