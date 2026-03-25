const fetch = require("node-fetch");

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const [seStatus, claudeStatus] = await Promise.allSettled([
    checkSightengine(),
    checkClaude(),
  ]);

  const se     = seStatus.status     === "fulfilled" && seStatus.value;
  const claude = claudeStatus.status === "fulfilled" && claudeStatus.value;

  const status = se && claude ? "ok" : se || claude ? "degraded" : "down";

  return res.status(200).json({ status, se, claude });
}

async function checkSightengine() {
  try {
    const res = await fetch(
      `https://api.sightengine.com/1.0/check.json?models=genai&api_user=${process.env.SIGHTENGINE_API_USER}&api_secret=${process.env.SIGHTENGINE_API_SECRET}&url=https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/240px-PNG_transparency_demonstration_1.png`,
      { method: "GET" }
    );
    const data = await res.json();
    return data?.status === "success";
  } catch {
    return false;
  }
}

async function checkClaude() {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const data = await res.json();
    return data?.content?.length > 0;
  } catch {
    return false;
  }
}
