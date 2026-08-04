const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readUsers, writeUsers } = require("./lib/userStore");
const { readKeys } = require("./lib/keyStore");
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

// Finds the Roblox account linked to a Discord user, by searching key
// history for a key with that discordUserId attached (set by /keysend or
// a claimed Buyer Role). Prefers their currently active/paused key if
// they have one, otherwise falls back to the most recently created
// linked key. Returns null if no link is found at all.
function findLinkedRobloxUserId(discordUserId) {
  const database = readKeys();
  const now = Date.now();

  const linkedKeys = database.keys.filter(item =>
    !item.revoked &&
    String(item.discordUserId || "") === discordUserId &&
    item.redeemedBy
  );

  if (linkedKeys.length === 0) {
    return null;
  }

  const activeOrPaused = linkedKeys.find(item =>
    (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
    (item.paused !== true && Number(item.expiresAt) > now)
  );

  if (activeOrPaused) {
    return String(activeOrPaused.redeemedBy);
  }

  linkedKeys.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
  return String(linkedKeys[0].redeemedBy);
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("checkuser")
    .setDescription("Checks a user's whitelist/blacklist status and key time, by Discord or Roblox account")
    .addUserOption(option =>
      option
        .setName("discord_user")
        .setDescription("Look up by their Discord account")
    )
    .addStringOption(option =>
      option
        .setName("roblox_user")
        .setDescription("Look up by Roblox username or user ID")
    ),

  async execute(interaction) {
    const discordUser = interaction.options.getUser("discord_user");
    const robloxInput = interaction.options.getString("roblox_user");

    if (discordUser && robloxInput) {
      return interaction.reply({
        content: "⚠️ Please use only one of `discord_user` or `roblox_user`, not both.",
        ephemeral: true
      });
    }

    if (!discordUser && !robloxInput) {
      return interaction.reply({
        content: "⚠️ Please provide either `discord_user` or `roblox_user`.",
        ephemeral: true
      });
    }

    await interaction.deferReply();

    let robloxUserId;
    let lookupSourceNote = "";

    if (discordUser) {
      robloxUserId = findLinkedRobloxUserId(discordUser.id);

      if (!robloxUserId) {
        return interaction.editReply({
          content: `⚠️ Could not find a Roblox account linked to ${discordUser} — they need to have received a key via \`/keysend\` or claimed the Buyer role at least once.`
        });
      }

      lookupSourceNote = `Linked via Discord: <@${discordUser.id}>`;
    } else {
      robloxUserId = await resolveRobloxUserId(robloxInput);

      if (!robloxUserId) {
        return interaction.editReply({
          content: `⚠️ Could not find a Roblox user matching \`${robloxInput}\`.`
        });
      }
    }

    const users = readUsers();
    const database = readKeys();
    const now = Date.now();

    const hasKeyRecord = database.keys.some(item =>
      String(item.redeemedBy || "") === robloxUserId && !item.revoked
    );

    const isBlacklisted = users.blacklisted.includes(robloxUserId);
    const isBanned = users.banned.includes(robloxUserId);
    const isNeutral = users.neutral.includes(robloxUserId);
    const isPermanent = users.permanent.includes(robloxUserId);
    const hasHistory = users.everRedeemed.includes(robloxUserId) || hasKeyRecord;

    if (hasKeyRecord && !users.everRedeemed.includes(robloxUserId)) {
      users.everRedeemed.push(robloxUserId);
      writeUsers(users);
    }

    let statusLine;
    if (isBanned) {
      statusLine = "🔨 **Banned** — kicked from the game, cannot rejoin";
    } else if (isBlacklisted) {
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

    const robloxUser = await getRobloxUsername(robloxUserId);

    const embed = new EmbedBuilder()
      .setColor(isBanned ? 0x000000 : isBlacklisted ? 0xed4245 : isNeutral ? 0x95a5a6 : 0x1fb8f0)
      .setTitle(`🔎 User Check: \`${robloxUserId}\``)
      .addFields(
        { name: "👤 Roblox User", value: robloxUser },
        { name: "📋 Status", value: statusLine },
        { name: "⏱️ Key", value: keyLine }
      )
      .setTimestamp();

    if (lookupSourceNote) {
      embed.setFooter({ text: lookupSourceNote });
    }

    await interaction.editReply({
      embeds: [embed]
    });
  }
};