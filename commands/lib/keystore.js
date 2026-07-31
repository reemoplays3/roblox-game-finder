const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Every command reads/writes this exact path now — process.cwd() is the
// same convention users.json already uses, so both files live together
// under <project root>/data/ no matter which command file requires this.
const keysPath = path.join(process.cwd(), "data", "keys.json");

function readKeys() {
  try {
    const database = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    if (!Array.isArray(database.keys)) {
      database.keys = [];
    }
    return database;
  } catch (_error) {
    return { keys: [] };
  }
}

function writeKeys(database) {
  fs.mkdirSync(path.dirname(keysPath), { recursive: true });
  fs.writeFileSync(keysPath, JSON.stringify(database, null, 2), "utf8");
}

function makeKeyString() {
  return crypto.randomBytes(9).toString("hex").toUpperCase();
}

// The one canonical shape for a key entry. Field names here MUST match
// what server.js's /redeem, /pause-time, /resume-time, /validate, and
// /user-status routes actually read and write — in particular
// "pausedRemainingSeconds" (seconds), not "remainingMs" (milliseconds).
// Using the wrong name here means the Discord commands and the live
// website silently stop agreeing on whether a key is paused.
function makeKeyEntry(minutes) {
  return {
    key: makeKeyString(),
    minutes,
    created: Date.now(),

    redeemed: false,
    redeemedAt: null,
    redeemedBy: null,
    expiresAt: null,

    paused: false,
    pausedAt: null,
    pausedRemainingSeconds: null,

    revoked: false,
    revokedAt: null
  };
}

module.exports = {
  keysPath,
  readKeys,
  writeKeys,
  makeKeyString,
  makeKeyEntry
};