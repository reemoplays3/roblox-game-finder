const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { readKeys } = require("./lib/keyStore");

const KEYS_PER_PAGE = 5;
const UPDATE_EVERY_MS = 60_000;
const LIVE_FOR_MS = 6 * 60 * 60 * 1000;

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

async function getRobloxUsername(userId, cache) {
  const id = String(userId || "").trim();
  if (!id) return "Not redeemed";
  if (cache.has(id)) return cache.get(id);

  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${id}`);
    if (!response.ok) return `Unknown (${id})`;
    const user = await response.json();
    const result = `[${user.name}](https://www.roblox.com/users/${id}/profile)`;
    cache.set(id, result);
    return result;
  } catch (error) {
    console.error(`Could not load Roblox user ${id}:`, error);
    return `Unknown (${id})`;
  }
}

// Builds one embed + one Previous/Refresh/Next button row for a single
// category (Active, Paused, or Unused). Each category pages completely
// independently of the other two.
async function buildCategoryEmbed({
  categoryKeys,
  page,
  label,
  icon,
  color,
  customIdPrefix,
  timeLabel,
  usernameCache,
  now
}) {
  const totalPages = Math.max(1, Math.ceil(categoryKeys.length / KEYS_PER_PAGE));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const pageKeys = categoryKeys.slice(
    page * KEYS_PER_PAGE,
    page * KEYS_PER_PAGE + KEYS_PER_PAGE
  );

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${label} Keys (${categoryKeys.length})`)
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Updates every minute` })
    .setTimestamp();

  if (pageKeys.length === 0) {
    embed.setDescription(`No ${label.toLowerCase()} keys right now.`);
  } else {
    for (const key of pageKeys) {
      const user = await getRobloxUsername(key.redeemedBy, usernameCache);
      const userId = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";

      embed.addFields(
        {
          name: "🔑 Key",
          value: `\`${key.key}\``,
          inline: true
        },
        {
          name: "⏱️ Time",
          value: timeLabel(key, now),
          inline: true
        },
        {
          name: "👤 User",
          value: `${user}\n${userId}`,
          inline: true
        }
      );
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_previous`)
      .setEmoji("⬅️")
      .setLabel(`${label} Prev`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_refresh`)
      .setEmoji("🔄")
      .setLabel(`${label} Refresh`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_next`)
      .setEmoji("➡️")
      .setLabel(`${label} Next`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  return { embed, row, page };
}

// Reads the current key list, splits it into the three categories, and
// builds all three embeds/rows using whatever page each category is
// currently on (currentPages gets updated in place with clamped values).
async function buildAllEmbeds(currentPages, usernameCache) {
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

  const active = await buildCategoryEmbed({
    categoryKeys: activeKeys,
    page: currentPages.active,
    label: "Active",
    icon: "🟢",
    color: 0x2ecc71,
    customIdPrefix: "keylist_active",
    usernameCache,
    now,
    timeLabel: (key, nowMs) =>
      formatDuration(Math.floor((Number(key.expiresAt) - nowMs) / 1000))
  });

  const paused = await buildCategoryEmbed({
    categoryKeys: pausedKeys,
    page: currentPages.paused,
    label: "Paused",
    icon: "⏸️",
    color: 0xf1c40f,
    customIdPrefix: "keylist_paused",
    usernameCache,
    now,
    timeLabel: key =>
      `${formatDuration(Number(key.pausedRemainingSeconds) || 0)}` +
      (key.pausedLocked ? " 🔒" : "")
  });

  const unused = await buildCategoryEmbed({
    categoryKeys: unusedKeys,
    page: currentPages.unused,
    label: "Unused",
    icon: "🟡",
    color: 0x95a5a6,
    customIdPrefix: "keylist_unused",
    usernameCache,
    now,
    timeLabel: key => `${Number(key.minutes) || 0}m after redemption`
  });

  currentPages.active = active.page;
  currentPages.paused = paused.page;
  currentPages.unused = unused.page;

  return {
    embeds: [active.embed, paused.embed, unused.embed],
    rows: [active.row, paused.row, unused.row]
  };
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("View all current Sweet TP keys, split into Active/Paused/Unused."),

  async execute(interaction) {
    await interaction.deferReply();

    const currentPages = { active: 0, paused: 0, unused: 0 };
    const usernameCache = new Map();

    const first = await buildAllEmbeds(currentPages, usernameCache);

    const message = await interaction.editReply({
      embeds: first.embeds,
      components: first.rows
    });

    async function refreshMessage() {
      const data = await buildAllEmbeds(currentPages, usernameCache);
      await interaction.editReply({ embeds: data.embeds, components: data.rows });
    }

    const collector = message.createMessageComponentCollector({ time: LIVE_FOR_MS });

    collector.on("collect", async buttonInteraction => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content: "Only the person who opened this key list can use these buttons.",
          ephemeral: true
        });
      }

      await buttonInteraction.deferUpdate();

      // customId looks like "keylist_active_previous" — split off the
      // category ("active"/"paused"/"unused") and the action.
      const parts = buttonInteraction.customId.split("_");
      const category = parts[1];
      const action = parts[2];

      if (category in currentPages) {
        if (action === "previous") currentPages[category] -= 1;
        if (action === "next") currentPages[category] += 1;
        // "refresh" just re-renders without changing the page.
      }

      await refreshMessage();
    });

    const updateInterval = setInterval(() => {
      refreshMessage().catch(error => console.error("Could not refresh /keylist:", error));
    }, UPDATE_EVERY_MS);

    collector.on("end", async () => {
      clearInterval(updateInterval);
      try {
        const data = await buildAllEmbeds(currentPages, usernameCache);
        for (const row of data.rows) {
          for (const component of row.components) {
            component.setDisabled(true);
          }
        }
        await interaction.editReply({ embeds: data.embeds, components: data.rows });
      } catch (error) {
        console.error("Could not close /keylist controls:", error);
      }
    });
  }
};