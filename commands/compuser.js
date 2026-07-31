const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("compuser")
    .setDescription("Add bonus time to one Roblox user's active or paused key")
    .addStringOption(option =>
      option
        .setName("roblox_user_id")
        .setDescription("The numeric Roblox user ID")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("How many minutes to add")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const robloxUserId = interaction.options
      .getString("roblox_user_id", true)
      .trim();

    const minutes = interaction.options.getInteger("minutes", true);

    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({
        content: "⚠️ Please enter a valid numeric Roblox user ID.",
        ephemeral: true
      });
    }

    const addMs = minutes * 60 * 1000;
    const addSeconds = minutes * 60;

    const database = readKeys();
    const now = Date.now();
    let updatedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
        continue;
      }

      if (String(item.redeemedBy || "") !== robloxUserId) {
        continue;
      }

      if (item.paused === true && Number(item.pausedRemainingSeconds) > 0) {
        item.pausedRemainingSeconds =
          Number(item.pausedRemainingSeconds) + addSeconds;
        updatedCount++;
      } else if (item.paused !== true && Number(item.expiresAt) > now) {
        item.expiresAt = Number(item.expiresAt) + addMs;
        updatedCount++;
      }
    }

    if (updatedCount === 0) {
      return interaction.reply({
        content: `⚠️ Roblox user ID \`${robloxUserId}\` does not have an active or paused key right now.`,
        ephemeral: true
      });
    }

    writeKeys(database);

    await interaction.reply({
      ephemeral: true,
      content: `🎁 Added ${minutes} minute(s) to \`${robloxUserId}\`'s key.`
    });
  }
};