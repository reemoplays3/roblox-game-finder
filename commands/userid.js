const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userid")
        .setDescription("Get a Roblox user's User ID.")
        .addStringOption(option =>
            option
                .setName("username")
                .setDescription("The Roblox username")
                .setRequired(true)
        ),

    async execute(interaction) {
        const username = interaction.options.getString("username");

        try {
            const response = await fetch(
                "https://users.roblox.com/v1/usernames/users",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        usernames: [username],
                        excludeBannedUsers: false
                    })
                }
            );

            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                return interaction.reply({
    content: "❌ Roblox user not found."
});
            }

            const user = data.data[0];

            const embed = new EmbedBuilder()
                .setColor(0x2B9DFF)
                .setTitle("Roblox User Found")
                .addFields(
                    {
                        name: "Username",
                        value: user.name,
                        inline: true
                    },
                    {
                        name: "Display Name",
                        value: user.displayName,
                        inline: true
                    },
                    {
                        name: "User ID",
                        value: `\`${user.id}\``,
                        inline: false
                    }
                )
                .setURL(`https://www.roblox.com/users/${user.id}/profile`)
                .setFooter({
                    text: "Sweet TP Manager"
                });

            await interaction.reply({
                embeds: [embed]
            });

        } catch (err) {
            console.error(err);

            await interaction.reply({
    content: "❌ Failed to contact Roblox."
});
        }
    }
};