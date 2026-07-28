require("./index.js");
require("./deploy-commands.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const dataPath = path.join(__dirname, "data", "keys.json");

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Sweet TP API is running!");
});

app.post("/redeem", (req, res) => {
  const enteredKey = req.body.key;
const robloxUserId = String(req.body.robloxUserId || "");

  if (!enteredKey) {
    return res.status(400).json({
      success: false,
      message: "No key was provided."
    });
  }

  if (!robloxUserId) {
  return res.status(400).json({
    success: false,
    message: "No Roblox user ID was provided."
    });
  }

  const database = JSON.parse(
    fs.readFileSync(dataPath, "utf8")
  );

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
    message: "This key has been revoked."
  });
}

if (foundKey.redeemed) {
  return res.status(409).json({
    success: false,
    message: "This key has already been redeemed."
  });
}

const now = Date.now();

foundKey.redeemed = true;
foundKey.redeemedBy = robloxUserId;
foundKey.redeemedAt = now;
foundKey.expiresAt = now + (foundKey.minutes * 60 * 1000);

fs.writeFileSync(
  dataPath,
  JSON.stringify(database, null, 2)
);

return res.json({
  success: true,
  message: "Key redeemed successfully.",
  expiresAt: foundKey.expiresAt
});
});

app.post("/validate", (req, res) => {
  const robloxUserId = String(req.body.robloxUserId || "");

  if (!robloxUserId) {
    return res.status(400).json({
      success: false,
      message: "No Roblox user ID provided."
    });
  }

  const database = JSON.parse(
    fs.readFileSync(dataPath, "utf8")
  );

  const foundKey = database.keys.find(
    item =>
      item.redeemedBy === robloxUserId &&
      !item.revoked &&
      item.expiresAt > Date.now()
  );

  if (!foundKey) {
    return res.json({
      success: false,
      remainingSeconds: 0
    });
  }

  return res.json({
    success: true,
    remainingSeconds: Math.floor(
      (foundKey.expiresAt - Date.now()) / 1000
    )
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});