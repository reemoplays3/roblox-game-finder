const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readUsers, writeUsers } = require("./lib/userStore");
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
    .setName("checkuser")
    .setDescription("Checks a Roblox user's whitelist/blacklist/neutral status and key time")
    .addStringOption(option =>
      option
        .setName("roblox_user_id")
        .setDescription("The numeric Roblox user ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    const robloxUserId = interaction.options
      .getString("roblox_user_id", true)
      .trim();

    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({
        content: "⚠️ Please enter a valid numeric Roblox user ID.",
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const users = readUsers();
    const database = readKeys();
    const now = Date.now();

    // Same live check the game itself uses — any key record (active,
    // paused, or even expired-but-not-yet-cleaned) that isn't revoked
    // counts as real redemption history, not just the permanent list.
    const hasKeyRecord = database.keys.some(item =>
      String(item.redeemedBy || "") === robloxUserId && !item.revoked
    );

    const isBlacklisted = users.blacklisted.includes(robloxUserId);
    const isNeutral = users.neutral.includes(robloxUserId);
    const isPermanent = users.permanent.includes(robloxUserId);
    const hasHistory = users.everRedeemed.includes(robloxUserId) || hasKeyRecord;

    // Self-healing: if live key evidence exists but the permanent record
    // never caught it, fix that right now so this can't drift again.
    if (hasKeyRecord && !users.everRedeemed.includes(robloxUserId)) {
      users.everRedeemed.push(robloxUserId);
      writeUsers(users);
    }

    let statusLine;
    if (isBlacklisted) {
      statusLine = "🔴 **Blacklisted** — cannot redeem keys, no rejoin eligibility";
    } else if (isNeutral) {
      statusLine = "⚪ **Neutral** — can redeem keys, no rejoin eligibility";
    } else if (isPermanent || hasHistory) {
      statusLine = "🟢 **Whitelisted** — rejoin-eligible" + (isPermanent ? " (permanent access)" : "");
    } else {
      statusLine = "⚪ **Neutral** — never redeemed a key, no special status";
    }

    const holder = database.keys.find(item =>
      String(item.redeemedBy || "") === robloxUserId &&
      !item.revoked &&
      (
        (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
        (item.paused !== true && Number(item.expiresAt) > now)
      )
    );

    let keyLine;
    if (!holder) {
      keyLine = "No active or paused key right now.";
    } else if (holder.paused === true) {
      keyLine =
        `⏸️ Paused — \`${holder.key}\`\n` +
        `${formatDuration(Number(holder.pausedRemainingSeconds) || 0)} banked` +
        (holder.pausedLocked ? " 🔒 (locked by admin)" : "");
    } else {
      keyLine =
        `🟢 Active — \`${holder.key}\`\n` +
        `${formatDuration(Math.floor((Number(holder.expiresAt) - now) / 1000))} remaining`;
    }

    const user = await getRobloxUsername(robloxUserId);

    const embed = new EmbedBuilder()
      .setColor(isBlacklisted ? 0xed4245 : isNeutral ? 0x95a5a6 : 0x1fb8f0)
      .setTitle(`🔎 User Check: \`${robloxUserId}\``)
      .addFields(
        { name: "👤 User", value: user },
        { name: "📋 Status", value: statusLine },
        { name: "⏱️ Key", value: keyLine }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });
  }
};