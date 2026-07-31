const { createPaginatedKeyListCommand, formatDuration } = require("./lib/keyListEmbed");

module.exports = createPaginatedKeyListCommand({
  commandName: "pausedkeys",
  description: "Shows only paused keys, 3 per page",
  categoryLabel: "Paused",
  icon: "⏸️",
  color: 0xf1c40f,
  filterFn: key => key.paused === true,
  timeLabel: "⏱️ Time Saved",
  timeValueFn: key =>
    `${formatDuration(Number(key.pausedRemainingSeconds) || 0)}${key.pausedLocked ? " 🔒" : ""}`
});