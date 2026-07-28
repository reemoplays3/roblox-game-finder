require("./index.js");
require("./deploy-commands.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const keysPath = path.join(process.cwd(), "data", "keys.json");

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

    if (!Array.isArray(users.whitelisted)) {
      users.whitelisted = [];
    }

    if (!Array.isArray(users.blacklisted)) {
      users.blacklisted = [];
    }

    return users;
  } catch (error) {
    console.error(
      "Could not read users.json:",
      error
    );

    return {
      whitelisted: [],
      blacklisted: []
    };
  }
}

function getPermanentStatus(robloxUserId) {
  const users = readUsersDatabase();

  return {
    permanentlyWhitelisted:
      users.whitelisted.includes(
        robloxUserId
      ),

    blacklisted:
      users.blacklisted.includes(
        robloxUserId
      )
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

  const activeKeys = redeemedKeys.filter(
    item =>
      !item.revoked &&
      Number(item.expiresAt) > now
  );

  let remainingSeconds = 0;

  for (const item of activeKeys) {
    const secondsLeft = Math.floor(
      (
        Number(item.expiresAt) -
        now
      ) / 1000
    );

    remainingSeconds = Math.max(
      remainingSeconds,
      secondsLeft
    );
  }

  const permanentStatus =
    getPermanentStatus(robloxUserId);

  return {
    hasRedeemedBefore,

    hasActiveKey:
      remainingSeconds > 0,

    remainingSeconds,

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
    getPermanentStatus(robloxUserId);

  if (permanentStatus.blacklisted) {
    return res.status(403).json({
      success: false,
      blacklisted: true,
      message:
        "This Roblox user is permanently blacklisted."
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
      hasRedeemedBefore:
        status.hasRedeemedBefore,
      hasActiveKey: false,
      remainingSeconds: 0,
      canUseRejoin: false,
      canUsePanel: false
    });
  }

  return res.json({
    success:
      status.hasActiveKey,

    permanentlyWhitelisted:
      status.permanentlyWhitelisted,

    canUseRejoin:
      status.permanentlyWhitelisted,

    canUsePanel:
      status.hasActiveKey,

    blacklisted: false,

    hasRedeemedBefore:
      status.hasRedeemedBefore,

    hasActiveKey:
      status.hasActiveKey,

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

    canUseRejoin:
      status.permanentlyWhitelisted && !status.blacklisted,

    canUsePanel:
      status.hasActiveKey && !status.blacklisted,

    blacklisted:
      status.blacklisted,

    hasRedeemedBefore:
      status.hasRedeemedBefore,

    hasActiveKey:
      status.hasActiveKey,

    remainingSeconds:
      status.remainingSeconds
  });
});

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${PORT}`
  );
});