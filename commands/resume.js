const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Removes the /pause lock from every paused key (players still resume their own time in-game)"),

  async execute(interaction) {
    const database = readKeys();
    let unlockedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true || item.paused !== true) {
        continue;
      }

      if (item.pausedLocked === true) {
        // Deliberately NOT auto-starting their timer here. If someone
        // stepped away, force-resuming would burn their time while
        // they're not even around to notice. Unlocking just lets them
        // resume it themselves, in-game, whenever they're actually back.
        item.pausedLocked = false;
        item.pausedByAdmin = false;
        unlockedCount++;
      }
    }

    writeKeys(database);

    await interaction.reply({
      content:
        unlockedCount === 0
          ? "🔓 There were no locked keys to unlock."
          : `🔓 ${unlockedCount} key(s) unpaused.`
    });
  }
};