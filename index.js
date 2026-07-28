require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.commands = new Collection();

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