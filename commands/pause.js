const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription(
      "Pauses and locks every active/paused key so players cannot resume their own time"
    ),

  async execute(interaction) {
    const database = readKeys();
    const now = Date.now();
    let lockedCount = 0;

    for (const item of database.keys) {
      if (item.redeemed !== true || item.revoked === true) {
        continue;
      }

      const isCurrentlyActive =
        item.paused !== true && Number(item.expiresAt) > now;

      const isAlreadyPaused = item.paused === true;

      if (isCurrentlyActive) {
        const remainingSeconds = Math.floor(
          (Number(item.expiresAt) - now) / 1000
        );

        item.pausedRemainingSeconds = remainingSeconds;
        item.paused = true;
        item.pausedAt = now;
        item.expiresAt = null;
        item.pausedLocked = true;
        item.pausedByAdmin = true;
        lockedCount++;
      } else if (isAlreadyPaused) {
        // Already paused by the player before this command ran — just
        // lock it in place. Deliberately NOT setting pausedByAdmin here,
        // so /resume knows this one wasn't force-paused and should stay
        // paused (just unlocked) instead of being forced back to running.
        item.pausedLocked = true;
        lockedCount++;
      }
    }

    if (lockedCount > 0) {
      writeKeys(database);
    }

    await interaction.reply({
      ephemeral: true,
      content:
        lockedCount === 0
          ? "🛑 No active or paused keys were found to lock."
          : `🛑 ${lockedCount} key(s) were paused and locked.`
    });
  }
};