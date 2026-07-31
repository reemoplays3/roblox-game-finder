const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Every command reads/writes this exact path now — process.cwd() is the
// same convention users.json already uses, so both files live together
// under <project root>/data/ no matter which command file requires this.
const keysPath = path.join(process.cwd(), "data", "keys.json");

// Removes keys that no longer need to exist:
//   - anything flagged revoked (shouldn't normally linger now that
//     revoke commands delete immediately, but this cleans up any old
//     data from before that change)
//   - keys that were redeemed, are NOT currently paused, and whose time
//     has fully run out — a used-up key has nothing left to show for
//     itself, so it's removed rather than sitting around as "Expired"
//   - "broken" paused entries: paused === true but with no redeemedBy.
//     Pausing only ever makes sense for a key someone actually redeemed,
//     so a paused key with nobody attached to it is leftover/bad test
//     data, not a real key — there's no timer to ever resume for it.
// Real paused keys (paused === true with a redeemedBy) are never
// touched — their expiresAt is null while paused, so they never match
// "fully expired" either.
// Returns true if anything was actually removed.
function pruneKeys(database) {
  const now = Date.now();
  const before = database.keys.length;

  database.keys = database.keys.filter(item => {
    if (item.revoked === true) {
      return false;
    }

    const isBrokenPause =
      item.paused === true && !item.redeemedBy;

    if (isBrokenPause) {
      return false;
    }

    const isFullyExpired =
      item.redeemed === true &&
      item.paused !== true &&
      Number(item.expiresAt) > 0 &&
      Number(item.expiresAt) <= now;

    return !isFullyExpired;
  });

  return database.keys.length !== before;
}

function readKeys() {
  try {
    const database = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    if (!Array.isArray(database.keys)) {
      database.keys = [];
    }

    if (pruneKeys(database)) {
      writeKeys(database);
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
// "pausedLocked" marks a key paused by the admin /pause command — the
// live website's /resume-time route checks this and refuses to let the
// player self-resume until an admin clears it with /resumekeys.
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
    pausedLocked: false,

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