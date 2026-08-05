const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys, archiveRevokedKey } = require("./lib/keyStore");

const REDEEM_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1534255329230065704/I_WByyZTcmnqjISjxKB61BwaInwokLNXpuTmIPqfufsJGotQhLtFyA1zUgtWh7sfND--";

async function postRevokeLog(discordUsername, keyCode) {
  try {
    await fetch(REDEEM_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🗑️ Key Revoked",
            color: 0xed4245,
            fields: [
              { name: "🔑 Key", value: `\`${keyCode}\``, inline: true },
              { name: "👮 Revoked By", value: discordUsername, inline: true }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      })
    });
  } catch (error) {
    console.error("Could not post revoke log:", error);
  }
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Revokes a key (can be undone later with /restorekey)")
    .addStringOption(option =>
      option
        .setName("key")
        .setDescription("The key you want to revoke")
        .setRequired(true)
    ),

  async execute(interaction) {
    const enteredKey = interaction.options
      .getString("key")
      .trim()
      .toUpperCase();

    const database = readKeys();

    const index = database.keys.findIndex(
      item => item.key === enteredKey
    );

    if (index === -1) {
      return interaction.reply({
        content: "⚠️ That key was not found.",
        ephemeral: true
      });
    }

    const [removedKey] = database.keys.splice(index, 1);
    archiveRevokedKey(removedKey);
    writeKeys(database);

    postRevokeLog(interaction.user.tag, removedKey.key);

    await interaction.reply({
      content: `🗑️ Key \`${removedKey.key}\` was revoked. Use \`/restorekey\` to undo this.`
    });
  }
};