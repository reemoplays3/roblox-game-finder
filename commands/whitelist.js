const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");

const usersPath = path.join(process.cwd(), "data", "users.json");

function normalizeIds(value) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String))) : [];
}

function readUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    return {
      redeemAllowed: normalizeIds(raw.redeemAllowed),
      permanent: normalizeIds(raw.permanent),
      blacklisted: normalizeIds(raw.blacklisted)
    };
  } catch (_error) {
    return { redeemAllowed: [], permanent: [], blacklisted: [] };
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Allow a Roblox user to redeem keys again.")
    .addStringOption(option => option
      .setName("roblox_user_id")
      .setDescription("The numeric Roblox user ID.")
      .setRequired(true)),

  async execute(interaction) {
    const robloxUserId = interaction.options.getString("roblox_user_id").trim();
    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({ content: "Please enter a valid numeric Roblox user ID.", ephemeral: true });
    }

    const users = readUsers();
    const wasBlacklisted = users.blacklisted.includes(robloxUserId);
    users.blacklisted = users.blacklisted.filter(id => id !== robloxUserId);
    writeUsers(users);

    return interaction.reply({
      content: wasBlacklisted
        ? `Roblox user ID \`${robloxUserId}\` can now redeem keys again.`
        : `Roblox user ID \`${robloxUserId}\` was already allowed to redeem keys.`,
      ephemeral: true
    });
  }
};
