const fs = require("fs");
const path = require("path");

const usersPath = path.join(
  process.cwd(),
  "data",
  "users.json"
);

function normalizeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map(String))
  );
}

function readUsers() {
  try {
    const raw = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    const legacyRedeemAllowed =
      normalizeIds(raw.whitelisted);

    return {
      redeemAllowed: Array.from(
        new Set([
          ...normalizeIds(raw.redeemAllowed),
          ...legacyRedeemAllowed
        ])
      ),

      permanent:
        normalizeIds(raw.permanent),

      blacklisted:
        normalizeIds(raw.blacklisted)
    };
  } catch (_error) {
    return {
      redeemAllowed: [],
      permanent: [],
      blacklisted: []
    };
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), {
    recursive: true
  });

  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      {
        redeemAllowed:
          normalizeIds(users.redeemAllowed),

        permanent:
          normalizeIds(users.permanent),

        blacklisted:
          normalizeIds(users.blacklisted)
      },
      null,
      2
    ),
    "utf8"
  );
}

function removeId(list, robloxUserId) {
  return list.filter(
    value => value !== robloxUserId
  );
}

const {
  SlashCommandBuilder
} = require("discord.js");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription(
      "Allow a Roblox user to redeem keys."
    )
    .addStringOption(option =>
      option
        .setName("roblox_user_id")
        .setDescription(
          "The numeric Roblox user ID."
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    const robloxUserId = interaction.options
      .getString("roblox_user_id")
      .trim();

    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({
        content:
          "Please enter a valid numeric Roblox user ID.",
        ephemeral: true
      });
    }

    const users = readUsers();

    if (
      users.redeemAllowed.includes(
        robloxUserId
      )
    ) {
      return interaction.reply({
        content:
          `Roblox user ID \`${robloxUserId}\` is already allowed to redeem keys.`,
        ephemeral: true
      });
    }

    users.blacklisted = removeId(
      users.blacklisted,
      robloxUserId
    );

    users.redeemAllowed.push(
      robloxUserId
    );

    writeUsers(users);

    return interaction.reply({
      content:
        `Roblox user ID \`${robloxUserId}\` can now redeem keys and use timed panel access.`,
      ephemeral: true
    });
  }
};
