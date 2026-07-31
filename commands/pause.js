const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
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
        // Same conversion the old /pausekeys did: bank the remaining
        // running time as paused seconds.
        const remainingSeconds = Math.floor(
          (Number(item.expiresAt) - now) / 1000
        );

        item.pausedRemainingSeconds = remainingSeconds;
        item.paused = true;
        item.pausedAt = now;
        item.expiresAt = null;
        item.pausedLocked = true;
        lockedCount++;
      } else if (isAlreadyPaused) {
        // Already paused — just lock it in place, don't touch the
        // saved time they already have banked.
        item.pausedLocked = true;
        lockedCount++;
      }
    }

    if (lockedCount > 0) {
      writeKeys(database);
    }

    const embed = new EmbedBuilder()
      .setTitle("Keys Paused & Locked")
      .setDescription(
        lockedCount === 0
          ? "There were no active or paused keys to lock."
          : `${lockedCount} key(s) were paused and locked. Players cannot resume their own time until an admin runs \`/resume\`.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};