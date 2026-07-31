const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { readKeys } = require("./lib/keyStore");

const KEYS_PER_PAGE = 7;
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

function getKeyState(key, now) {
  if (key.paused === true) return { icon: "⏸️", name: "Paused", remaining: "Paused" };
  if (key.redeemed !== true) {
    return {
      icon: "🟡",
      name: "Unused",
      remaining: `${Number(key.minutes) || 0}m after redemption`
    };
  }

  const secondsLeft = Math.floor(((Number(key.expiresAt) || 0) - now) / 1000);
  if (secondsLeft > 0) {
    return { icon: "🟢", name: "Active", remaining: formatDuration(secondsLeft) };
  }

  return { icon: "⚫", name: "Expired", remaining: "Expired" };
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

async function buildPage(page, usernameCache) {
  // readKeys() already prunes revoked/fully-expired keys on every call —
  // no separate cleanup step needed here anymore.
  const database = readKeys();

  const now = Date.now();
  const keys = [...database.keys].sort((a, b) => {
    const aActive = a.redeemed === true && a.paused !== true && Number(a.expiresAt) > now;
    const bActive = b.redeemed === true && b.paused !== true && Number(b.expiresAt) > now;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return Number(b.created || 0) - Number(a.created || 0);
  });

  const totalPages = Math.max(1, Math.ceil(keys.length / KEYS_PER_PAGE));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const pageKeys = keys.slice(page * KEYS_PER_PAGE, page * KEYS_PER_PAGE + KEYS_PER_PAGE);

  const activeCount = keys.filter(k => k.redeemed === true && k.paused !== true && Number(k.expiresAt) > now).length;
  const unusedCount = keys.filter(k => k.redeemed !== true).length;
  const pausedCount = keys.filter(k => k.paused === true).length;

  const embed = new EmbedBuilder()
    .setColor(0x1FB8F0)
    .setTitle("🔑 Sweet TP Key List")
    .setDescription(`🟢 **${activeCount} Active**  •  🟡 **${unusedCount} Unused**  •  ⏸️ **${pausedCount} Paused**`)
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Updates every minute` })
    .setTimestamp();

  if (pageKeys.length === 0) {
    embed.addFields({ name: "No keys found", value: "Generate a key with `/generatekeys`." });
  } else {
    for (const key of pageKeys) {
      const state = getKeyState(key, now);
      const user = await getRobloxUsername(key.redeemedBy, usernameCache);
      const userId = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";

      // Three inline fields per key = one row with three columns
      // (Discord auto-wraps inline fields 3-per-row, so this lines up
      // as Key | Time | User for every key in the list).
      embed.addFields(
        {
          name: "🔑 Key",
          value: `${state.icon} \`${key.key}\`\n${state.name}`,
          inline: true
        },
        {
          name: "⏱️ Time",
          value: state.remaining,
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
    new ButtonBuilder().setCustomId("keylist_previous").setEmoji("⬅️").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("keylist_refresh").setEmoji("🔄").setLabel("Refresh").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("keylist_next").setEmoji("➡️").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  );

  return { embed, row, page, totalPages };
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("View all current Sweet TP keys."),

  async execute(interaction) {
    await interaction.deferReply();

    let currentPage = 0;
    const usernameCache = new Map();
    const firstPage = await buildPage(currentPage, usernameCache);
    currentPage = firstPage.page;

    const message = await interaction.editReply({
      embeds: [firstPage.embed],
      components: [firstPage.row]
    });

    async function refreshMessage() {
      const pageData = await buildPage(currentPage, usernameCache);
      currentPage = pageData.page;
      await interaction.editReply({ embeds: [pageData.embed], components: [pageData.row] });
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
      if (buttonInteraction.customId === "keylist_previous") currentPage -= 1;
      if (buttonInteraction.customId === "keylist_next") currentPage += 1;
      await refreshMessage();
    });

    const updateInterval = setInterval(() => {
      refreshMessage().catch(error => console.error("Could not refresh /keylist:", error));
    }, UPDATE_EVERY_MS);

    collector.on("end", async () => {
      clearInterval(updateInterval);
      try {
        const pageData = await buildPage(currentPage, usernameCache);
        for (const component of pageData.row.components) component.setDisabled(true);
        pageData.embed.setFooter({ text: `Page ${pageData.page + 1}/${pageData.totalPages} • Live updates ended` });
        await interaction.editReply({ embeds: [pageData.embed], components: [pageData.row] });
      } catch (error) {
        console.error("Could not close /keylist controls:", error);
      }
    });
  }
};