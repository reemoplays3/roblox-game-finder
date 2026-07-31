require("./index.js");
require("./deploy-commands.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const keysPath = path.join(process.cwd(), "data", "keys.json");

// Was previously path.join(__dirname, "data", "users.json") — different
// method than keysPath used. They currently resolve to the same folder,
// but keeping both paths built the same way avoids that ever silently
// drifting apart if the start command or folder layout changes.
const usersPath = path.join(process.cwd(), "data", "users.json");

app.use(express.json());

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

  const foundKey = database.keys.find(
    item => item.key === enteredKey
  );

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

  const now = Date.now();

  foundKey.redeemed = true;
  foundKey.redeemedBy = robloxUserId;
  foundKey.redeemedAt = now;
  foundKey.expiresAt =
    now + minutes * 60 * 1000;
  foundKey.paused = false;
  foundKey.pausedRemainingSeconds = 0;

  writeKeysDatabase(database);

  return res.json({
    success: true,
    message:
      "Key redeemed successfully.",
    expiresAt:
      foundKey.expiresAt,
    remainingSeconds: Math.floor(
      (
        foundKey.expiresAt -
        now
      ) / 1000
    ),
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

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${PORT}`
  );
});