// Resolves either a numeric Roblox user ID (returned as-is) or a
// username (looked up via Roblox's API) into a user ID string.
// Returns null if the input is empty or the username doesn't exist.
async function resolveRobloxUserId(input) {
  const trimmed = String(input || "").trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [trimmed],
        excludeBannedUsers: false
      })
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    const match = (body.data || [])[0];

    return match ? String(match.id) : null;
  } catch (error) {
    console.error(`Could not resolve Roblox username "${trimmed}":`, error);
    return null;
  }
}

module.exports = { resolveRobloxUserId };