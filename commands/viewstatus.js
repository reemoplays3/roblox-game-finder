const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const usersPath = path.join(
  process.cwd(),
  "data",
  "users.json"
);

const keysPath = path.join(
  process.cwd(),
  "data",
  "keys.json"
);

function normalizeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(item => String(item || "").trim())
        .filter(item => /^\d+$/.test(item))
    )
  );
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    console.error(
      `Could not read ${filePath}:`,
      error
    );

    return fallback;
  }
}

function readStatusDatabase() {
  const users = readJson(usersPath, {});
  const keys = readJson(keysPath, { keys: [] });

  const redeemedUserIds = normalizeIds(
    Array.isArray(keys.keys)
      ? keys.keys
          .filter(key => key && key.redeemed)
          .map(key => key.redeemedBy)
      : []
  );

  const whitelisted = normalizeIds([
    ...normalizeIds(users.redeemAllowed),
    ...normalizeIds(users.whitelisted),
    ...redeemedUserIds
  ]);

  const permanent = normalizeIds([
    ...normalizeIds(users.permanent),
    ...(
      Array.isArray(users.permanent)
        ? []
        : normalizeIds(users.whitelisted)
    )
  ]);

  const blacklisted = normalizeIds(
    users.blacklisted
  );

  return {
    whitelisted,
    permanent,
    blacklisted
  };
}

async function fetchRobloxProfiles(userIds) {
  const profiles = new Map();

  for (
    let index = 0;
    index < userIds.length;
    index += 100
  ) {
    const batch = userIds
      .slice(index, index + 100)
      .map(Number);

    if (batch.length === 0) {
      continue;
    }

    try {
      const response = await fetch(
        "https://users.roblox.com/v1/users",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            userIds: batch,
            excludeBannedUsers: false
          })
        }
      );

      if (!response.ok) {
        throw new Error(
          `Roblox API returned ${response.status}`
        );
      }

      const body = await response.json();

      for (const profile of body.data || []) {
        profiles.set(String(profile.id), {
          id: String(profile.id),
          username:
            profile.name || `User ${profile.id}`,
          displayName:
            profile.displayName || profile.name
        });
      }
    } catch (error) {
      console.error(
        "Could not fetch Roblox profiles:",
        error
      );
    }
  }

  return profiles;
}

function profileLine(userId, profile) {
  const username =
    profile?.username || "Unknown User";

  const displayName =
    profile?.displayName || username;

  const profileUrl =
    `https://www.roblox.com/users/${userId}/profile`;

  const shownName =
    displayName === username
      ? username
      : `${displayName} (@${username})`;

  return (
    `👤 **${shownName}**\n` +
    `🆔 \`${userId}\` • ` +
    `[Roblox Profile](${profileUrl})`
  );
}

function buildSection({
  title,
  icon,
  userIds,
  profiles,
  maxLength = 1024
}) {
  if (userIds.length === 0) {
    return {
      name: `${icon} ${title} (0)`,
      value: "No users currently listed.",
      inline: false
    };
  }

  const sorted = [...userIds].sort((a, b) => {
    const nameA =
      profiles.get(a)?.username || a;

    const nameB =
      profiles.get(b)?.username || b;

    return nameA.localeCompare(nameB);
  });

  const lines = [];
  let currentLength = 0;
  let hiddenCount = 0;

  for (const userId of sorted) {
    const entry =
      profileLine(userId, profiles.get(userId));

    const extraLength =
      entry.length + (lines.length > 0 ? 2 : 0);

    if (
      currentLength + extraLength >
      maxLength - 60
    ) {
      hiddenCount += 1;
      continue;
    }

    lines.push(entry);
    currentLength += extraLength;
  }

  let value = lines.join("\n\n");

  if (hiddenCount > 0) {
    value +=
      `\n\n…and **${hiddenCount} more** ` +
      "not shown because of Discord's embed limit.";
  }

  return {
    name:
      `${icon} ${title} (${userIds.length})`,
    value,
    inline: false
  };
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("viewstatus")
    .setDescription(
      "View all saved Roblox access statuses."
    ),

  async execute(interaction) {
    /*
     * Public response:
     * Everyone in the channel can see it.
     */
    await interaction.deferReply({
      ephemeral: false
    });

    const status = readStatusDatabase();

    const allUserIds = normalizeIds([
      ...status.whitelisted,
      ...status.blacklisted,
      ...status.permanent
    ]);

    const profiles =
      await fetchRobloxProfiles(allUserIds);

    const embed = new EmbedBuilder()
      .setColor(0x1FB8F0)
      .setTitle("📊 Sweet TP User Status")
      .setDescription(
        "Current Roblox access records saved by the bot.\n\n" +
        `🟢 **Whitelisted:** ${status.whitelisted.length}\n` +
        `⭐ **Permanent Access:** ${status.permanent.length}\n` +
        `🔴 **Blacklisted:** ${status.blacklisted.length}`
      )
      .addFields(
        buildSection({
          title: "Whitelisted",
          icon: "🟢",
          userIds: status.whitelisted,
          profiles
        }),
        buildSection({
          title: "Permanent Access",
          icon: "⭐",
          userIds: status.permanent,
          profiles
        }),
        buildSection({
          title: "Blacklisted",
          icon: "🔴",
          userIds: status.blacklisted,
          profiles
        })
      )
      .setFooter({
        text:
          "Sweet TP Manager • Public status dashboard"
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });
  }
};
