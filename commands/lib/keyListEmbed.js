const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { readKeys } = require("./keyStore");

const KEYS_PER_PAGE = 3;
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

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

// Builds a full, ready-to-export command module (data + execute) for a
// paginated, filtered view of the key list. Used by /activekeys,
// /pausedkeys, and /unusedkeys so all three share the same pagination
// logic instead of each reimplementing it.
function createPaginatedKeyListCommand({
  commandName,
  description,
  categoryLabel,
  icon,
  color,
  filterFn,
  timeLabel,
  timeValueFn
}) {
  function getFiltered() {
    const database = readKeys();
    const now = Date.now();
    const filtered = database.keys
      .filter(key => filterFn(key, now))
      .sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
    return { filtered, now };
  }

  async function buildEmbed(page) {
    const { filtered, now } = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / KEYS_PER_PAGE));
    page = Math.min(Math.max(0, page), totalPages - 1);
    const pageKeys = filtered.slice(page * KEYS_PER_PAGE, page * KEYS_PER_PAGE + KEYS_PER_PAGE);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${icon} ${categoryLabel} Keys (${filtered.length})`)
      .setFooter({ text: `Page ${page + 1}/${totalPages}` })
      .setTimestamp();

    if (pageKeys.length === 0) {
      embed.setDescription(`No ${categoryLabel.toLowerCase()} keys right now.`);
    } else {
      for (const key of pageKeys) {
        const user = await getRobloxUsername(key.redeemedBy);
        const userId = key.redeemedBy ? `\`${key.redeemedBy}\`` : "—";

        embed.addFields(
          { name: "🔑 Key", value: `\`${key.key}\``, inline: true },
          { name: timeLabel, value: timeValueFn(key, now), inline: true },
          { name: "👤 User", value: `${user}\n${userId}`, inline: true }
        );
      }
    }

    return { embed, page, totalPages };
  }

  function buildRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${commandName}_previous`)
        .setEmoji("⬅️")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${commandName}_next`)
        .setEmoji("➡️")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
  }

  return {
    ownerOnly: true,

    data: new SlashCommandBuilder()
      .setName(commandName)
      .setDescription(description),

    async execute(interaction) {
      await interaction.deferReply();

      let currentPage = 0;
      const first = await buildEmbed(currentPage);
      currentPage = first.page;

      const message = await interaction.editReply({
        embeds: [first.embed],
        components: [buildRow(first.page, first.totalPages)]
      });

      const collector = message.createMessageComponentCollector({
        time: 30 * 60 * 1000
      });

      collector.on("collect", async buttonInteraction => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          return buttonInteraction.reply({
            content: "Only the person who opened this list can use these buttons.",
            ephemeral: true
          });
        }

        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `${commandName}_previous`) currentPage -= 1;
        if (buttonInteraction.customId === `${commandName}_next`) currentPage += 1;

        const data = await buildEmbed(currentPage);
        currentPage = data.page;

        await interaction.editReply({
          embeds: [data.embed],
          components: [buildRow(data.page, data.totalPages)]
        });
      });

      collector.on("end", async () => {
        try {
          const data = await buildEmbed(currentPage);
          const row = buildRow(data.page, data.totalPages);
          for (const component of row.components) component.setDisabled(true);
          await interaction.editReply({ embeds: [data.embed], components: [row] });
        } catch (error) {
          console.error(`Could not close /${commandName} controls:`, error);
        }
      });
    }
  };
}

module.exports = {
  createPaginatedKeyListCommand,
  formatDuration,
  getRobloxUsername,
  KEYS_PER_PAGE
};