const FormData = require("form-data");
const fetch    = require("node-fetch");

export const config = { api: { bodyParser: false } };

// Read raw request body into a Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Pull a field value out of a multipart body by its field name
function extractField(body, boundary, fieldName) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    const partStart = idx + boundaryBuf.length + 2; // skip \r\n
    const nextIdx   = body.indexOf(boundaryBuf, partStart);
    if (nextIdx === -1) break;
    parts.push(body.slice(partStart, nextIdx - 2)); // trim trailing \r\n
    start = nextIdx;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString();
    if (!header.includes(`name="${fieldName}"`)) continue;
    return part.slice(headerEnd + 4); // data after \r\n\r\n
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // ── 1. Parse multipart body manually ─────────────────────────────
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch)
    return res.status(400).json({ error: "Missing boundary in content-type" });

  const boundary  = boundaryMatch[1];
  const rawBody   = await getRawBody(req);
  const fileBuffer = extractField(rawBody, boundary, "image");

  if (!fileBuffer)
    return res.status(400).json({ error: "No image found in request" });

  // Detect mime type from magic bytes
  let mimeType = "image/jpeg";
  if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50) mimeType = "image/png";
  else if (fileBuffer[0] === 0x52 && fileBuffer[1] === 0x49) mimeType = "image/webp";

  // ── 2. Sightengine ────────────────────────────────────────────────
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

  // ── 3. Claude ─────────────────────────────────────────────────────
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
`You are a forensic image analyst. Sightengine scores: AI-generated ${Math.round(ai * 100)}%, deepfake ${Math.round(df * 100)}%.

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
