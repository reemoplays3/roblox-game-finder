const discordClient = require("./index.js");
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

const BUYER_ROLE_NAME = "Buyer";

// Gives the Discord "Buyer" role to whoever /keysend originally sent
// this key to. Does nothing (safely) if the key wasn't sent via
// /keysend, if the bot isn't logged in yet, if the role doesn't exist,
// or if the person already has the role. This never blocks or fails the
// actual redemption — it's best-effort on top of it.
async function grantBuyerRole(discordUserId) {
  if (!discordUserId) {
    return { success: false, message: "No Discord ID provided." };
  }

  if (!discordClient.isReady()) {
    console.warn(
      "Discord client not ready yet — skipping Buyer role grant for",
      discordUserId
    );
    return { success: false, message: "The bot isn't ready yet. Try again in a moment." };
  }

  try {
    const guild = await discordClient.guilds.fetch(process.env.GUILD_ID);

    let member;
    try {
      member = await guild.members.fetch(discordUserId);
    } catch (_fetchError) {
      return {
        success: false,
        message: "That Discord ID couldn't be found in the server. Make sure you've joined and typed your ID correctly."
      };
    }

    const role = guild.roles.cache.find(
      r => r.name === BUYER_ROLE_NAME
    );

    if (!role) {
      console.warn(
        `Could not find a role named "${BUYER_ROLE_NAME}" in the server.`
      );
      return { success: false, message: "The Buyer role isn't set up yet — contact an admin." };
    }

    if (member.roles.cache.has(role.id)) {
      return { success: true, message: "You already have the Buyer role!" };
    }

    await member.roles.add(role);
    console.log(`Granted Buyer role to Discord user ${discordUserId}`);
    return { success: true, message: "Buyer role granted! Check your Discord roles." };
  } catch (error) {
    console.error(
      `Could not grant Buyer role to ${discordUserId}:`,
      error
    );
    return { success: false, message: "Something went wrong granting the role. Try again later." };
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

    return users;
  } catch (error) {
    console.error(
      "Could not read users.json:",
      error
    );

    return {
      redeemAllowed: [],
      permanent: [],
      blacklisted: []
    };
  }
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

    blacklisted: blocked
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
    redeemedKeys.length > 0;

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
      permanentStatus.blacklisted
  };
}

app.get("/", (req, res) => {
  res.send("Sweet TP API is running!");
});

app.post("/redeem", (req, res) => {
  const enteredKey = String(
    req.body.key || ""
  ).trim();

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

  const PAUSE_PENALTY_SECONDS = 5 * 60;

  const remainingSeconds = Math.floor(
    (Number(activeKey.expiresAt) - now) / 1000
  );

  if (remainingSeconds <= PAUSE_PENALTY_SECONDS) {
    return res.status(400).json({
      success: false,
      message: "You need more than 5 minutes left to pause."
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

    hasActiveKey:
      status.hasActiveKey,

    paused:
      status.paused,

    remainingSeconds:
      status.remainingSeconds
  });
});

app.post("/grant-buyer-role", async (req, res) => {
  const robloxUserId = String(req.body.robloxUserId || "").trim();
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
      message: "You are blacklisted and can't claim the role."
    });
  }

  const database = readKeysDatabase();
  const now = Date.now();

  // The one key currently holding this person's real active/paused time
  // (same lookup logic used elsewhere) — this is the ONLY thing that
  // qualifies someone for the role here, regardless of permanent access.
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
      message: "You need an active or paused key to claim the Buyer role."
    });
  }

  // Remember this link for the future (e.g. if the role ever needs to
  // be re-granted, or for consistency with keys sent via /keysend).
  holderKey.discordUserId = discordUserId;
  writeKeysDatabase(database);

  const result = await grantBuyerRole(discordUserId);
  return res.json(result);
});

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${PORT}`
  );
});