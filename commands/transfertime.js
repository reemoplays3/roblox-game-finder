const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys, makeKeyEntry } = require("./lib/keyStore");
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

function findHolderKeyIndex(database, robloxUserId, now) {
  return database.keys.findIndex(item =>
    String(item.redeemedBy || "") === robloxUserId &&
    !item.revoked &&
    (
      (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
      (item.paused !== true && Number(item.expiresAt) > now)
    )
  );
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("transferkey")
    .setDescription("Transfers minutes of active/paused key time from one Roblox user to another")
    .addStringOption(option =>
      option
        .setName("from_user")
        .setDescription("Roblox username or user ID to take time from")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("to_user")
        .setDescription("Roblox username or user ID to give time to")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to transfer")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const fromRawInput = interaction.options.getString("from_user", true).trim();
    const toRawInput = interaction.options.getString("to_user", true).trim();
    const minutes = interaction.options.getInteger("minutes", true);

    await interaction.deferReply({ ephemeral: true });

    const fromUserId = await resolveRobloxUserId(fromRawInput);
    if (!fromUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${fromRawInput}\`.`
      });
    }

    const toUserId = await resolveRobloxUserId(toRawInput);
    if (!toUserId) {
      return interaction.editReply({
        content: `⚠️ Could not find a Roblox user matching \`${toRawInput}\`.`
      });
    }

    if (fromUserId === toUserId) {
      return interaction.editReply({
        content: "⚠️ Both users are the same — nothing to transfer."
      });
    }

    const database = readKeys();
    const now = Date.now();

    const fromKeyIndex = findHolderKeyIndex(database, fromUserId, now);

    if (fromKeyIndex === -1) {
      return interaction.editReply({
        content: `⚠️ \`${fromRawInput}\` (\`${fromUserId}\`) does not have an active or paused key.`
      });
    }

    const fromKey = database.keys[fromKeyIndex];

    const fromRemainingSeconds = fromKey.paused === true
      ? Number(fromKey.pausedRemainingSeconds) || 0
      : Math.max(0, Math.floor((Number(fromKey.expiresAt) - now) / 1000));

    const transferSeconds = minutes * 60;

    if (transferSeconds > fromRemainingSeconds) {
      return interaction.editReply({
        content:
          `⚠️ \`${fromRawInput}\` only has ${formatDuration(fromRemainingSeconds)} — ` +
          `not enough to transfer ${minutes} minute(s).`
      });
    }

    // Deduct from the source key. Left at 0, it'll get cleaned up
    // automatically the next time anything reads keys.json.
    if (fromKey.paused === true) {
      fromKey.pausedRemainingSeconds = fromRemainingSeconds - transferSeconds;
    } else {
      fromKey.expiresAt = Number(fromKey.expiresAt) - transferSeconds * 1000;
    }

    const toKeyIndex = findHolderKeyIndex(database, toUserId, now);

    if (toKeyIndex !== -1) {
      const toKey = database.keys[toKeyIndex];

      if (toKey.paused === true) {
        toKey.pausedRemainingSeconds =
          (Number(toKey.pausedRemainingSeconds) || 0) + transferSeconds;
      } else {
        toKey.expiresAt = Number(toKey.expiresAt) + transferSeconds * 1000;
      }
    } else {
      // No existing key to receive it — grant a fresh one.
      const newKey = makeKeyEntry(minutes);
      newKey.redeemed = true;
      newKey.redeemedAt = now;
      newKey.redeemedBy = toUserId;
      newKey.expiresAt = now + transferSeconds * 1000;
      database.keys.push(newKey);
    }

    writeKeys(database);

    return interaction.editReply({
      content: `🔁 Transferred ${minutes} minute(s) from \`${fromRawInput}\` to \`${toRawInput}\`.`
    });
  }
};