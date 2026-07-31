const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys } = require("./lib/keyStore");

// Discord embeds cap out at 25 fields. Each key uses 3 fields here (key,
// second column, and a blank spacer field so rows line up cleanly), so
// this is the most keys that safely fit in a single embed.
const MAX_KEYS_PER_EMBED = 8;

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

// Builds one static (non-paginated) embed for a category. secondColumn is
// an async function (key) => string used for the right-hand column.
async function buildCategoryEmbed({
  categoryKeys,
  label,
  icon,
  color,
  secondColumnLabel,
  secondColumn
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${label} Keys (${categoryKeys.length})`)
    .setTimestamp();

  if (categoryKeys.length === 0) {
    embed.setDescription(`No ${label.toLowerCase()} keys right now.`);
    return embed;
  }

  const shown = categoryKeys.slice(0, MAX_KEYS_PER_EMBED);
  const hiddenCount = categoryKeys.length - shown.length;

  for (const key of shown) {
    const keyLabel = key.pausedLocked
      ? `🔒 \`${key.key}\``
      : `\`${key.key}\``;

    embed.addFields(
      { name: "🔑 Key", value: keyLabel, inline: true },
      { name: secondColumnLabel, value: await secondColumn(key), inline: true },
      // Blank spacer field so each key's 2 columns get their own full
      // row instead of bleeding into the next key's fields.
      { name: "\u200b", value: "\u200b", inline: true }
    );
  }

  if (hiddenCount > 0) {
    embed.setDescription(
      `+${hiddenCount} more not shown (Discord's embed limit).`
    );
  }

  return embed;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("View Active/Paused/Unused Sweet TP keys."),

  async execute(interaction) {
    await interaction.deferReply();

    const database = readKeys();
    const now = Date.now();

    const sorted = [...database.keys].sort(
      (a, b) => Number(b.created || 0) - Number(a.created || 0)
    );

    const activeKeys = sorted.filter(
      key => key.redeemed === true && key.paused !== true && Number(key.expiresAt) > now
    );

    const pausedKeys = sorted.filter(key => key.paused === true);

    const unusedKeys = sorted.filter(key => key.redeemed !== true);

    const userColumn = async key => {
      const user = await getRobloxUsername(key.redeemedBy);
      const id = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";
      return `${user}\n${id}`;
    };

    const activeEmbed = await buildCategoryEmbed({
      categoryKeys: activeKeys,
      label: "Active",
      icon: "🟢",
      color: 0x2ecc71,
      secondColumnLabel: "👤 User",
      secondColumn: userColumn
    });

    const pausedEmbed = await buildCategoryEmbed({
      categoryKeys: pausedKeys,
      label: "Paused",
      icon: "⏸️",
      color: 0xf1c40f,
      secondColumnLabel: "👤 User",
      secondColumn: userColumn
    });

    const unusedEmbed = await buildCategoryEmbed({
      categoryKeys: unusedKeys,
      label: "Unused",
      icon: "🟡",
      color: 0x95a5a6,
      secondColumnLabel: "⏱️ Duration",
      secondColumn: key => `${Number(key.minutes) || 0}m after redemption`
    });

    await interaction.editReply({
      embeds: [activeEmbed, pausedEmbed, unusedEmbed]
    });
  }
};