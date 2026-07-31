require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

const BUYER_ROLE_NAME = "Buyer";

// Gives the Discord "Buyer" role to a Discord user. Used both by the
// instant-grant path (redeeming a key that /keysend linked to someone)
// and by the Accept button on staff-approval requests below.
async function grantBuyerRole(discordUserId) {
  if (!discordUserId) {
    return { success: false, message: "No Discord ID provided." };
  }

  if (!client.isReady()) {
    return { success: false, message: "The bot isn't ready yet. Try again in a moment." };
  }

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    let member;
    try {
      member = await guild.members.fetch(discordUserId);
    } catch (_fetchError) {
      return {
        success: false,
        message: "That Discord ID couldn't be found in the server."
      };
    }

    const role = guild.roles.cache.find(r => r.name === BUYER_ROLE_NAME);

    if (!role) {
      console.warn(`Could not find a role named "${BUYER_ROLE_NAME}" in the server.`);
      return { success: false, message: `The "${BUYER_ROLE_NAME}" role isn't set up yet.` };
    }

    if (member.roles.cache.has(role.id)) {
      return { success: true, message: "Already had the Buyer role." };
    }

    await member.roles.add(role);
    console.log(`Granted Buyer role to Discord user ${discordUserId}`);
    return { success: true, message: "Buyer role granted!" };
  } catch (error) {
    console.error(`Could not grant Buyer role to ${discordUserId}:`, error);
    return { success: false, message: "Something went wrong granting the role." };
  }
}

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    console.log(`Loaded command: ${command.data.name}`);
  } else {
    console.log(`Warning: ${file} is missing data or execute.`);
  }
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith("buyerrole_")) {
    const [, action, discordUserId] = interaction.customId.split("_");

    await interaction.deferUpdate();

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = originalEmbed
      ? EmbedBuilder.from(originalEmbed)
      : new EmbedBuilder();

    if (action === "accept") {
      const result = await grantBuyerRole(discordUserId);

      updatedEmbed
        .setColor(result.success ? 0x57f287 : 0xed4245)
        .addFields({
          name: result.success ? "✅ Accepted" : "⚠️ Accept Failed",
          value: `${result.message} — by <@${interaction.user.id}>`
        });
    } else if (action === "decline") {
      updatedEmbed
        .setColor(0xed4245)
        .addFields({
          name: "❌ Declined",
          value: `Declined by <@${interaction.user.id}>`
        });
    } else {
      return;
    }

    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: []
    });

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(
    interaction.commandName
  );

  if (!command) {
    console.log(`No command found for ${interaction.commandName}`);
    return;
  }

  try {
  if (
    command.ownerOnly &&
    interaction.user.id !== process.env.OWNER_ID
  ) {
    await interaction.reply({
      content: "You are not allowed to use this command.",
      ephemeral: true
    });

    return;
  }

  await command.execute(interaction);
} catch (error) {
    console.error(error);

    const errorMessage = {
      content: "There was an error while running this command.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Exported so server.js (which requires this file to start the bot) can
// also use the same live client instance and the shared grantBuyerRole
// helper — e.g. to grant Discord roles when a key gets redeemed in-game.
module.exports = { client, grantBuyerRole };