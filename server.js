const { client: discordClient, grantBuyerRole } = require("./index.js");
require("./deploy-commands.js");

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const keysPath = path.join(process.cwd(), "data", "keys.json");

// Was previously path.join(__dirname, "data", "users.json") — different
// method than keysPath used. They currently resolve to the same folder,
// but keeping both paths built the same way avoids that ever silently
// drifting apart if the start command or folder layout changes.
const usersPath = path.join(process.cwd(), "data", "users.json");

// A small, permanent log of redemption events — separate from keys.json
// because merged keys get deleted from there once their time is folded
// into another key. Capped so it can't grow forever.
const redemptionsPath = path.join(process.cwd(), "data", "redemptions.json");
const MAX_REDEMPTION_LOG_ENTRIES = 200;

function readRedemptionLog() {
  try {
    const data = JSON.parse(fs.readFileSync(redemptionsPath, "utf8"));
    if (!Array.isArray(data.entries)) {
      return { entries: [] };
    }
    return data;
  } catch (_error) {
    return { entries: [] };
  }
}

function writeRedemptionLog(log) {
  fs.mkdirSync(path.dirname(redemptionsPath), { recursive: true });
  fs.writeFileSync(redemptionsPath, JSON.stringify(log, null, 2), "utf8");
}

function appendRedemptionLogEntry(entry) {
  const log = readRedemptionLog();
  log.entries.push(entry);

  if (log.entries.length > MAX_REDEMPTION_LOG_ENTRIES) {
    log.entries = log.entries.slice(-MAX_REDEMPTION_LOG_ENTRIES);
  }

  writeRedemptionLog(log);
}

app.use(
  express.json({
    verify: (req, res, buf) => {
      // Needed for verifying SellAuth's webhook signature — signatures are
      // computed over the exact raw bytes SellAuth sent, so re-serializing
      // the parsed object with JSON.stringify() later could produce a
      // different string and fail verification even for a legitimate
      // request.
      req.rawBody = buf;
    }
  })
);

const BUYER_REQUEST_CHANNEL_ID = "1532850460552069281";
const BUYER_REQUEST_COOLDOWN_MS = 5 * 60 * 1000;

// Posts a Buyer Role request to the staff channel with Accept/Decline
// buttons. The actual button-click handling (and the role grant itself)
// lives in index.js, since that's where the bot listens for interactions.
async function postBuyerRoleRequest({ robloxUserId, robloxUsername, discordUserId }) {
  if (!discordClient.isReady()) {
    return false;
  }

  try {
    const channel = await discordClient.channels.fetch(BUYER_REQUEST_CHANNEL_ID);
    if (!channel) {
      return false;
    }

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

    const embed = new EmbedBuilder()
      .setTitle("🛒 Buyer Role Request")
      .setColor(0x1fb8f0)
      .addFields(
        {
          name: "Roblox User",
          value: robloxUsername
            ? `${robloxUsername} (\`${robloxUserId}\`)`
            : `\`${robloxUserId}\``,
          inline: true
        },
        {
          name: "Discord User",
          value: `<@${discordUserId}> (\`${discordUserId}\`)`,
          inline: true
        }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`buyerrole_accept_${discordUserId}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`buyerrole_decline_${discordUserId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    return true;
  } catch (error) {
    console.error("Could not post Buyer role request:", error);
    return false;
  }
}

function readKeysDatabase() {
  try {
    const database = JSON.parse(
      fs.readFileSync(keysPath, "utf8")
    );

    if (!Array.isArray(database.keys)) {
      database.keys = [];
    }

    return database;
  } catch (error) {
    console.error(
      "Could not read keys.json:",
      error
    );

    return {
      keys: []
    };
  }
}

function writeKeysDatabase(database) {
  fs.mkdirSync(path.dirname(keysPath), {
    recursive: true
  });

console.log("Redeem system reading keys from:", keysPath);

  fs.writeFileSync(
    keysPath,
    JSON.stringify(database, null, 2)
  );
}

function readUsersDatabase() {
  try {
    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    const legacyRedeemAllowed = Array.isArray(
      users.whitelisted
    )
      ? users.whitelisted.map(String)
      : [];

    if (!Array.isArray(users.redeemAllowed)) {
      users.redeemAllowed = [];
    }

    if (!Array.isArray(users.permanent)) {
      users.permanent = [];
    }

    if (!Array.isArray(users.blacklisted)) {
      users.blacklisted = [];
    }

    if (!Array.isArray(users.neutral)) {
      users.neutral = [];
    }

    if (!Array.isArray(users.everRedeemed)) {
      users.everRedeemed = [];
    }

    if (!Array.isArray(users.banned)) {
      users.banned = [];
    }

    users.redeemAllowed = Array.from(
      new Set([
        ...users.redeemAllowed.map(String),
        ...legacyRedeemAllowed
      ])
    );

    users.permanent =
      users.permanent.map(String);

    users.blacklisted =
      users.blacklisted.map(String);

    users.neutral =
      users.neutral.map(String);

    users.everRedeemed =
      users.everRedeemed.map(String);

    users.banned =
      users.banned.map(String);

    return users;
  } catch (error) {
    console.error(
      "Could not read users.json:",
      error
    );

    return {
      redeemAllowed: [],
      permanent: [],
      blacklisted: [],
      neutral: [],
      everRedeemed: [],
      banned: []
    };
  }
}

// Every known field gets written back — omitting one here would silently
// erase it from the file the next time anything saves users.json.
function writeUsersDatabase(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });

  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      {
        redeemAllowed: Array.from(new Set((users.redeemAllowed || []).map(String))),
        permanent: Array.from(new Set((users.permanent || []).map(String))),
        blacklisted: Array.from(new Set((users.blacklisted || []).map(String))),
        neutral: Array.from(new Set((users.neutral || []).map(String))),
        everRedeemed: Array.from(new Set((users.everRedeemed || []).map(String))),
        banned: Array.from(new Set((users.banned || []).map(String)))
      },
      null,
      2
    ),
    "utf8"
  );
}
// Permanently records that this Roblox user has redeemed a key at least
// once. Unlike keys.json, this is never cleaned up — so rejoin
// eligibility survives even after the actual key record gets pruned.
function recordEverRedeemed(robloxUserId) {
  const users = readUsersDatabase();

  if (users.everRedeemed.includes(robloxUserId)) {
    return;
  }

  users.everRedeemed.push(robloxUserId);
  writeUsersDatabase(users);
}

function getAccessListStatus(robloxUserId) {
  const users = readUsersDatabase();

  const blocked =
    users.blacklisted.includes(
      robloxUserId
    );

  return {
    allowedToRedeem: !blocked,

    permanentlyWhitelisted:
      users.permanent.includes(
        robloxUserId
      ),

    blacklisted: blocked,

    // Explicit override — if true, this user should NEVER be treated as
    // "whitelisted" for rejoin-button purposes, even if they've actually
    // redeemed a key before. Set by the /neutral Discord command.
    isNeutral:
      users.neutral.includes(robloxUserId),

    // A real ban — the game itself kicks this player the instant it
    // sees this, not just a panel/redeem restriction like blacklisted.
    banned:
      users.banned.includes(robloxUserId)
  };
}
function getUserStatus(
  database,
  robloxUserId
) {
  const now = Date.now();

  const redeemedKeys = database.keys.filter(
    item =>
      String(item.redeemedBy || "") ===
      robloxUserId
  );

  const hasRedeemedBefore =
    redeemedKeys.length > 0 ||
    readUsersDatabase().everRedeemed.includes(robloxUserId);

  // Self-healing: if this person genuinely holds/held a key but somehow
  // never made it into the permanent everRedeemed record (e.g. redeemed
  // before that tracking existed), fix it right now instead of letting
  // the gap persist indefinitely.
  if (redeemedKeys.length > 0) {
    recordEverRedeemed(robloxUserId);
  }

  const validKeys = redeemedKeys.filter(
    item => !item.revoked
  );

  let remainingSeconds = 0;
  let paused = false;

  for (const item of validKeys) {
    if (item.paused === true) {
      const pausedSeconds = Math.max(
        0,
        Math.floor(
          Number(item.pausedRemainingSeconds) || 0
        )
      );

      if (pausedSeconds > remainingSeconds) {
        remainingSeconds = pausedSeconds;
        paused = true;
      }

      continue;
    }

    const expiresAt = Number(item.expiresAt);

    if (expiresAt > now) {
      const secondsLeft = Math.floor(
        (expiresAt - now) / 1000
      );

      if (secondsLeft > remainingSeconds) {
        remainingSeconds = secondsLeft;
        paused = false;
      }
    }
  }

  const permanentStatus =
    getAccessListStatus(robloxUserId);

  // "Whitelisted" here means: this person has proven history (redeemed a
  // key before, or has permanent access) and hasn't been blocked or reset
  // back to neutral. This is what decides whether they get a rejoin
  // button when they currently have no active/paused key.
  const eligibleForRejoin =
    !permanentStatus.blacklisted &&
    !permanentStatus.isNeutral &&
    (hasRedeemedBefore || permanentStatus.permanentlyWhitelisted);

  return {
    hasRedeemedBefore,
    hasActiveKey: remainingSeconds > 0,
    paused,
    remainingSeconds,
    allowedToRedeem:
      permanentStatus.allowedToRedeem,
    permanentlyWhitelisted:
      permanentStatus.permanentlyWhitelisted,
    blacklisted:
      permanentStatus.blacklisted,
    isNeutral:
      permanentStatus.isNeutral,
    eligibleForRejoin
  };
}

function makeTransferKeyString() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

app.post("/transfer-time", (req, res) => {
  const fromUserId = String(req.body.fromRobloxUserId || "").trim();
  const toUserId = String(req.body.toRobloxUserId || "").trim();
  const minutes = Number(req.body.minutes);

  if (!fromUserId || !toUserId) {
    return res.status(400).json({
      success: false,
      message: "Missing user IDs."
    });
  }

  if (fromUserId === toUserId) {
    return res.status(400).json({
      success: false,
      message: "Cannot transfer to yourself."
    });
  }

  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid whole number of minutes."
    });
  }

  const fromStatus = getAccessListStatus(fromUserId);

  if (fromStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      message: "You are blacklisted."
    });
  }

  if (fromStatus.permanentlyWhitelisted) {
    return res.status(400).json({
      success: false,
      message: "Permanent access has no time to transfer."
    });
  }

  const toStatus = getAccessListStatus(toUserId);

  if (toStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      message: "That user is blacklisted and can't receive time."
    });
  }

  if (toStatus.permanentlyWhitelisted) {
    return res.status(400).json({
      success: false,
      message: "That user already has permanent access."
    });
  }

  const database = readKeysDatabase();
  const now = Date.now();

  const findHolderKeyIndex = robloxUserId =>
    database.keys.findIndex(item =>
      String(item.redeemedBy || "") === robloxUserId &&
      !item.revoked &&
      (
        (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
        (item.paused !== true && Number(item.expiresAt) > now)
      )
    );

  const fromKeyIndex = findHolderKeyIndex(fromUserId);

  if (fromKeyIndex === -1) {
    return res.status(404).json({
      success: false,
      message: "You need an active or paused key to transfer time."
    });
  }

  const fromKey = database.keys[fromKeyIndex];

  const fromRemainingSeconds = fromKey.paused === true
    ? Number(fromKey.pausedRemainingSeconds) || 0
    : Math.max(0, Math.floor((Number(fromKey.expiresAt) - now) / 1000));

  const transferSeconds = minutes * 60;

  if (transferSeconds > fromRemainingSeconds) {
    return res.status(400).json({
      success: false,
      message: "You don't have that much time to transfer."
    });
  }

  if (fromKey.paused === true) {
    fromKey.pausedRemainingSeconds = fromRemainingSeconds - transferSeconds;
  } else {
    fromKey.expiresAt = Number(fromKey.expiresAt) - transferSeconds * 1000;
  }

  const toKeyIndex = findHolderKeyIndex(toUserId);

  if (toKeyIndex !== -1) {
    const toKey = database.keys[toKeyIndex];

    if (toKey.paused === true) {
      toKey.pausedRemainingSeconds =
        (Number(toKey.pausedRemainingSeconds) || 0) + transferSeconds;
    } else {
      toKey.expiresAt = Number(toKey.expiresAt) + transferSeconds * 1000;
    }
  } else {
    database.keys.push({
      key: makeTransferKeyString(),
      minutes,
      created: now,
      redeemed: true,
      redeemedAt: now,
      redeemedBy: toUserId,
      expiresAt: now + transferSeconds * 1000,
      paused: false,
      pausedAt: null,
      pausedRemainingSeconds: null,
      pausedLocked: false,
      pausedByAdmin: false,
      discordUserId: null,
      revoked: false,
      revokedAt: null
    });
  }

  writeKeysDatabase(database);
  recordEverRedeemed(toUserId);

  return res.json({
    success: true,
    message: `Transferred ${minutes} minute(s).`
  });
});

app.get("/", (req, res) => {
  res.send("Sweet TP API is running!");
});

app.post("/redeem", (req, res) => {
  const enteredKey = String(
    req.body.key || ""
  ).trim().toUpperCase();

  const robloxUserId = String(
    req.body.robloxUserId || ""
  ).trim();

  if (!enteredKey) {
    return res.status(400).json({
      success: false,
      message: "No key was provided."
    });
  }

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message:
        "No Roblox user ID was provided."
    });
  }

  const permanentStatus =
    getAccessListStatus(robloxUserId);

  if (permanentStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      blacklisted: true,
      message:
        "You are blacklisted and cannot redeem keys."
    });
  }

  if (
    permanentStatus.permanentlyWhitelisted
  ) {
    return res.json({
      success: true,
      permanentlyWhitelisted: true,
      allowedToRedeem: true,
      hasRedeemedBefore: false,
      hasActiveKey: false,
      remainingSeconds: 0,
      message:
        "This Roblox user has permanent access."
    });
  }


  const database = readKeysDatabase();

  const foundKeyIndex = database.keys.findIndex(
    item => item.key === enteredKey
  );

  const foundKey = database.keys[foundKeyIndex];

  if (!foundKey) {
    return res.status(404).json({
      success: false,
      message: "That key does not exist."
    });
  }

  if (foundKey.revoked) {
    return res.status(403).json({
      success: false,
      message:
        "This key has been revoked."
    });
  }

  if (foundKey.redeemed) {
    return res.status(409).json({
      success: false,
      message:
        "This key has already been redeemed."
    });
  }

  const minutes = Number(
    foundKey.minutes
  );

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return res.status(500).json({
      success: false,
      message:
        "This key has an invalid duration."
    });
  }

  // Grabbed now, before this key entry might get spliced out below
  // during merging with an existing active/paused key.
  const discordUserIdForRole = foundKey.discordUserId || null;

  const now = Date.now();

  // Does this same person already have another key of theirs currently
  // active or paused? If so, this new key's time gets added onto that
  // one instead of starting its own separate countdown.
  const currentHolder = database.keys.find(item =>
    item !== foundKey &&
    String(item.redeemedBy || "") === robloxUserId &&
    !item.revoked &&
    (
      (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
      (item.paused !== true && Number(item.expiresAt) > now)
    )
  );

  let totalRemainingSeconds;
  let responseExpiresAt = null;
  let mergedIntoExisting = false;

  if (currentHolder) {
    mergedIntoExisting = true;

    if (currentHolder.paused === true) {
      currentHolder.pausedRemainingSeconds =
        (Number(currentHolder.pausedRemainingSeconds) || 0) +
        minutes * 60;
      totalRemainingSeconds = currentHolder.pausedRemainingSeconds;
    } else {
      currentHolder.expiresAt =
        Number(currentHolder.expiresAt) + minutes * 60 * 1000;
      totalRemainingSeconds = Math.floor(
        (currentHolder.expiresAt - now) / 1000
      );
      responseExpiresAt = currentHolder.expiresAt;
    }

    // This key's only job was handing its time to the existing holder —
    // remove it instead of leaving a redeemed-but-empty row behind.
    database.keys.splice(foundKeyIndex, 1);
  } else {
    foundKey.redeemed = true;
    foundKey.redeemedBy = robloxUserId;
    foundKey.redeemedAt = now;
    foundKey.expiresAt = now + minutes * 60 * 1000;
    foundKey.paused = false;
    foundKey.pausedRemainingSeconds = 0;

    totalRemainingSeconds = minutes * 60;
    responseExpiresAt = foundKey.expiresAt;
  }

  writeKeysDatabase(database);

  // Captured BEFORE recordEverRedeemed() runs, so this reflects whether
  // this was genuinely their first-ever redemption.
  const wasFirstRedeem = !readUsersDatabase().everRedeemed.includes(robloxUserId);

  // Permanent record — survives even if this key later gets revoked or
  // auto-cleaned once expired.
  recordEverRedeemed(robloxUserId);

  appendRedemptionLogEntry({
    key: enteredKey,
    robloxUserId,
    redeemedAt: now,
    minutesAdded: minutes,
    wasFirstRedeem,
    mergedIntoExisting
  });

  // Best-effort — never blocks or fails the redemption itself.
  grantBuyerRole(discordUserIdForRole);

  return res.json({
    success: true,
    message: mergedIntoExisting
      ? `Key redeemed successfully. ${minutes} minute(s) added to your existing time.`
      : "Key redeemed successfully.",
    expiresAt: responseExpiresAt,
    remainingSeconds: totalRemainingSeconds,
    hasRedeemedBefore: true,
    hasActiveKey: true,
    allowedToRedeem: true,
    permanentlyWhitelisted: false,
    blacklisted: false
  });
});


app.post("/pause-time", (req, res) => {
  const robloxUserId = String(
    req.body.robloxUserId || ""
  ).trim();

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message: "No Roblox user ID provided."
    });
  }

  const permanentStatus =
    getAccessListStatus(robloxUserId);

  if (permanentStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      blacklisted: true,
      message: "This Roblox user is blacklisted."
    });
  }

  if (permanentStatus.permanentlyWhitelisted) {
    return res.status(400).json({
      success: false,
      message: "Permanent access cannot be paused."
    });
  }

  const database = readKeysDatabase();
  const now = Date.now();

  const activeKey = database.keys.find(
    item =>
      String(item.redeemedBy || "") === robloxUserId &&
      !item.revoked &&
      item.paused !== true &&
      Number(item.expiresAt) > now
  );

  if (!activeKey) {
    return res.status(404).json({
      success: false,
      message: "You do not have running time to pause."
    });
  }

  const remainingSeconds = Math.floor(
    (Number(activeKey.expiresAt) - now) / 1000
  );

  const TWO_HOURS_SECONDS = 2 * 60 * 60;
  const FIVE_HOURS_SECONDS = 5 * 60 * 60;

  let PAUSE_PENALTY_SECONDS;
  if (remainingSeconds < TWO_HOURS_SECONDS) {
    PAUSE_PENALTY_SECONDS = 5 * 60;
  } else if (remainingSeconds < FIVE_HOURS_SECONDS) {
    PAUSE_PENALTY_SECONDS = 10 * 60;
  } else {
    PAUSE_PENALTY_SECONDS = 15 * 60;
  }

  if (remainingSeconds <= PAUSE_PENALTY_SECONDS) {
    return res.status(400).json({
      success: false,
      message: `You need more than ${PAUSE_PENALTY_SECONDS / 60} minutes left to pause.`
    });
  }

  activeKey.paused = true;
  activeKey.pausedRemainingSeconds =
    remainingSeconds - PAUSE_PENALTY_SECONDS;
  activeKey.expiresAt = null;
  activeKey.pausedAt = now;

  writeKeysDatabase(database);

  return res.json({
    success: true,
    message: "Time paused. 5 minutes were deducted.",
    paused: true,
    remainingSeconds:
      activeKey.pausedRemainingSeconds,
    hasRedeemedBefore: true,
    hasActiveKey: true,
    permanentlyWhitelisted: false,
    blacklisted: false
  });
});

app.post("/resume-time", (req, res) => {
  const robloxUserId = String(
    req.body.robloxUserId || ""
  ).trim();

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message: "No Roblox user ID provided."
    });
  }

  const database = readKeysDatabase();

  const pausedKey = database.keys.find(
    item =>
      String(item.redeemedBy || "") === robloxUserId &&
      !item.revoked &&
      item.paused === true &&
      Number(item.pausedRemainingSeconds) > 0
  );

  if (!pausedKey) {
    return res.status(404).json({
      success: false,
      message: "You do not have paused time to resume."
    });
  }

  // A key paused via the admin /pause command is locked — the player
  // can't resume it themselves. Only an admin running /resume in Discord
  // clears this lock.
  if (pausedKey.pausedLocked === true) {
    return res.status(403).json({
      success: false,
      message: "Your time has been locked by an admin. Please wait."
    });
  }

  const now = Date.now();
  const remainingSeconds = Math.floor(
    Number(pausedKey.pausedRemainingSeconds)
  );

  pausedKey.paused = false;
  pausedKey.expiresAt =
    now + remainingSeconds * 1000;
  pausedKey.pausedRemainingSeconds = 0;
  pausedKey.resumedAt = now;

  writeKeysDatabase(database);

  return res.json({
    success: true,
    message: "Time resumed.",
    paused: false,
    expiresAt: pausedKey.expiresAt,
    remainingSeconds,
    hasRedeemedBefore: true,
    hasActiveKey: true,
    permanentlyWhitelisted: false,
    blacklisted: false
  });
});

app.post("/validate", (req, res) => {
  const robloxUserId = String(
    req.body.robloxUserId || ""
  ).trim();

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message:
        "No Roblox user ID provided."
    });
  }

  const database = readKeysDatabase();

  const status = getUserStatus(
    database,
    robloxUserId
  );

  if (status.blacklisted) {
    return res.json({
      success: false,
      blacklisted: true,
      permanentlyWhitelisted: false,
      allowedToRedeem:
        status.allowedToRedeem,
      hasRedeemedBefore:
        status.hasRedeemedBefore,
      eligibleForRejoin: false,
      hasActiveKey: false,
      remainingSeconds: 0
    });
  }

  return res.json({
    success:
      status.permanentlyWhitelisted ||
      status.hasActiveKey,

    permanentlyWhitelisted:
      status.permanentlyWhitelisted,

    allowedToRedeem:
      status.allowedToRedeem,

    blacklisted: false,

    hasRedeemedBefore:
      status.hasRedeemedBefore,

    eligibleForRejoin:
      status.eligibleForRejoin,

    hasActiveKey:
      status.hasActiveKey,

    paused:
      status.paused,

    remainingSeconds:
      status.remainingSeconds
  });
});

app.post("/user-status", (req, res) => {
  const robloxUserId = String(
    req.body.robloxUserId || ""
  ).trim();

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message:
        "No Roblox user ID provided."
    });
  }

  const database = readKeysDatabase();

  const status = getUserStatus(
    database,
    robloxUserId
  );

  return res.json({
    success: true,

    permanentlyWhitelisted:
      status.permanentlyWhitelisted,

    allowedToRedeem:
      status.allowedToRedeem,

    blacklisted:
      status.blacklisted,

    hasRedeemedBefore:
      status.hasRedeemedBefore,

    eligibleForRejoin:
      status.eligibleForRejoin,

    hasActiveKey:
      status.hasActiveKey,

    paused:
      status.paused,

    remainingSeconds:
      status.remainingSeconds
  });
});

app.post("/request-buyer-role", async (req, res) => {
  const robloxUserId = String(req.body.robloxUserId || "").trim();
  const robloxUsername = String(req.body.robloxUsername || "").trim();
  const discordUserId = String(req.body.discordUserId || "").trim();

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message: "No Roblox user ID provided."
    });
  }

  if (!discordUserId || !/^\d+$/.test(discordUserId)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid numeric Discord ID."
    });
  }

  const permanentStatus = getAccessListStatus(robloxUserId);

  if (permanentStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      message: "You are blacklisted and can't request the role."
    });
  }

  const database = readKeysDatabase();
  const now = Date.now();

  // The one key currently holding this person's real active/paused time
  // (same lookup logic used elsewhere) — this is the ONLY thing that
  // qualifies someone to request the role here, regardless of permanent
  // access.
  const holderKey = database.keys.find(item =>
    String(item.redeemedBy || "") === robloxUserId &&
    !item.revoked &&
    (
      (item.paused === true && Number(item.pausedRemainingSeconds) > 0) ||
      (item.paused !== true && Number(item.expiresAt) > now)
    )
  );

  if (!holderKey) {
    return res.status(404).json({
      success: false,
      message: "You need an active or paused key to request the Buyer role."
    });
  }

  // Cooldown is stored ON the key itself (not in memory), so it survives
  // redeploys and restarts just like everything else in keys.json.
  const lastRequestedAt = Number(holderKey.buyerRoleRequestedAt) || 0;
  const elapsed = now - lastRequestedAt;

  if (lastRequestedAt && elapsed < BUYER_REQUEST_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((BUYER_REQUEST_COOLDOWN_MS - elapsed) / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return res.status(429).json({
      success: false,
      message: `Please wait ${minutes}m ${seconds}s before requesting again.`
    });
  }

  holderKey.buyerRoleRequestedAt = now;
  // Remember this link for the future (e.g. consistency with keys sent
  // via /keysend).
  holderKey.discordUserId = discordUserId;
  writeKeysDatabase(database);

  const posted = await postBuyerRoleRequest({
    robloxUserId,
    robloxUsername,
    discordUserId
  });

  if (!posted) {
    return res.status(500).json({
      success: false,
      message: "Could not reach the staff channel. Try again later."
    });
  }

  return res.json({
    success: true,
    message: "Request sent to staff — you'll get the role once it's approved."
  });
});

// One-time (per restart) backfill: makes sure anyone who currently holds
// — or has ever held — a redeemed key in keys.json is also recorded in
// the permanent everRedeemed list, even if they redeemed before this
// tracking was added. Safe to run every startup — it's a no-op once
// everyone's already recorded.
function backfillEverRedeemed() {
  const keysDatabase = readKeysDatabase();
  const users = readUsersDatabase();
  let changed = false;

  for (const key of keysDatabase.keys) {
    if (key.redeemed === true && key.redeemedBy) {
      const id = String(key.redeemedBy);
      if (!users.everRedeemed.includes(id)) {
        users.everRedeemed.push(id);
        changed = true;
      }
    }
  }

  if (changed) {
    writeUsersDatabase(users);
    console.log("Backfilled everRedeemed from existing keys.json data.");
  }
}

backfillEverRedeemed();

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${PORT}`
  );
});