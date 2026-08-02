const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys, takeArchivedKey } = require("./lib/keyStore");

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("restorekey")
    .setDescription("Restores a previously revoked key, including its exact remaining time")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("The key to restore")
        .setRequired(true)
    ),

  async execute(interaction) {
    const enteredKey = interaction.options
      .getString("key", true)
      .trim()
      .toUpperCase();

    const database = readKeys();

    if (database.keys.some(item => item.key === enteredKey)) {
      return interaction.reply({
        content: "⚠️ That key already exists in the system — nothing to restore.",
        ephemeral: true
      });
    }

    const archived = takeArchivedKey(enteredKey);

    if (!archived) {
      return interaction.reply({
        content: "⚠️ No revoked record found for that key.",
        ephemeral: true
      });
    }

    const now = Date.now();

    // Rebuild the key exactly as it was, EXCEPT the timer is recalculated
    // fresh from right now using the saved remaining-time amount — not a
    // frozen old expiry, which would otherwise show LESS time than they
    // actually had (since real time kept passing while it sat revoked).
    const restoredEntry = {
      key: archived.key,
      minutes: archived.minutes,
      created: now,

      redeemed: archived.redeemed,
      redeemedAt: archived.redeemedAt,
      redeemedBy: archived.redeemedBy,
      expiresAt: null,

      paused: false,
      pausedAt: null,
      pausedRemainingSeconds: null,
      pausedLocked: archived.pausedLocked,
      pausedByAdmin: false,

      discordUserId: archived.discordUserId,

      revoked: false,
      revokedAt: null
    };

    let messageDetail;

    if (!archived.redeemed) {
      messageDetail = `it's unused, worth ${archived.minutes} minute(s) after redemption`;
    } else if (archived.wasPaused) {
      restoredEntry.paused = true;
      restoredEntry.pausedAt = now;
      restoredEntry.pausedRemainingSeconds = archived.remainingSeconds;

      const minutes = Math.round(archived.remainingSeconds / 60);
      messageDetail =
        `${minutes} minute(s) banked (paused)` +
        (archived.pausedLocked ? ", still locked" : "");
    } else {
      restoredEntry.expiresAt = now + archived.remainingSeconds * 1000;

      const minutes = Math.round(archived.remainingSeconds / 60);
      messageDetail = `${minutes} minute(s) remaining, running again from now`;
    }

    database.keys.push(restoredEntry);
    writeKeys(database);

    await interaction.reply({
      content: `✅ Key \`${restoredEntry.key}\` was restored — ${messageDetail}.`
    });
  }
};