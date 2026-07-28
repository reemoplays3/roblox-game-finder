const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SlashCommandBuilder } = require("discord.js");

const keysPath = path.join(process.cwd(), "data", "keys.json");

function readKeysDatabase() {
  try {
    const database = JSON.parse(fs.readFileSync(keysPath, "utf8"));

    if (!Array.isArray(database.keys)) {
      database.keys = [];
    }

    return database;
  } catch (_error) {
    return { keys: [] };
  }
}

function writeKeysDatabase(database) {
  fs.mkdirSync(path.dirname(keysPath), { recursive: true });
  fs.writeFileSync(
    keysPath,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

function createKey() {
  return crypto.randomBytes(9).toString("hex").toUpperCase();
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("generatekeys")
    .setDescription("Generate multiple Roblox access keys.")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("How many keys to create (1-25).")
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes each key lasts after redemption.")
        .setMinValue(1)
        .setMaxValue(525600)
        .setRequired(true)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const minutes = interaction.options.getInteger("minutes", true);

    const database = readKeysDatabase();
    const existingKeys = new Set(
      database.keys.map(item => String(item.key || "").toUpperCase())
    );

    const generatedKeys = [];
    const createdAt = Date.now();

    while (generatedKeys.length < amount) {
      const key = createKey();

      if (existingKeys.has(key)) {
        continue;
      }

      existingKeys.add(key);
      generatedKeys.push(key);

      database.keys.push({
        key,
        minutes,
        created: createdAt,
        paused: false,
        revoked: false,
        redeemed: false,
        redeemedBy: null,
        redeemedAt: null,
        expiresAt: null
      });
    }

    writeKeysDatabase(database);

    const keyList = generatedKeys.join("\n");
    const durationText =
      minutes === 1 ? "1 minute" : `${minutes} minutes`;

    return interaction.reply({
    content:
        `🔑 **Generated ${amount} key${amount === 1 ? "" : "s"}**\n` +
        `⏰ **Duration:** ${durationText}\n\n` +
        `\`\`\`\n${keyList}\n\`\`\``
});
  }
};
