const fs = require("fs");
const path = require("path");

const usersPath = path.join(process.cwd(), "data", "users.json");

function normalizeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(String)));
}

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
      lifetime: normalizeIds(raw.lifetime),
      blacklisted: normalizeIds(raw.blacklisted),
      neutral: normalizeIds(raw.neutral),
      everRedeemed: normalizeIds(raw.everRedeemed),
      banned: normalizeIds(raw.banned)
    };
  } catch (_error) {
    return {
      redeemAllowed: [],
      permanent: [],
      lifetime: [],
      blacklisted: [],
      neutral: [],
      everRedeemed: [],
      banned: []
    };
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });

  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      {
        {
        redeemAllowed: normalizeIds(users.redeemAllowed),
        permanent: normalizeIds(users.permanent),
        lifetime: normalizeIds(users.lifetime),
        blacklisted: normalizeIds(users.blacklisted),
        neutral: normalizeIds(users.neutral),
        everRedeemed: normalizeIds(users.everRedeemed),
        banned: normalizeIds(users.banned)
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