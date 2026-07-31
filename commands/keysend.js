const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { readKeys } = require("./lib/keyStore");

function formatDuration(minutes) {
  const hours = Number(minutes) / 60;
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} hour${rounded === 1 ? "" : "s"}`;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("keysend")
    .setDescription("DMs an existing key to a Discord user")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("The key to send")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The Discord user to send the key to")
        .setRequired(true)
    ),

  async execute(interaction) {
    const enteredKey = interaction.options
      .getString("key", true)
      .trim()
      .toUpperCase();

    const targetUser = interaction.options.getUser("user", true);

    const database = readKeys();
    const foundKey = database.keys.find(
      item => item.key === enteredKey
    );

    if (!foundKey) {
      return interaction.reply({
        content: "That key was not found.",
        ephemeral: true
      });
    }

    if (foundKey.revoked) {
      return interaction.reply({
        content: "That key has been revoked and can't be sent.",
        ephemeral: true
      });
    }

    if (foundKey.redeemed) {
      return interaction.reply({
        content: "That key has already been redeemed and can't be sent.",
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x1fb8f0)
      .setDescription(
        `👋 Hello!\n\n` +
          `Here is your **${formatDuration(foundKey.minutes)}** key:\n` +
          `\`${foundKey.key}\`\n\n` +
          `1. Join the game https://discord.com/channels/1530340937451180162/1530351666245931078\n` +
          `2. Click the C button (Top Left)\n` +
          `3. Enter your key and redeem!`
      );

    try {
      await targetUser.send({ embeds: [embed] });
    } catch (error) {
      console.error(
        `Could not DM key to ${targetUser.id}:`,
        error
      );

      return interaction.reply({
        content:
          `Could not DM <@${targetUser.id}> — they may have their ` +
          `DMs turned off. The key was NOT sent.`,
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `✅ Sent the key to <@${targetUser.id}> via DM.`,
      ephemeral: true
    });
  }
};