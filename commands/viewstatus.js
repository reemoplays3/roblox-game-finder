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

  /*
   * Supports both the newest and older Sweet TP formats:
   *
   * New:
   *   redeemAllowed
   *   permanent
   *   blacklisted
   *
   * Older:
   *   whitelisted
   *   blacklisted
   *
   * Anyone who has redeemed a key before is also included
   * in the Whitelisted section.
   */
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

    /*
     * Some older versions used "whitelisted" to mean
     * permanent access. Keep compatibility only when
     * a separate permanent array does not exist.
     */
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

  if (userIds.length === 0) {
    return profiles;
  }

  for (let index = 0; index < userIds.length; index += 100) {
    const batch = userIds
      .slice(index, index + 100)
      .map(Number);

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
          `Roblox users API returned ${response.status}`
        );
      }

      const body = await response.json();

      for (const profile of body.data || []) {
        profiles.set(String(profile.id), {
          id: String(profile.id),
          username:
            profile.name || `User ${profile.id}`,
          displayName:
            profile.displayName || profile.name,
          description:
            profile.description || "",
          hasVerifiedBadge:
            profile.hasVerifiedBadge === true
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

async function fetchRobloxThumbnails(userIds) {
  const thumbnails = new Map();

  for (let index = 0; index < userIds.length; index += 100) {
    const batch = userIds.slice(index, index + 100);

    if (batch.length === 0) {
      continue;
    }

    const url =
      "https://thumbnails.roblox.com/v1/users/avatar-headshot" +
      `?userIds=${encodeURIComponent(batch.join(","))}` +
      "&size=150x150" +
      "&format=Png" +
      "&isCircular=true";

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Roblox thumbnails API returned ${response.status}`
        );
      }

      const body = await response.json();

      for (const thumbnail of body.data || []) {
        if (thumbnail.imageUrl) {
          thumbnails.set(
            String(thumbnail.targetId),
            thumbnail.imageUrl
          );
        }
      }
    } catch (error) {
      console.error(
        "Could not fetch Roblox thumbnails:",
        error
      );
    }
  }

  return thumbnails;
}

function createProfileEmbed({
  userId,
  profile,
  thumbnail,
  category,
  categoryColor
}) {
  const username =
    profile?.username || `Unknown User`;

  const displayName =
    profile?.displayName || username;

  const profileUrl =
    `https://www.roblox.com/users/${userId}/profile`;

  const embed = new EmbedBuilder()
    .setColor(categoryColor)
    .setAuthor({
      name: category
    })
    .setTitle(
      displayName === username
        ? username
        : `${displayName} (@${username})`
    )
    .setURL(profileUrl)
    .addFields(
      {
        name: "Roblox Username",
        value: `\`${username}\``,
        inline: true
      },
      {
        name: "Roblox User ID",
        value: `\`${userId}\``,
        inline: true
      },
      {
        name: "Profile",
        value: `[Open Roblox Profile](${profileUrl})`,
        inline: false
      }
    );

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  if (profile?.hasVerifiedBadge) {
    embed.setFooter({
      text: "Roblox verified account"
    });
  }

  return embed;
}

async function sendCategory({
  interaction,
  category,
  userIds,
  profiles,
  thumbnails,
  color
}) {
  if (userIds.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(category)
      .setDescription(
        `No users are currently listed as ${category.toLowerCase()}.`
      );

    await interaction.followUp({
      embeds: [emptyEmbed],
      ephemeral: true
    });

    return;
  }

  const embeds = userIds.map(userId =>
    createProfileEmbed({
      userId,
      profile: profiles.get(userId),
      thumbnail: thumbnails.get(userId),
      category,
      categoryColor: color
    })
  );

  /*
   * Discord allows up to 10 embeds per message.
   */
  for (let index = 0; index < embeds.length; index += 10) {
    const batch = embeds.slice(index, index + 10);

    await interaction.followUp({
      content:
        index === 0
          ? `**${category} — ${userIds.length} user${userIds.length === 1 ? "" : "s"}**`
          : undefined,
      embeds: batch,
      ephemeral: true
    });
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("viewstatus")
    .setDescription(
      "View whitelisted, blacklisted, and permanent Roblox users."
    ),

  async execute(interaction) {
    await interaction.deferReply({
      ephemeral: true
    });

    const status = readStatusDatabase();

    const allUserIds = normalizeIds([
      ...status.whitelisted,
      ...status.blacklisted,
      ...status.permanent
    ]);

    const [profiles, thumbnails] =
      await Promise.all([
        fetchRobloxProfiles(allUserIds),
        fetchRobloxThumbnails(allUserIds)
      ]);

    const summaryEmbed = new EmbedBuilder()
      .setColor(0x1FB8F0)
      .setTitle("Sweet TP User Status")
      .setDescription(
        "Roblox access records currently saved by the bot."
      )
      .addFields(
        {
          name: "Whitelisted",
          value: String(status.whitelisted.length),
          inline: true
        },
        {
          name: "Blacklisted",
          value: String(status.blacklisted.length),
          inline: true
        },
        {
          name: "Permanent Access",
          value: String(status.permanent.length),
          inline: true
        }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [summaryEmbed]
    });

    await sendCategory({
      interaction,
      category: "Whitelisted",
      userIds: status.whitelisted,
      profiles,
      thumbnails,
      color: 0x1FB8F0
    });

    await sendCategory({
      interaction,
      category: "Blacklisted",
      userIds: status.blacklisted,
      profiles,
      thumbnails,
      color: 0xEE2D37
    });

    await sendCategory({
      interaction,
      category: "Permanent Access",
      userIds: status.permanent,
      profiles,
      thumbnails,
      color: 0x64FF78
    });
  }
};
