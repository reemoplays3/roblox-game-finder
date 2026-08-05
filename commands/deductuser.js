const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");
const { resolveRobloxUserId } = require("./lib/robloxLookup");

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("deductuser")
    .setDescription("Removes time from one Roblox user's active or paused key")
    .addStringOption(option =>
      option
        .setName("roblox_user")
        .setDescription("Roblox username or numeric user ID.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to remove")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const rawInput = interaction.options.getString("roblox_user", true).trim();
    const minutes = interaction.options.getInteger("minutes", true);

    await interaction.deferReply({ ephemeral: true });

    const robloxUserId = await resolveRobloxUserId(rawInput);

    if (!robloxUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${rawInput}\`.`
      });
    }

    const deductMs = minutes * 60 * 1000;
    const deductSeconds = minutes * 60;

    const database = readKeys();
    const now = Date.now();
    let updatedCount = 0;
    let totalDeductedSeconds = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
        continue;
      }

      if (String(item.redeemedBy || "") !== robloxUserId) {
        continue;
      }

      if (item.paused === true && Number(item.pausedRemainingSeconds) > 0) {
        const current = Number(item.pausedRemainingSeconds);
        const actualDeduction = Math.min(current, deductSeconds);
        item.pausedRemainingSeconds = current - actualDeduction;
        totalDeductedSeconds += actualDeduction;
        updatedCount++;
      } else if (item.paused !== true && Number(item.expiresAt) > now) {
        const currentRemainingMs = Number(item.expiresAt) - now;
        const actualDeductionMs = Math.min(currentRemainingMs, deductMs);
        item.expiresAt = Number(item.expiresAt) - actualDeductionMs;
        totalDeductedSeconds += Math.floor(actualDeductionMs / 1000);
        updatedCount++;
      }
    }

    if (updatedCount === 0) {
      return interaction.editReply({
        content: `⚠️ \`${rawInput}\` (\`${robloxUserId}\`) does not have an active or paused key right now.`
      });
    }

    writeKeys(database);

    const cappedNote = totalDeductedSeconds < deductSeconds
      ? ` (capped — they only had ${formatDuration(totalDeductedSeconds)} left)`
      : "";

    return interaction.editReply({
      content: `➖ Removed ${formatDuration(totalDeductedSeconds)} from \`${rawInput}\`'s (\`${robloxUserId}\`) key${cappedNote}.`
    });
  }
};