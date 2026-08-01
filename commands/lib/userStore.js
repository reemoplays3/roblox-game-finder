const fs = require("fs");
const path = require("path");

const usersPath = path.join(process.cwd(), "data", "users.json");

function normalizeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(String)));
}

// Reads data/users.json and always returns a well-formed object, even if
// the file is missing or corrupt. "whitelisted" is a legacy field name from
// an older schema — anyone in it is treated as allowed to redeem keys
// (redeemAllowed), same as everywhere else this merge happens.
//
// "neutral" is a separate override list: a Roblox user in it is treated as
// having NO redemption history for rejoin-button purposes, even if they
// actually redeemed a key before. This is what /neutral uses to reset
// someone back to a plain, no-special-status state.
//
// "everRedeemed" is the PERMANENT record of who has ever redeemed a key.
// Unlike keys.json (which gets cleaned up over time), entries here are
// never removed automatically — server.js adds someone to it the moment
// they first redeem, so rejoin eligibility survives key cleanup.
function readUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const legacyRedeemAllowed = normalizeIds(raw.whitelisted);

    return {
      redeemAllowed: Array.from(
        new Set([
          ...normalizeIds(raw.redeemAllowed),
          ...legacyRedeemAllowed
        ])
      ),
      permanent: normalizeIds(raw.permanent),
      blacklisted: normalizeIds(raw.blacklisted),
      neutral: normalizeIds(raw.neutral),
      everRedeemed: normalizeIds(raw.everRedeemed)
    };
  } catch (_error) {
    return {
      redeemAllowed: [],
      permanent: [],
      blacklisted: [],
      neutral: [],
      everRedeemed: []
    };
  }
}

// Always normalizes before writing, so a bad in-memory value can never
// corrupt the file on disk. Every known field is written back out here —
// if a field were left out, any command calling this would silently wipe
// it from the file.
function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });

  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      {
        redeemAllowed: normalizeIds(users.redeemAllowed),
        permanent: normalizeIds(users.permanent),
        blacklisted: normalizeIds(users.blacklisted),
        neutral: normalizeIds(users.neutral),
        everRedeemed: normalizeIds(users.everRedeemed)
      },
      null,
      2
    ),
    "utf8"
  );
}

function removeId(list, robloxUserId) {
  return list.filter(value => value !== robloxUserId);
}

module.exports = {
  usersPath,
  normalizeIds,
  readUsers,
  writeUsers,
  removeId
};