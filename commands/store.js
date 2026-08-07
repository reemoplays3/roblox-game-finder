const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const STORE_TITLE = "Sweet TP — Purchase Access";
const STORE_DESCRIPTION = "**Instant delivery. Pay with crypto or card.**";
const STORE_URL = "https://sweettp.mykomerza.com/";
const FOOTER_TEXT = "All prices in USD · your key arrives right after checkout";
const COUPON_CODE = "SAVE50";
const COUPON_DISCOUNT_TEXT = "50% off · unlimited uses";

const TIERS = [
  { label: "1 Hour", price: "$7.99" },
  { label: "6 Hours", price: "$44.99" },
  { label: "12 Hours", price: "$74.99" },
  { label: "1 Day", price: "$109.99" },
  { label: "1 Week", price: "$249.99" },
  { label: "Lifetime", price: "$899.99" }
];

const ACCEPTED_PAYMENTS = "💵 Cash App    🟠 Bitcoin    🪙 Litecoin    💳 Card";

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("store")
    .setDescription("Posts the Sweet TP pricing/store embed"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xf0c419)
      .setTitle(STORE_TITLE)
      .setDescription(STORE_DESCRIPTION)
      .setFooter({ text: FOOTER_TEXT });

    for (const tier of TIERS) {
      embed.addFields({
        name: tier.label,
        value: `**${tier.price}**`,
        inline: true
      });
    }

    embed.addFields(
      {
        name: "Accepted",
        value: `**${ACCEPTED_PAYMENTS}**`,
        inline: false
      },
      {
        name: "🏷️ Coupon Code",
        value: `**\`${COUPON_CODE}\` — ${COUPON_DISCOUNT_TEXT}**`,
        inline: false
      }
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🖥️ Purchase Access")
        .setStyle(ButtonStyle.Link)
        .setURL(STORE_URL)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};