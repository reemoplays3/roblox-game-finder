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
    // True only when /pause force-paused a previously-ACTIVE key. Stays
    // false if the key was already paused by the player before /pause
    // ran — that distinction is what lets /resume tell the two apart.
    pausedByAdmin: false,

    // Set by /keysend when a key is delivered to a specific Discord
    // user. server.js's /redeem route uses this to grant the "Buyer"
    // role automatically once this exact key gets redeemed in-game.
    discordUserId: null,

    revoked: false,
    revokedAt: null
  };
}

// ===== REVOKED KEY ARCHIVE =====
// A small permanent log of exactly what a key looked like the instant
// before it got deleted by a revoke command. This is what /restorekey
// reads from — without it, revoking is a one-way door since revoke
// commands delete keys outright rather than just flagging them.
const revokedArchivePath = path.join(process.cwd(), "data", "revoked-keys.json");
const MAX_REVOKED_ARCHIVE_ENTRIES = 200;

function readRevokedArchive() {
  try {
    const data = JSON.parse(fs.readFileSync(revokedArchivePath, "utf8"));
    if (!Array.isArray(data.entries)) {
      return { entries: [] };
    }
    return data;
  } catch (_error) {
    return { entries: [] };
  }
}

function writeRevokedArchive(archive) {
  fs.mkdirSync(path.dirname(revokedArchivePath), { recursive: true });
  fs.writeFileSync(revokedArchivePath, JSON.stringify(archive, null, 2), "utf8");
}

// Snapshots a key right before it's deleted. Captures the ACTUAL amount
// of time left (in seconds) rather than a frozen timestamp — that's
// what lets a later restore give back the same duration counted fresh
// from the moment of restoration, instead of less time than they
// actually had (since real time keeps passing while it's revoked).
function archiveRevokedKey(keyEntry) {
  const now = Date.now();
  let remainingSeconds = 0;

  if (keyEntry.paused === true) {
    remainingSeconds = Number(keyEntry.pausedRemainingSeconds) || 0;
  } else if (keyEntry.redeemed === true && Number(keyEntry.expiresAt) > now) {
    remainingSeconds = Math.floor((Number(keyEntry.expiresAt) - now) / 1000);
  }

  const archive = readRevokedArchive();

  archive.entries.push({
    key: keyEntry.key,
    minutes: keyEntry.minutes,
    redeemed: keyEntry.redeemed === true,
    redeemedBy: keyEntry.redeemedBy || null,
    redeemedAt: keyEntry.redeemedAt || null,
    discordUserId: keyEntry.discordUserId || null,
    wasPaused: keyEntry.paused === true,
    pausedLocked: keyEntry.pausedLocked === true,
    remainingSeconds,
    revokedAt: now
  });

  if (archive.entries.length > MAX_REVOKED_ARCHIVE_ENTRIES) {
    archive.entries = archive.entries.slice(-MAX_REVOKED_ARCHIVE_ENTRIES);
  }

  writeRevokedArchive(archive);
}

// Finds the most recent archived entry for a key code, removes it from
// the archive (so it can't be restored twice), and returns it — or null
// if nothing matching was found.
function takeArchivedKey(keyCode) {
  const archive = readRevokedArchive();

  let foundIndex = -1;
  for (let i = archive.entries.length - 1; i >= 0; i--) {
    if (archive.entries[i].key === keyCode) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex === -1) {
    return null;
  }

  const [entry] = archive.entries.splice(foundIndex, 1);
  writeRevokedArchive(archive);
  return entry;
}

module.exports = {
  keysPath,
  readKeys,
  writeKeys,
  makeKeyString,
  makeKeyEntry,
  archiveRevokedKey,
  takeArchivedKey
};