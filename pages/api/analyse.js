const FormData = require("form-data");
const fetch = require("node-fetch");

export const config = { api: { bodyParser: false } };

// ── Facial landmark lookup table ──────────────────────────────────────────────
const REGIONS = {
  left_eye:         { cx: 38, cy: 42 },
  right_eye:        { cx: 62, cy: 42 },
  left_eyebrow:     { cx: 37, cy: 36 },
  right_eyebrow:    { cx: 63, cy: 36 },
  nose_tip:         { cx: 50, cy: 58 },
  nose_bridge:      { cx: 50, cy: 48 },
  left_cheek:       { cx: 32, cy: 58 },
  right_cheek:      { cx: 68, cy: 58 },
  mouth:            { cx: 50, cy: 70 },
  upper_lip:        { cx: 50, cy: 66 },
  lower_lip:        { cx: 50, cy: 73 },
  chin:             { cx: 50, cy: 83 },
  jaw_left:         { cx: 26, cy: 75 },
  jaw_right:        { cx: 74, cy: 75 },
  forehead:         { cx: 50, cy: 28 },
  forehead_left:    { cx: 38, cy: 28 },
  forehead_right:   { cx: 62, cy: 28 },
  hair_top:         { cx: 50, cy: 10 },
  hair_left:        { cx: 24, cy: 30 },
  hair_right:       { cx: 76, cy: 30 },
  left_ear:         { cx: 18, cy: 55 },
  right_ear:        { cx: 82, cy: 55 },
  neck:             { cx: 50, cy: 92 },
  background_left:  { cx: 10, cy: 40 },
  background_right: { cx: 90, cy: 40 },
  background_top:   { cx: 50, cy:  8 },
};

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

  // ── 1. Sightengine ────────────────────────────────────────────────────────
  let ai = 0.1, df = 0.1;
  try {
    const seForm = new FormData();
    seForm.append("media",      fileBuffer, { filename: "image.jpg", contentType: mimeType });
    seForm.append("models",     "genai,deepfake");
    seForm.append("api_user",   process.env.SIGHTENGINE_API_USER);
    seForm.append("api_secret", process.env.SIGHTENGINE_API_SECRET);
    const seRes  = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: seForm });
    const seData = await seRes.json();
    console.log("Sightengine:", JSON.stringify(seData));
    ai = seData?.type?.ai_generated ?? 0.1;
    df = seData?.type?.deepfake     ?? 0.1;
  } catch (err) {
    console.error("Sightengine error:", err.message);
  }

  // ── 2. Claude ─────────────────────────────────────────────────────────────
  const b64        = fileBuffer.toString("base64");
  const aiPct      = Math.round(ai * 100);
  const dfPct      = Math.round(df * 100);
  const regionKeys = Object.keys(REGIONS).join(", ");

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
`You are a forensic image analyst for a KYC (identity verification) system. Sightengine detection scores: AI-generated ${aiPct}%, deepfake ${dfPct}%.

First, check if this image is suitable for KYC analysis. Then respond ONLY with a valid JSON object — no other text:

{
  "face_error": <null | "no_face" | "multiple_faces" | "poor_quality">,
  "face_error_message": <null | "one clear sentence describing the issue for the user">,
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
    {
      "label": "<2–4 word label>",
      "region": "<one of: ${regionKeys}>",
      "detail": "<1 sentence forensic explanation for this specific spot>"
    }
  ]
}

Face validation rules:
- Set face_error to "no_face" if no human face is visible in the image
- Set face_error to "multiple_faces" if more than one face is clearly visible
- Set face_error to "poor_quality" if the face is obscured (sunglasses, mask, hat), not facing the camera, too small, or too dark/blurry to analyse
- If face_error is set, still return all other fields but set overall_risk_score to 0, zones to [], top_concerns to [], signals to all false
- face_error_message must be a single plain-English sentence telling the user how to fix the issue

Scoring rules:
- Be AGGRESSIVE in flagging AI. Weight Sightengine (AI ${aiPct}%, deepfake ${dfPct}%) at 50% and your own forensic visual assessment at 50%
- If you observe ANY of these, score 60+: unnaturally smooth skin, perfect symmetry, synthetic hair texture, overly uniform lighting, flawless complexion with no pores
- If Sightengine scores are high, score 75+
- Only score below 40 if the image has clear signs of authenticity like natural skin pores, asymmetry, film grain, or candid composition
- When in doubt, score higher rather than lower
- top_concerns: only include if overall_risk_score >= 35, otherwise return []
- Always return 2–4 zones unless face_error is set
- For each zone pick the best matching region key from: ${regionKeys}
- Each zone must use a different region key — no duplicates` }
          ]
        }]
      })
    });
    const claudeData = await claudeRes.json();
    const raw = claudeData?.content?.find(b => b.type === "text")?.text || "{}";
    claudeResult = JSON.parse(raw.replace(/```json|```/g, "").trim());
    console.log("Claude parsed:", JSON.stringify(claudeResult));
  } catch (err) {
    console.error("Claude error:", err.message);
    claudeResult = {
      face_error: null,
      face_error_message: null,
      overall_risk_score: Math.round((ai + df) / 2 * 100),
      finding: "Detailed analysis unavailable.",
      top_concerns: [],
      signals: {},
      zones: [],
    };
  }

  // ── 3. Resolve region names → coordinates ────────────────────────────────
  const zones = (claudeResult.zones ?? []).map(z => {
    const coords = REGIONS[z.region] ?? REGIONS["forehead"];
    return { label: z.label, detail: z.detail, cx: coords.cx, cy: coords.cy };
  });

  console.log("Final zones:", JSON.stringify(zones));

  return res.status(200).json({
    face_error:         claudeResult.face_error         ?? null,
    face_error_message: claudeResult.face_error_message ?? null,
    overall_risk_score: claudeResult.overall_risk_score ?? Math.round((ai + df) / 2 * 100),
    finding:            claudeResult.finding             ?? "Analysis unavailable.",
    top_concerns:       claudeResult.top_concerns        ?? [],
    signals:            claudeResult.signals              ?? {},
    zones,
    se_ai:  Math.round(ai * 100),
    se_df:  Math.round(df * 100),
  });
}
