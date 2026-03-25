"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Signal definitions ────────────────────────────────────────────────────────
const SIGNAL_GROUPS = [
  {
    key: "ai_generation",
    group: "AI generation",
    color: { bg: "#EEEDFE", border: "#7F77DD", text: "#3C3489" },
    dot: "#7F77DD",
    info: "Increases the weight of AI generation signals (diffusion models, GAN fingerprints, synthetic textures) in the final risk score. Set to High if you're primarily checking for AI-generated art.",
    signals: [
      { key: "ai_generated",      label: "AI-generated image",        info: "Detects whether the entire image was produced by a generative AI model such as Midjourney, DALL-E, or Stable Diffusion." },
      { key: "diffusion_model",   label: "Diffusion model signature", info: "Identifies statistical noise patterns and frequency artifacts that are characteristic of diffusion-based image generators." },
      { key: "gan_fingerprint",   label: "GAN fingerprint",           info: "Looks for periodic grid-like artifacts in pixel frequency space that GAN generators leave behind, even in high-quality outputs." },
      { key: "synthetic_texture", label: "Synthetic skin / texture",  info: "Checks for unnaturally smooth or repetitive skin and surface textures — a common tell of AI-generated portraits." },
    ],
  },
  {
    key: "face_manipulation",
    group: "Face manipulation",
    color: { bg: "#FAECE7", border: "#D85A30", text: "#4A1B0C" },
    dot: "#D85A30",
    info: "Increases the weight of face swap, reenactment and blending signals. Set to High if deepfakes are your primary concern.",
    signals: [
      { key: "face_swap",        label: "Face swap detected",     info: "Detects whether a face in the image has been replaced with another person's likeness using AI face-swapping techniques." },
      { key: "face_reenactment", label: "Face reenactment",       info: "Identifies manipulation of facial expressions or mouth regions, commonly used to alter the appearance of speech in AI-generated portraits." },
      { key: "edge_blending",    label: "Unnatural edge blending",info: "Looks for soft or inconsistent boundaries around the face where a swap or composite has been blended into the background." },
      { key: "skin_smoothing",   label: "Excessive skin smoothing",info: "Flags skin that is unnaturally uniform or poreless — a side effect of AI face generators and heavy deepfake post-processing." },
    ],
  },
  {
    key: "forensic_cues",
    group: "Forensic cues",
    color: { bg: "#E1F5EE", border: "#1D9E75", text: "#085041" },
    dot: "#1D9E75",
    info: "Weights forensic visual cues like lighting, catch-lights, hair edges and background seams. Useful for catching subtle AI portraits that pass basic checks.",
    signals: [
      { key: "lighting_mismatch", label: "Lighting inconsistency",       info: "Checks whether the direction, colour temperature and shadow pattern of the lighting is consistent across the face and background." },
      { key: "catch_light",       label: "Missing / cloned catch-lights", info: "Real eyes reflect light sources as unique catch-lights. AI images often clone identical reflections in both eyes or omit them entirely." },
      { key: "hair_detail",       label: "Hair edge anomaly",             info: "Examines hair boundaries for the characteristic blur or dissolve that occurs when AI models struggle to render fine strands against backgrounds." },
      { key: "background_seam",   label: "Background seam or artifact",  info: "Looks for discontinuities or unnatural transitions where the subject meets the background, which can indicate compositing or AI generation." },
    ],
  },
  {
    key: "metadata",
    group: "Image integrity",
    color: { bg: "#FAEEDA", border: "#BA7517", text: "#633806" },
    dot: "#BA7517",
    info: "Weights low-level pixel and encoding signals. Most useful as a secondary check — not reliable alone but adds confidence when combined with other signals.",
    signals: [
      { key: "compression",   label: "Compression artifact pattern", info: "Detects unnatural JPEG block patterns that appear when AI images are post-processed or re-saved." },
      { key: "noise_pattern", label: "Unnatural noise distribution",  info: "Real camera images have characteristic sensor noise. AI images often lack this or show synthetic noise that doesn't match real cameras." },
      { key: "color_space",   label: "Color space anomaly",           info: "Checks for unexpected colour space inconsistencies that result from AI image post-processing pipelines." },
      { key: "aspect_ratio",  label: "Non-standard aspect ratio",     info: "Flags images with aspect ratios commonly output by AI generators that differ from standard camera outputs." },
    ],
  },
];

const ALL_SIGNALS    = SIGNAL_GROUPS.flatMap(g => g.signals);
const DEFAULT_WEIGHTS    = { ai_generation: "med", face_manipulation: "high", forensic_cues: "med", metadata: "low" };
const DEFAULT_BOOSTS     = { face_swap: true, synthetic_texture: true };
const DEFAULT_THRESHOLDS = { suspicious: 55, high: 70 };

const STEPS = [
  { label: "Uploading image",        detail: "Sending your image securely to the analysis server" },
  { label: "Scanning for artifacts", detail: "Checking for AI generation signatures from MidJourney, DALL-E, Stable Diffusion and more" },
  { label: "Deepfake analysis",      detail: "Looking for face swaps, skin texture anomalies and edge blending" },
  { label: "Forensic review",        detail: "Claude is examining lighting, geometry, hair detail and compression patterns" },
  { label: "Building report",        detail: "Compiling risk score, signal findings and suspicious region markers" },
];

// ── Small reusable components ─────────────────────────────────────────────────

function AnimatedEllipsis({ label }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{label}<span style={{ display: "inline-block", width: 16, textAlign: "left" }}>{dots}</span></span>;
}

function InfoIcon({ text, flipDown }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${show ? "#2c2c2a" : "#B4B2A9"}`, background: show ? "#F1EFE8" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, color: show ? "#2c2c2a" : "#888780", cursor: "pointer", transition: "all 0.15s" }}>i</div>
      {show && (
        <div style={{ position: "absolute", right: 22, top: flipDown ? "auto" : -6, bottom: flipDown ? -6 : "auto", background: "#2c2c2a", color: "#F1EFE8", fontSize: 11, lineHeight: 1.55, padding: "8px 10px", borderRadius: 8, width: 200, zIndex: 50, pointerEvents: "none" }}>
          {text}
          <div style={{ position: "absolute", right: -5, top: flipDown ? "auto" : 12, bottom: flipDown ? 12 : "auto", width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: "5px solid #2c2c2a" }} />
        </div>
      )}
    </div>
  );
}

function ZoneDot({ z, isClean, activeIdx, idx, setActiveIdx }) {
  const isActive  = activeIdx === idx;
  const dotColor  = isClean ? "#639922"              : "#E24B4A";
  const ringColor = isClean ? "rgba(99,153,34,0.35)" : "rgba(226,75,74,0.35)";
  const calloutBg     = isClean ? "#EAF3DE" : "#FCEBEB";
  const calloutBorder = isClean ? "#C0DD97" : "#F09595";
  const titleColor    = isClean ? "#27500A" : "#A32D2D";
  const bodyColor     = isClean ? "#3B6D11" : "#791F1F";
  const flipLeft = z.cx > 55;
  const flipUp   = z.cy > 55;

  return (
    <div
      onMouseEnter={() => setActiveIdx(idx)}
      onMouseLeave={() => setActiveIdx(i => i === idx ? null : i)}
      onClick={() => setActiveIdx(i => i === idx ? null : idx)}
      style={{ position: "absolute", left: `${z.cx}%`, top: `${z.cy}%`, transform: "translate(-50%, -50%)", zIndex: isActive ? 20 : 5, cursor: "pointer" }}>

      <style>{`@keyframes pulse-dot { 0%,100%{transform:scale(1);opacity:0.45} 50%{transform:scale(1.7);opacity:0.15} }`}</style>

      <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? (isClean ? "rgba(99,153,34,0.2)" : "rgba(226,75,74,0.2)") : "transparent", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${ringColor}`, animation: "pulse-dot 1.8s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      </div>

      <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [flipLeft ? "right" : "left"]: 26, fontSize: 10, fontWeight: 500, color: titleColor, whiteSpace: "nowrap", pointerEvents: "none", textShadow: "0 0 4px #F1EFE8, 0 0 4px #F1EFE8" }}>
        {z.label}
      </div>

      {isActive && (
        <>
          <svg style={{ position: "absolute", top: "50%", left: "50%", overflow: "visible", pointerEvents: "none", zIndex: 15 }} width="0" height="0">
            <line x1="0" y1="0" x2={flipLeft ? -110 : 110} y2={flipUp ? -40 : 40} stroke="#B4B2A9" strokeWidth="1" strokeDasharray="4 3" />
          </svg>
          <div style={{ position: "absolute", [flipLeft ? "right" : "left"]: 30, [flipUp ? "bottom" : "top"]: 30, background: calloutBg, border: `0.5px solid ${calloutBorder}`, borderRadius: 8, padding: "8px 10px", width: 170, zIndex: 20, pointerEvents: "none" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: titleColor, margin: "0 0 3px" }}>{z.label}</p>
            <p style={{ fontSize: 10, color: bodyColor, lineHeight: 1.55, margin: 0 }}>{z.detail || z.label}</p>
          </div>
        </>
      )}
    </div>
  );
}

function RiskBadge({ score, thresholds }) {
  const [lvl, c] = score >= thresholds.high
    ? ["High risk",   { bg: "#FCEBEB", border: "#E24B4A", text: "#A32D2D" }]
    : score >= thresholds.suspicious
    ? ["Medium risk", { bg: "#FAEEDA", border: "#BA7517", text: "#854F0B" }]
    : ["Low risk",    { bg: "#EAF3DE", border: "#639922", text: "#3B6D11" }];
  return <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>{lvl}</span>;
}

function ScoreBar({ score }) {
  const [w, setW] = useState(0);
  const color = score >= 70 ? "#E24B4A" : score >= 35 ? "#EF9F27" : "#639922";
  useEffect(() => { const t = setTimeout(() => setW(score), 60); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ height: 8, background: "#F1EFE8", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.7s ease" }} />
    </div>
  );
}

function SignalRow({ label, finding, info, isLast }) {
  const [open, setOpen] = useState(false);
  if (!finding) return null;
  const { detected, confidence, detail } = finding;
  return (
    <div style={{ padding: "9px 0", borderBottom: isLast ? "none" : "0.5px solid #F1EFE8" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: detected ? "#FCEBEB" : "#EAF3DE", color: detected ? "#A32D2D" : "#3B6D11", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
          {detected ? "✕" : "✓"}
        </div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#2c2c2a" }}>{label}</span>
        <InfoIcon text={info} flipDown />
        {detected && confidence != null && <span style={{ fontSize: 11, color: "#888780" }}>{confidence}%</span>}
        <span onClick={() => setOpen(o => !o)} style={{ fontSize: 11, color: "#888780", cursor: "pointer", userSelect: "none", padding: "2px 6px", borderRadius: 4, border: "0.5px solid #D3D1C7", marginLeft: 4 }}>
          {open ? "Less" : "More"}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 6, marginLeft: 30, fontSize: 12, color: "#5F5E5A", lineHeight: 1.6, borderLeft: "2px solid #D3D1C7", paddingLeft: 10 }}>
          {detail}
          {detected && confidence != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1, height: 3, background: "#F1EFE8", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${confidence}%`, height: "100%", background: "#E24B4A", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: "#888780" }}>Confidence: {confidence}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, color, signals, results }) {
  const flagged = signals.filter(s => results?.[s.key]?.detected).length;
  return (
    <div style={{ border: "0.5px solid #D3D1C7", borderRadius: 12, overflow: "visible", marginBottom: 10, position: "relative" }}>
      <div style={{ background: color.bg, borderBottom: `0.5px solid ${color.border}`, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: color.text }}>{group}</span>
        {flagged > 0
          ? <span style={{ fontSize: 11, background: "#FCEBEB", color: "#A32D2D", border: "0.5px solid #E24B4A", borderRadius: 4, padding: "2px 8px" }}>{flagged} flagged</span>
          : <span style={{ fontSize: 11, color: color.text }}>Clear</span>}
      </div>
      <div style={{ padding: "0 14px", background: "#fff", borderRadius: "0 0 12px 12px" }}>
        {signals.map((s, i) => (
          <SignalRow key={s.key} label={s.label} finding={results?.[s.key]} info={s.info} isLast={i === signals.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ weights, boosts, thresholds, onWeights, onBoosts, onThresholds, onClose }) {
  const WEIGHT_OPTS = ["low", "med", "high"];
  const pillStyle = (active, level) => {
    const styles = {
      low:  active ? { bg: "#EAF3DE", border: "#C0DD97", text: "#27500A" } : null,
      med:  active ? { bg: "#FAEEDA", border: "#FAC775", text: "#633806" } : null,
      high: active ? { bg: "#FCEBEB", border: "#F09595", text: "#791F1F" } : null,
    };
    const c = styles[level];
    return { padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${c ? c.border : "#D3D1C7"}`, background: c ? c.bg : "#F1EFE8", color: c ? c.text : "#888780", transition: "all 0.15s" };
  };
  const row = { display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "0.5px solid #F1EFE8" };
  const sectionLabel = { fontSize: 9, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", marginBottom: 8 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "rgba(44,44,42,0.4)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "88vh", overflowY: "auto", paddingBottom: 24, maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <div style={{ width: 36, height: 4, background: "#D3D1C7", borderRadius: 99, margin: "10px auto 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 10px", borderBottom: "0.5px solid #F1EFE8" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "#2c2c2a", margin: 0 }}>Scan settings</p>
            <p style={{ fontSize: 11, color: "#888780", margin: 0 }}>Adjust signal weights and thresholds</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", background: "#F1EFE8", border: "0.5px solid #D3D1C7", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5F5E5A" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: "14px 20px 0" }}>
          <p style={sectionLabel}>Signal group weights</p>
          {SIGNAL_GROUPS.map(g => (
            <div key={g.key} style={{ ...row, ...(g.key === "metadata" ? { borderBottom: "none" } : {}) }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.dot, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#2c2c2a" }}>{g.group}</span>
              <InfoIcon text={g.info} />
              <div style={{ display: "flex", gap: 4 }}>
                {WEIGHT_OPTS.map(opt => (
                  <div key={opt} style={pillStyle(weights[g.key] === opt, opt)} onClick={() => onWeights({ ...weights, [g.key]: opt })}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 20px 0", borderTop: "0.5px solid #F1EFE8", marginTop: 10 }}>
          <p style={sectionLabel}>Boost individual signals</p>
          {ALL_SIGNALS.map((s, i) => (
            <div key={s.key} style={{ ...row, ...(i === ALL_SIGNALS.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: 1, fontSize: 12, color: "#5F5E5A" }}>{s.label}</span>
              {boosts[s.key] && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#854F0B", border: "0.5px solid #FAC775", borderRadius: 4, padding: "1px 5px" }}>Boosted</span>}
              <InfoIcon text={s.info} flipDown={i > ALL_SIGNALS.length - 5} />
              <div onClick={() => onBoosts({ ...boosts, [s.key]: !boosts[s.key] })}
                style={{ width: 32, height: 18, borderRadius: 99, background: boosts[s.key] ? "#2c2c2a" : "#D3D1C7", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
                <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: boosts[s.key] ? 16 : 2, transition: "left 0.2s" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 20px 0", borderTop: "0.5px solid #F1EFE8", marginTop: 10 }}>
          <p style={sectionLabel}>Risk thresholds</p>
          {[{ key: "suspicious", label: "Flag as suspicious" }, { key: "high", label: "Flag as high risk" }].map(t => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: t.key === "suspicious" ? "0.5px solid #F1EFE8" : "none" }}>
              <span style={{ fontSize: 12, color: "#5F5E5A", width: 130, flexShrink: 0 }}>{t.label}</span>
              <input type="range" min="1" max="99" step="1" value={thresholds[t.key]} onChange={e => onThresholds({ ...thresholds, [t.key]: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "#2c2c2a", minWidth: 28, textAlign: "right" }}>{thresholds[t.key]}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "16px 20px 0" }}>
          <button onClick={() => { onWeights({ ...DEFAULT_WEIGHTS }); onBoosts({ ...DEFAULT_BOOSTS }); onThresholds({ ...DEFAULT_THRESHOLDS }); }}
            style={{ flex: 1, padding: "10px", background: "#F1EFE8", border: "0.5px solid #D3D1C7", borderRadius: 10, fontSize: 13, color: "#5F5E5A", cursor: "pointer" }}>
            Reset defaults
          </button>
          <button onClick={onClose}
            style={{ flex: 2, padding: "10px", background: "#2c2c2a", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "#F1EFE8", cursor: "pointer" }}>
            Apply settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconTrash()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function IconSwap()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>; }
function IconScan()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>; }
function IconUpload()   { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function IconSettings() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5F5E5A" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }

const card      = { background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
const cardLabel = { fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", marginBottom: 8, fontWeight: 500 };

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [imgUrl,       setImgUrl]       = useState(null);
  const [imgB64,       setImgB64]       = useState(null);
  const [imgMime,      setImgMime]      = useState("image/jpeg");
  const [drag,         setDrag]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [revealing,    setRevealing]    = useState(false);
  const [step,         setStep]         = useState(0);
  const [elapsed,      setElapsed]      = useState(0);
  const [estimate,     setEstimate]     = useState(12);
  const [result,       setResult]       = useState(null);
  const [showHeat,     setShowHeat]     = useState(false);
  const [activeZone,   setActiveZone]   = useState(null);
  const [copied,       setCopied]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [weights,      setWeights]      = useState({ ...DEFAULT_WEIGHTS });
  const [boosts,       setBoosts]       = useState({ ...DEFAULT_BOOSTS });
  const [thresholds,   setThresholds]   = useState({ ...DEFAULT_THRESHOLDS });

  const fileRef    = useRef();
  const replaceRef = useRef();
  const tickerRef  = useRef(null);
  const timerRef   = useRef(null);
  const startRef   = useRef(null);
  const pendingRef = useRef(null);

  const processFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImgMime(file.type || "image/jpeg");
    const r = new FileReader();
    r.onload = (e) => { setImgUrl(e.target.result); setImgB64(e.target.result.split(",")[1]); setResult(null); setShowHeat(false); setActiveZone(null); };
    r.readAsDataURL(file);
  };

  const onDrop = useCallback((e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]); }, []);

  const analyse = async () => {
    if (!imgB64 || !imgMime) return;
    const history = window._deepscanHistory || [];
    const avg = history.length ? Math.round(history.reduce((a, b) => a + b, 0) / history.length) : 12;
    setEstimate(avg);
    startRef.current = Date.now();
    setLoading(true); setResult(null); setShowHeat(false); setActiveZone(null);
    setStep(0); setElapsed(0); setRevealing(false);

    let s = 0;
    tickerRef.current = setInterval(() => { s = Math.min(s + 1, STEPS.length - 1); setStep(s); }, 1600);
    timerRef.current  = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const byteStr = atob(imgB64);
      const arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: imgMime });
      const form = new FormData();
      form.append("image", blob, "image.jpg");
      form.append("settings", JSON.stringify({ weights, boosts, thresholds }));

      const res  = await fetch("/api/analyse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      const duration = Math.round((Date.now() - startRef.current) / 1000);
      window._deepscanHistory = [...(window._deepscanHistory || []), duration].slice(-5);
      clearInterval(tickerRef.current);
      clearInterval(timerRef.current);
      setStep(STEPS.length - 1);
      pendingRef.current = data;
      setRevealing(true);
      setTimeout(() => {
        setRevealing(false); setLoading(false);
        setResult(pendingRef.current);
        setShowHeat((pendingRef.current.zones?.length ?? 0) > 0);
      }, 1800);
    } catch (err) {
      clearInterval(tickerRef.current); clearInterval(timerRef.current);
      setLoading(false);
      setResult({ overall_risk_score: 0, top_concerns: [], signals: {}, zones: [], finding: "Analysis failed: " + err.message });
    }
  };

  const reset = () => {
    setImgUrl(null); setImgB64(null); setResult(null);
    setShowHeat(false); setActiveZone(null);
    setLoading(false); setRevealing(false); setStep(0);
    clearInterval(tickerRef.current); clearInterval(timerRef.current);
  };

  const remaining  = Math.max(0, estimate - elapsed);
  const pct        = Math.min((elapsed / estimate) * 100, 100);
  const pending    = pendingRef.current;
  const revScore   = pending ? (pending.overall_risk_score ?? 0) : 0;
  const revealMeta = revScore >= thresholds.high
    ? { bg: "#FCEBEB", color: "#A32D2D", border: "#F09595", icon: "⚠", text: "High risk detected" }
    : revScore >= thresholds.suspicious
    ? { bg: "#FAEEDA", color: "#854F0B", border: "#FAC775", icon: "!", text: "Suspicious signals found" }
    : { bg: "#EAF3DE", color: "#3B6D11", border: "#C0DD97", icon: "✓", text: "Looks mostly clean" };

  const totalFlagged = result ? ALL_SIGNALS.filter(s => result.signals?.[s.key]?.detected).length : 0;
  const isClean      = result ? (result.overall_risk_score ?? 0) < thresholds.suspicious : true;

  return (
    <div style={{ background: "#F1EFE8", minHeight: "100vh", padding: "0 0 40px" }}>
      <style>{`
        @keyframes scanline { 0%{top:-2px} 100%{top:100%} }
        @keyframes pulsebox { 0%,100%{opacity:0.15} 50%{opacity:0.72} }
        .scan-line { position:absolute; left:0; right:0; height:2px; background:rgba(55,138,221,0.8); animation:scanline 1.8s linear infinite; pointer-events:none; }
        .scan-box  { position:absolute; border:1.5px solid rgba(55,138,221,0.65); border-radius:4px; background:rgba(55,138,221,0.1); pointer-events:none; animation:pulsebox 1.4s ease-in-out infinite; }
      `}</style>

      {showSettings && (
        <SettingsPanel weights={weights} boosts={boosts} thresholds={thresholds}
          onWeights={setWeights} onBoosts={setBoosts} onThresholds={setThresholds}
          onClose={() => setShowSettings(false)} />
      )}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #D3D1C7", padding: "14px 20px 10px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, background: "#2c2c2a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F1EFE8" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="7" y1="11" x2="15" y2="11" stroke="#378ADD" strokeWidth="2"/></svg>
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: "#2c2c2a", margin: 0, letterSpacing: "-0.3px" }}>DeepScan</h1>
              <p style={{ fontSize: 12, color: "#888780", margin: 0 }}>Detect AI-generated images &amp; deepfakes</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} style={{ width: 36, height: 36, borderRadius: 8, background: "#F1EFE8", border: "0.5px solid #D3D1C7", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <IconSettings />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 0" }}>

        {!imgUrl ? (
          <div onClick={() => fileRef.current.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            style={{ border: `1.5px dashed ${drag ? "#378ADD" : "#B4B2A9"}`, borderRadius: 16, padding: "48px 20px", textAlign: "center", cursor: "pointer", background: drag ? "#E6F1FB" : "#e8e7e2", transition: "background 0.15s, border-color 0.15s" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><IconUpload /></div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "#444441", margin: "0 0 4px" }}>Drop an image here</p>
            <p style={{ fontSize: 12, color: "#888780", margin: 0 }}>or tap to browse — JPEG, PNG, WebP</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
          </div>
        ) : (
          <>
            {/* Image card */}
            <div style={{ ...card, padding: 10 }}>
              <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", marginBottom: 8, isolation: "isolate" }}>
                <img src={imgUrl} alt="Uploaded" style={{ width: "100%", display: "block", borderRadius: 8 }} />

                {/* Scan animation */}
                {loading && !revealing && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: "rgba(44,44,42,0.32)" }} />
                    <div className="scan-line" />
                    {step >= 1 && <div className="scan-box" style={{ left: "28%", top: "5%",  width: "22%", height: "18%", animationDelay: "0s" }} />}
                    {step >= 1 && <div className="scan-box" style={{ left: "10%", top: "18%", width: "30%", height: "22%", animationDelay: "0.2s" }} />}
                    {step >= 1 && <div className="scan-box" style={{ left: "55%", top: "10%", width: "28%", height: "20%", animationDelay: "0.4s" }} />}
                    {step >= 2 && <div className="scan-box" style={{ left: "20%", top: "38%", width: "22%", height: "16%", animationDelay: "0.1s" }} />}
                    {step >= 2 && <div className="scan-box" style={{ left: "48%", top: "30%", width: "25%", height: "18%", animationDelay: "0.5s" }} />}
                    {step >= 2 && <div className="scan-box" style={{ left: "15%", top: "58%", width: "30%", height: "15%", animationDelay: "0.3s" }} />}
                    {step >= 3 && <div className="scan-box" style={{ left: "55%", top: "52%", width: "28%", height: "18%", animationDelay: "0.6s" }} />}
                    {step >= 3 && <div className="scan-box" style={{ left: "32%", top: "72%", width: "35%", height: "14%", animationDelay: "0.2s" }} />}
                    <div style={{ position: "absolute", bottom: 7, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 10, color: "rgba(255,255,255,0.92)", background: "rgba(44,44,42,0.65)", borderRadius: 4, padding: "2px 8px" }}>{STEPS[step]?.label}</div>
                  </div>
                )}

                {/* Zone dots */}
                {!loading && !revealing && showHeat && result?.zones?.length > 0 && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "visible" }}>
                    {result.zones.map((z, i) => (
                      <ZoneDot key={i} idx={i} z={z} isClean={isClean} activeIdx={activeZone} setActiveIdx={setActiveZone} />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {result && !loading && (
                  <button onClick={() => { setShowHeat(h => !h); setActiveZone(null); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                    <IconScan />{showHeat ? "Hide heatmap" : "Show heatmap"}
                  </button>
                )}
                <button onClick={() => replaceRef.current.click()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", cursor: "pointer" }}><IconSwap />Replace</button>
                <button onClick={reset} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", color: "#A32D2D", cursor: "pointer" }}><IconTrash />Remove</button>
                <input ref={replaceRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
              </div>
            </div>

            {/* Analyse CTA */}
            {!result && !loading && !revealing && (
              <button onClick={analyse} style={{ display: "block", width: "100%", padding: "11px", background: "#2c2c2a", color: "#F1EFE8", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 10 }}>
                Analyse image
              </button>
            )}

            {/* Loading panel */}
            {loading && !revealing && (
              <div style={{ background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: "16px 16px 10px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#2c2c2a" }}>Analysing…</span>
                  <span style={{ fontSize: 12, fontWeight: remaining <= 3 ? 500 : 400, color: remaining <= 3 ? "#A32D2D" : "#888780" }}>
                    {remaining > 0 ? `~${remaining}s left` : <AnimatedEllipsis label="Finishing up" />}
                  </span>
                </div>
                <div style={{ height: 4, background: "#F1EFE8", borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ height: "100%", background: "#534AB7", borderRadius: 2, transition: "width 0.8s ease", width: `${pct}%` }} />
                </div>
                {STEPS.map((s, i) => {
                  const done = i < step, active = i === step, pend = i > step;
                  return (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "5px 0", opacity: pend ? 0.35 : 1, transition: "opacity 0.3s" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: done ? "#EAF3DE" : active ? "#EEEDFE" : "#F1EFE8", border: `1.5px solid ${done ? "#639922" : active ? "#7F77DD" : "#D3D1C7"}`, color: done ? "#3B6D11" : active ? "#534AB7" : "#888780", transition: "all 0.3s" }}>
                        {done ? "✓" : active ? "◌" : ""}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: done ? "#888780" : "#2c2c2a", transition: "all 0.3s" }}>{s.label}{active ? "…" : ""}</div>
                        {active && <div style={{ fontSize: 11, color: "#888780", marginTop: 2 }}>{s.detail}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reveal flash */}
            {revealing && (
              <div style={{ background: revealMeta.bg, border: `1.5px solid ${revealMeta.border}`, borderRadius: 12, padding: "28px 16px", textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 36, marginBottom: 10, lineHeight: 1 }}>{revealMeta.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 500, color: revealMeta.color, marginBottom: 4 }}>{revealMeta.text}</div>
                <div style={{ fontSize: 12, color: revealMeta.color, opacity: 0.75 }}>Loading detailed breakdown…</div>
              </div>
            )}

            {/* Results */}
            {result && !loading && !revealing && (
              <>
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#5F5E5A" }}>Overall risk score</span>
                    <RiskBadge score={result.overall_risk_score ?? 0} thresholds={thresholds} />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 500, color: "#2c2c2a" }}>{result.overall_risk_score ?? 0}</span>
                    <span style={{ fontSize: 13, color: "#888780" }}>/ 100</span>
                    <span style={{ fontSize: 12, color: "#888780", marginLeft: "auto" }}>{totalFlagged} / {ALL_SIGNALS.length} signals flagged</span>
                  </div>
                  <ScoreBar score={result.overall_risk_score ?? 0} />
                </div>

                {result.top_concerns?.length > 0 && (
                  <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#A32D2D", marginBottom: 8 }}>Top concerns</div>
                    {result.top_concerns.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                        <span style={{ color: "#E24B4A", fontWeight: 700, fontSize: 12, marginTop: 2 }}>!</span>
                        <span style={{ fontSize: 13, color: "#791F1F", lineHeight: 1.5 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.finding && (
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ ...cardLabel, margin: 0 }}>Forensic finding</p>
                      <button onClick={() => { if (result?.finding) navigator.clipboard.writeText(result.finding).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                        style={{ fontSize: 11, padding: "3px 10px", cursor: "pointer", color: copied ? "#27500A" : "#5F5E5A", borderColor: copied ? "#C0DD97" : undefined, background: copied ? "#EAF3DE" : undefined }}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.75, color: "#2c2c2a", margin: 0 }}>{result.finding}</p>
                  </div>
                )}

                {SIGNAL_GROUPS.map(g => <GroupCard key={g.key} group={g.group} color={g.color} signals={g.signals} results={result.signals} />)}

                <div style={{ marginBottom: 10, marginTop: 4 }}>
                  <button onClick={analyse} style={{ display: "block", width: "100%", padding: "10px", background: "#fff", color: "#2c2c2a", border: "0.5px solid #D3D1C7", borderRadius: 10, fontSize: 13, cursor: "pointer", marginBottom: 6 }}>Re-analyse</button>
                  <button onClick={reset} style={{ display: "block", width: "100%", padding: "10px", background: "#2c2c2a", color: "#F1EFE8", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Scan another image</button>
                </div>

                <p style={{ fontSize: 11, color: "#B4B2A9", textAlign: "center", lineHeight: 1.6, padding: "0 8px 8px" }}>
                  Results are probabilistic and should not be used as sole evidence of authenticity.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
