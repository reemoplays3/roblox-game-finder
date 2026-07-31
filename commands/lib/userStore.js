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
      blacklisted: normalizeIds(raw.blacklisted)
    };
  } catch (_error) {
    return { redeemAllowed: [], permanent: [], blacklisted: [] };
  }
}

// Always normalizes before writing, so a bad in-memory value can never
// corrupt the file on disk.
function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });

  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      {
        redeemAllowed: normalizeIds(users.redeemAllowed),
        permanent: normalizeIds(users.permanent),
        blacklisted: normalizeIds(users.blacklisted)
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