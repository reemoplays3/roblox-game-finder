const { createPaginatedKeyListCommand } = require("./lib/keyListEmbed");

module.exports = createPaginatedKeyListCommand({
  commandName: "unusedkeys",
  description: "Shows only unused (unredeemed) keys, 3 per page",
  categoryLabel: "Unused",
  icon: "🟡",
  color: 0x95a5a6,
  filterFn: key => key.redeemed !== true,
  timeLabel: "⏱️ Duration",
  timeValueFn: key => `${Number(key.minutes) || 0}m after redemption`
});