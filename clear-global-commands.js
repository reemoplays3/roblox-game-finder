require("dotenv").config();

const { REST, Routes } = require("discord.js");

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function clearGlobalCommands() {
  try {
    console.log("Removing old global commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      {
        body: []
      }
    );

    console.log("Old global commands removed.");
  } catch (error) {
    console.error(error);
  }
}

clearGlobalCommands();