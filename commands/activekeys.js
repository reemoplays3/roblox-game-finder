const { createPaginatedKeyListCommand, formatDuration } = require("./lib/keyListEmbed");

module.exports = createPaginatedKeyListCommand({
  commandName: "activekeys",
  description: "Shows only active (currently running) keys, 3 per page",
  categoryLabel: "Active",
  icon: "🟢",
  color: 0x2ecc71,
  filterFn: (key, now) =>
    key.redeemed === true && key.paused !== true && Number(key.expiresAt) > now,
  timeLabel: "⏱️ Time Left",
  timeValueFn: (key, now) =>
    formatDuration(Math.floor((Number(key.expiresAt) - now) / 1000))
});