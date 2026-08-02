const { SlashCommandBuilder } = require("discord.js");
const { readKeys, writeKeys, archiveRevokedKey } = require("./lib/keyStore");

const CATEGORY_LABELS = {
  active: "Active",
  paused: "Paused",
  unused: "Unused"
};

function matchesCategory(key, category, now) {
  if (category === "active") {
    return (
      key.redeemed === true &&
      key.paused !== true &&
      Number(key.expiresAt) > now
    );
  }

  if (category === "paused") {
    return key.paused === true;
  }

  if (category === "unused") {
    return key.redeemed !== true;
  }

  return false;
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revokes every key in one category (can be undone per-key with /restorekey)")
    .addStringOption(option =>
      option
        .setName("category")
        .setDescription("Which keys to revoke")
        .setRequired(true)
        .addChoices(
          { name: "Active", value: "active" },
          { name: "Paused", value: "paused" },
          { name: "Unused", value: "unused" }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString("category", true);
    const categoryLabel = CATEGORY_LABELS[category];

    const database = readKeys();
    const now = Date.now();

    const toRevoke = database.keys.filter(key => matchesCategory(key, category, now));

    for (const key of toRevoke) {
      archiveRevokedKey(key);
    }

    database.keys = database.keys.filter(key => !matchesCategory(key, category, now));
    const revokedCount = toRevoke.length;

    if (revokedCount > 0) {
      writeKeys(database);
    }

    await interaction.reply({
      content:
        revokedCount === 0
          ? `🗑️ There were no ${categoryLabel.toLowerCase()} keys to revoke.`
          : `🗑️ ${revokedCount} ${categoryLabel.toLowerCase()} key(s) were revoked. Each can be undone individually with \`/restorekey\`.`
    });
  }
};