const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const STORE_TITLE = "Sweet TP";
const STORE_URL = "https://sweettp.mykomerza.com/";
const BASE_RATE_TEXT = "Base rate is **$7.99 an hour**. Every bundle below beats it.";
const FOOTER_TEXT = "All prices in USD · your key arrives right after checkout";
const COUPON_CODE = "SAVE75";
const COUPON_DISCOUNT_TEXT = "75% off · unlimited uses";

const TIERS = [
  { emoji: "⏱️", label: "1 Hour", price: "$7.99" },
  { emoji: "🕐", label: "6 Hours", price: "$44.99" },
  { emoji: "🕛", label: "12 Hours", price: "$74.99" },
  { emoji: "📅", label: "1 Day", price: "$109.99" },
  { emoji: "📆", label: "1 Week", price: "$249.99" },
  { emoji: "♾️", label: "Lifetime", price: "$899.99", note: "never expires" }
];

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("store")
    .setDescription("Posts the Sweet TP pricing/store embed"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xf0c419)
      .setTitle(`🟡 ${STORE_TITLE}`)
      .setDescription(`**Pricing**\n${BASE_RATE_TEXT}`)
      .setFooter({ text: FOOTER_TEXT });

    for (const tier of TIERS) {
      embed.addFields({
        name: `${tier.emoji} ${tier.label}`,
        value: tier.note ? `${tier.price}\n${tier.note}` : tier.price,
        inline: true
      });
    }

    embed.addFields({
      name: "🏷️ Coupon Code",
      value: `\`${COUPON_CODE}\` — ${COUPON_DISCOUNT_TEXT}`,
      inline: false
    });

    const buttons = TIERS.map(tier =>
      new ButtonBuilder()
        .setLabel(tier.label)
        .setStyle(ButtonStyle.Link)
        .setURL(STORE_URL)
    );

    buttons.push(
      new ButtonBuilder()
        .setLabel("🛒 Open the Store")
        .setStyle(ButtonStyle.Link)
        .setURL(STORE_URL)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    await interaction.reply({
      embeds: [embed],
      components: rows
    });
  }
};