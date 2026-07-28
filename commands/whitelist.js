const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder
} = require("discord.js");

const usersPath = path.join(process.cwd(), "data", "users.json");

function readUsers() {
  try {
    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    if (!Array.isArray(users.whitelisted)) {
      users.whitelisted = [];
    }

    if (!Array.isArray(users.blacklisted)) {
      users.blacklisted = [];
    }

    return users;
  } catch (error) {
    return {
      whitelisted: [],
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
    JSON.stringify(users, null, 2)
  );
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription(
      "Give a Roblox user access to the Rejoin button."
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
      users.whitelisted.includes(robloxUserId)
    ) {
      return interaction.reply({
        content:
          `Roblox user ID \`${robloxUserId}\` is already permanently whitelisted.`,
        ephemeral: true
      });
    }

    users.blacklisted =
      users.blacklisted.filter(
        userId => userId !== robloxUserId
      );

    users.whitelisted.push(robloxUserId);

    writeUsers(users);

    return interaction.reply({
      content:
        `Roblox user ID \`${robloxUserId}\` has been permanently whitelisted.`,
      ephemeral: true
    });
  }
};