
─────────────────────────────────────────────────────────────────────
FILE 3 — pages/api/analyse.js
(filename: pages/api/analyse.js  ← note the folder, type the slash)
─────────────────────────────────────────────────────────────────────

import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
  const [, files] = await form.parse(req);
  const file = files.image?.[0];
  if (!file) return res.status(400).json({ error: "No image provided" });

  const fileBuffer = fs.readFileSync(file.filepath);
  const mimeType   = file.mimetype || "image/jpeg";

  // ── Sightengine ───────────────────────────────────────────────────
  let ai = 0.1, df = 0.1;
  try {
    const seForm = new FormData();
    seForm.append("media",      fileBuffer, { filename: "image.jpg", contentType: mimeType });
    seForm.append("models",     "genai,deepfake");
    seForm.append("api_user",   process.env.SIGHTENGINE_API_USER);
    seForm.append("api_secret", process.env.SIGHTENGINE_API_SECRET);

    const seRes  = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: seForm });
    const seData = await seRes.json();
    ai = seData?.type?.ai_generated ?? 0.1;
    df = seData?.type?.deepfake     ?? 0.1;
  } catch (err) {
    console.error("Sightengine error:", err.message);
  }

  // ── Claude ────────────────────────────────────────────────────────
  const b64 = fileBuffer.toString("base64");
  let finding = "Analysis unavailable.", zones = [];
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: b64 } },
            { type: "text", text:
`You are a forensic image analyst. Sightengine scores: AI-generated ${Math.round(ai*100)}%, deepfake ${Math.round(df*100)}%.

Respond ONLY with valid JSON, no other text:
{
  "finding": "<2 punchy sentences — the single most telling artifact or authentic quality you observe. Hyper-specific. No score restatement. No hedging.>",
  "zones": [
    { "label": "<2–4 word label>", "left": <int 5–72>, "top": <int 5–72>, "width": <int 15–38>, "height": <int 10–32> }
  ]
}

Zone rules:
- Only return zones if AI score > 0.5 OR deepfake score > 0.5, otherwise return zones: []
- 2–4 zones pinpointing actual anomalies in THIS image. Clamp: left+width ≤ 88, top+height ≤ 88.`
            }
          ]
        }]
      })
    });
    const claudeData = await claudeRes.json();
    const raw    = claudeData?.content?.find(b => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    finding = parsed.finding || "Analysis unavailable.";
    zones   = Array.isArray(parsed.zones) ? parsed.zones : [];
  } catch (err) {
    console.error("Claude error:", err.message);
  }

  return res.status(200).json({ ai, df, finding, zones });
}
