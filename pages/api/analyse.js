const FormData = require("form-data");
const fetch = require("node-fetch");

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extractField(body, boundary, fieldName) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    const partStart = idx + boundaryBuf.length + 2;
    const nextIdx   = body.indexOf(boundaryBuf, partStart);
    if (nextIdx === -1) break;
    parts.push(body.slice(partStart, nextIdx - 2));
    start = nextIdx;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString();
    if (!header.includes(`name="${fieldName}"`)) continue;
    return part.slice(headerEnd + 4);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const contentType   = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch)
    return res.status(400).json({ error: "Missing boundary" });

  const boundary   = boundaryMatch[1];
  const rawBody    = await getRawBody(req);
  const fileBuffer = extractField(rawBody, boundary, "image");
  if (!fileBuffer) return res.status(400).json({ error: "No image found" });

  let mimeType = "image/jpeg";
  if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50) mimeType = "image/png";
  else if (fileBuffer[0] === 0x52 && fileBuffer[1] === 0x49) mimeType = "image/webp";

  // ── 1. Sightengine ────────────────────────────────────────────────
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

  // ── 2. Claude ─────────────────────────────────────────────────────
  const b64   = fileBuffer.toString("base64");
  const aiPct = Math.round(ai * 100);
  const dfPct = Math.round(df * 100);

  let claudeResult = {};
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
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: b64 } },
            { type: "text", text:
`You are a forensic image analyst. Sightengine detection scores: AI-generated ${aiPct}%, deepfake ${dfPct}%.

Examine this image carefully and respond ONLY with a valid JSON object in this exact shape — no other text:

{
  "overall_risk_score": <integer 0–100>,
  "finding": "<2 punchy sentences — the single most telling artifact or authentic quality. Hyper-specific. No score restatement.>",
  "top_concerns": ["<concern 1>", "<concern 2>"],
  "signals": {
    "ai_generated":      { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "diffusion_model":   { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "gan_fingerprint":   { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "synthetic_texture": { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "face_swap":         { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "face_reenactment":  { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence about facial expression or mouth region manipulation visible in this image>" },
    "edge_blending":     { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "skin_smoothing":    { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "lighting_mismatch": { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "catch_light":       { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "hair_detail":       { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "background_seam":   { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "compression":       { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "noise_pattern":     { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "color_space":       { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" },
    "aspect_ratio":      { "detected": <bool>, "confidence": <int 0–100>, "detail": "<one sentence>" }
  },
  "zones": [
    { "label": "<2–4 word label>", "cx": <int 8–88>, "cy": <int 8–88>, "detail": "<1 sentence forensic explanation for this specific spot>" }
  ]
}

Rules:
- overall_risk_score: weight Sightengine scores heavily (AI ${aiPct}%, deepfake ${dfPct}%) but also factor in your own forensic observations
- top_concerns: only include if overall_risk_score >= 35, otherwise return []
- Always return 2–4 zones as dot markers (centre points, not rectangles)
- Each zone must be spatially distinct — spread across different areas of the image (e.g. top-left face, top-right eye, lower cheek, background)
- cx is horizontal % from left, cy is vertical % from top — place the dot at the EXACT pixel center of the anomaly (e.g. pupil center for an eye issue, the precise hairline edge for hair anomalies, the center of the affected skin patch). Do NOT place dots in empty space adjacent to the feature.
- detail must be a specific 1-sentence observation about what is visible at that exact spot
- For each signal, base detected/confidence on what you actually observe in the image
- detail for each signal must be one specific, concrete sentence about what you see (or don't see) in this image` }
          ]
        }]
      })
    });
    const claudeData = await claudeRes.json();
    const raw = claudeData?.content?.find(b => b.type === "text")?.text || "{}";
    claudeResult = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("Claude error:", err.message);
    claudeResult = {
      overall_risk_score: Math.round((ai + df) / 2 * 100),
      finding: "Detailed analysis unavailable.",
      top_concerns: [],
      signals: {},
      zones: [],
    };
  }

  return res.status(200).json({
    overall_risk_score: claudeResult.overall_risk_score ?? Math.round((ai + df) / 2 * 100),
    finding:            claudeResult.finding      ?? "Analysis unavailable.",
    top_concerns:       claudeResult.top_concerns ?? [],
    signals:            claudeResult.signals       ?? {},
    zones:              claudeResult.zones          ?? [],
  });
}
