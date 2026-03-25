"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Signal definitions ────────────────────────────────────────────────────────
const SIGNAL_GROUPS = [
  {
    key: "ai_generation", group: "AI generation",
    color: { bg: "#EEEDFE", border: "#7F77DD", text: "#3C3489" }, dot: "#7F77DD",
    info: "Increases the weight of AI generation signals in the final risk score.",
    signals: [
      { key: "ai_generated",      label: "AI-generated image",        info: "Detects whether the entire image was produced by a generative AI model such as Midjourney, DALL-E, or Stable Diffusion." },
      { key: "diffusion_model",   label: "Diffusion model signature", info: "Identifies statistical noise patterns characteristic of diffusion-based image generators." },
      { key: "gan_fingerprint",   label: "GAN fingerprint",           info: "Looks for periodic grid-like artifacts in pixel frequency space that GAN generators leave behind." },
      { key: "synthetic_texture", label: "Synthetic skin / texture",  info: "Checks for unnaturally smooth or repetitive skin and surface textures." },
    ],
  },
  {
    key: "face_manipulation", group: "Face manipulation",
    color: { bg: "#FAECE7", border: "#D85A30", text: "#4A1B0C" }, dot: "#D85A30",
    info: "Increases the weight of face swap, reenactment and blending signals.",
    signals: [
      { key: "face_swap",        label: "Face swap detected",      info: "Detects whether a face has been replaced with another person's likeness." },
      { key: "face_reenactment", label: "Face reenactment",        info: "Identifies manipulation of facial expressions or mouth regions." },
      { key: "edge_blending",    label: "Unnatural edge blending", info: "Looks for inconsistent boundaries where a swap has been blended into the background." },
      { key: "skin_smoothing",   label: "Excessive skin smoothing",info: "Flags skin that is unnaturally uniform or poreless." },
    ],
  },
  {
    key: "forensic_cues", group: "Forensic cues",
    color: { bg: "#E1F5EE", border: "#1D9E75", text: "#085041" }, dot: "#1D9E75",
    info: "Weights forensic visual cues like lighting, catch-lights, hair edges and background seams.",
    signals: [
      { key: "lighting_mismatch", label: "Lighting inconsistency",        info: "Checks whether lighting direction and shadow pattern is consistent across the image." },
      { key: "catch_light",       label: "Missing / cloned catch-lights",  info: "AI images often clone identical reflections in both eyes or omit them entirely." },
      { key: "hair_detail",       label: "Hair edge anomaly",              info: "Examines hair boundaries for blur or dissolve typical of AI models." },
      { key: "background_seam",   label: "Background seam or artifact",   info: "Looks for discontinuities where the subject meets the background." },
    ],
  },
  {
    key: "metadata", group: "Image integrity",
    color: { bg: "#FAEEDA", border: "#BA7517", text: "#633806" }, dot: "#BA7517",
    info: "Weights low-level pixel and encoding signals.",
    signals: [
      { key: "compression",   label: "Compression artifact pattern", info: "Detects unnatural JPEG block patterns from AI post-processing." },
      { key: "noise_pattern", label: "Unnatural noise distribution",  info: "Real cameras have characteristic sensor noise. AI images often lack this." },
      { key: "color_space",   label: "Color space anomaly",           info: "Checks for unexpected colour space inconsistencies from AI pipelines." },
      { key: "aspect_ratio",  label: "Non-standard aspect ratio",     info: "Flags aspect ratios commonly output by AI generators." },
    ],
  },
];

const ALL_SIGNALS        = SIGNAL_GROUPS.flatMap(g => g.signals);
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

const toTitleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());

// ── Zone layout ───────────────────────────────────────────────────────────────
const BOX_W = 185, BOX_H = 94, LINE = 48, V_LEN = 36, H_LEN = 44, ZPAD = 6, DOT_R = 11;

function calcZoneLayout(dot, IW, IH) {
  const dx = (dot.cx / 100) * IW, dy = (dot.cy / 100) * IH;
  const spaceR = IW - (dx + DOT_R) - ZPAD, spaceL = (dx - DOT_R) - ZPAD;
  const fitsR = spaceR >= LINE + BOX_W, fitsL = spaceL >= LINE + BOX_W;
  if (fitsR || fitsL) {
    const goRight = fitsR && (!fitsL || spaceR >= spaceL);
    const lx1 = goRight ? dx + DOT_R : dx - DOT_R;
    const lx2 = goRight ? lx1 + LINE : lx1 - LINE;
    const ly  = dy;
    let bx = goRight ? lx2 : lx2 - BOX_W;
    const roomAbove = ly - BOX_H - ZPAD >= 0;
    let by = roomAbove ? ly - BOX_H : ly;
    bx = Math.max(ZPAD, Math.min(bx, IW - BOX_W - ZPAD));
    by = Math.max(ZPAD, Math.min(by, IH - BOX_H - ZPAD));
    return { mode: "straight", dx, dy, lx1, ly, lx2, bx, by };
  }
  const goDown = (IH - dy) >= dy, goRight2 = (IW - dx) >= dx;
  const vx1 = dx, vy1 = dy, vx2 = dx, vy2 = goDown ? dy + V_LEN : dy - V_LEN;
  const hx2 = goRight2 ? vx2 + H_LEN : vx2 - H_LEN;
  let bx = goRight2 ? hx2 : hx2 - BOX_W, by = goDown ? vy2 : vy2 - BOX_H;
  bx = Math.max(ZPAD, Math.min(bx, IW - BOX_W - ZPAD));
  by = Math.max(ZPAD, Math.min(by, IH - BOX_H - ZPAD));
  return { mode: "perp", dx, dy, vx1, vy1, vx2, vy2, hx1: vx2, hy1: vy2, hx2, hy2: vy2, bx, by };
}

// ── Small components ──────────────────────────────────────────────────────────
function AnimatedEllipsis({ label }) {
  const [dots, setDots] = useState("");
  useEffect(() => { const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400); return () => clearInterval(t); }, []);
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
  const isActive = activeIdx === idx, hasActive = activeIdx !== null;
  const dotColor = isClean ? "#639922" : "#E24B4A";
  const ringColor = isClean ? "rgba(99,153,34,0.35)" : "rgba(226,75,74,0.35)";
  const pillBg = isClean ? "rgba(234,243,222,0.92)" : "rgba(252,235,235,0.92)";
  const pillBorder = isClean ? "#C0DD97" : "#F09595";
  const flipLeft = z.cx > 50;
  return (
    <div onClick={e => { e.stopPropagation(); setActiveIdx(i => i === idx ? null : idx); }}
      onMouseEnter={() => setActiveIdx(idx)} onMouseLeave={() => setActiveIdx(i => i === idx ? null : i)}
      style={{ position: "absolute", left: `${z.cx}%`, top: `${z.cy}%`, transform: "translate(-50%,-50%)", zIndex: isActive ? 30 : 5, cursor: "pointer", opacity: hasActive && !isActive ? 0.15 : 1, transition: "opacity 0.25s" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? (isClean ? "rgba(99,153,34,0.2)" : "rgba(226,75,74,0.2)") : "transparent", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${ringColor}`, animation: "pulse-dot 1.8s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      </div>
      {!isActive && (
        <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [flipLeft ? "right" : "left"]: 20, fontSize: 10, fontWeight: 500, color: isClean ? "#27500A" : "#791F1F", background: pillBg, border: `0.5px solid ${pillBorder}`, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toTitleCase(z.label)}
        </div>
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
  return <div style={{ height: 8, background: "#F1EFE8", borderRadius: 4, overflow: "hidden", marginTop: 8 }}><div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.7s ease" }} /></div>;
}

function SignalRow({ label, finding, info, isLast }) {
  const [open, setOpen] = useState(false);
  if (!finding) return null;
  const { detected, confidence, detail } = finding;
  return (
    <div style={{ padding: "9px 0", borderBottom: isLast ? "none" : "0.5px solid #F1EFE8" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: detected ? "#FCEBEB" : "#EAF3DE", color: detected ? "#A32D2D" : "#3B6D11", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{detected ? "✕" : "✓"}</div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#2c2c2a" }}>{label}</span>
        <InfoIcon text={info} flipDown />
        {detected && confidence != null && <span style={{ fontSize: 11, color: "#888780" }}>{confidence}%</span>}
        <span onClick={() => setOpen(o => !o)} style={{ fontSize: 11, color: "#888780", cursor: "pointer", userSelect: "none", padding: "2px 6px", borderRadius: 4, border: "0.5px solid #D3D1C7", marginLeft: 4 }}>{open ? "Less" : "More"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 6, marginLeft: 30, fontSize: 12, color: "#5F5E5A", lineHeight: 1.6, borderLeft: "2px solid #D3D1C7", paddingLeft: 10 }}>
          {detail}
          {detected && confidence != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1, height: 3, background: "#F1EFE8", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${confidence}%`, height: "100%", background: "#E24B4A", borderRadius: 2 }} /></div>
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
        {flagged > 0 ? <span style={{ fontSize: 11, background: "#FCEBEB", color: "#A32D2D", border: "0.5px solid #E24B4A", borderRadius: 4, padding: "2px 8px" }}>{flagged} flagged</span>
          : <span style={{ fontSize: 11, color: color.text }}>Clear</span>}
      </div>
      <div style={{ padding: "0 14px", background: "#fff", borderRadius: "0 0 12px 12px" }}>
        {signals.map((s, i) => <SignalRow key={s.key} label={s.label} finding={results?.[s.key]} info={s.info} isLast={i === signals.length - 1} />)}
      </div>
    </div>
  );
}

function SettingsPanel({ weights, boosts, thresholds, onWeights, onBoosts, onThresholds, onClose }) {
  const OPTS = ["low", "med", "high"];
  const ps = (active, level) => {
    const m = { low: active ? { bg: "#EAF3DE", border: "#C0DD97", text: "#27500A" } : null, med: active ? { bg: "#FAEEDA", border: "#FAC775", text: "#633806" } : null, high: active ? { bg: "#FCEBEB", border: "#F09595", text: "#791F1F" } : null };
    const c = m[level];
    return { padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `0.5px solid ${c ? c.border : "#D3D1C7"}`, background: c ? c.bg : "#F1EFE8", color: c ? c.text : "#888780", transition: "all 0.15s" };
  };
  const row = { display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "0.5px solid #F1EFE8" };
  const sl = { fontSize: 9, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", marginBottom: 8 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "rgba(44,44,42,0.4)" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "88vh", overflowY: "auto", paddingBottom: 24, maxWidth: 560, width: "100%" }}>
        <div style={{ width: 36, height: 4, background: "#D3D1C7", borderRadius: 99, margin: "10px auto 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 10px", borderBottom: "0.5px solid #F1EFE8" }}>
          <div><p style={{ fontSize: 15, fontWeight: 500, color: "#2c2c2a", margin: 0 }}>Scan settings</p><p style={{ fontSize: 11, color: "#888780", margin: 0 }}>Adjust signal weights and thresholds</p></div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", background: "#F1EFE8", border: "0.5px solid #D3D1C7", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5F5E5A" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "14px 20px 0" }}>
          <p style={sl}>Signal group weights</p>
          {SIGNAL_GROUPS.map(g => (
            <div key={g.key} style={{ ...row, ...(g.key === "metadata" ? { borderBottom: "none" } : {}) }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.dot, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#2c2c2a" }}>{g.group}</span>
              <InfoIcon text={g.info} />
              <div style={{ display: "flex", gap: 4 }}>{OPTS.map(opt => <div key={opt} style={ps(weights[g.key] === opt, opt)} onClick={() => onWeights({ ...weights, [g.key]: opt })}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</div>)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 20px 0", borderTop: "0.5px solid #F1EFE8", marginTop: 10 }}>
          <p style={sl}>Boost individual signals</p>
          {ALL_SIGNALS.map((s, i) => (
            <div key={s.key} style={{ ...row, ...(i === ALL_SIGNALS.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={{ flex: 1, fontSize: 12, color: "#5F5E5A" }}>{s.label}</span>
              {boosts[s.key] && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#854F0B", border: "0.5px solid #FAC775", borderRadius: 4, padding: "1px 5px" }}>Boosted</span>}
              <InfoIcon text={s.info} flipDown={i > ALL_SIGNALS.length - 5} />
              <div onClick={() => onBoosts({ ...boosts, [s.key]: !boosts[s.key] })} style={{ width: 32, height: 18, borderRadius: 99, background: boosts[s.key] ? "#2c2c2a" : "#D3D1C7", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
                <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: boosts[s.key] ? 16 : 2, transition: "left 0.2s" }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 20px 0", borderTop: "0.5px solid #F1EFE8", marginTop: 10 }}>
          <p style={sl}>Risk thresholds</p>
          {[{ key: "suspicious", label: "Flag as suspicious" }, { key: "high", label: "Flag as high risk" }].map(t => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: t.key === "suspicious" ? "0.5px solid #F1EFE8" : "none" }}>
              <span style={{ fontSize: 12, color: "#5F5E5A", width: 130, flexShrink: 0 }}>{t.label}</span>
              <input type="range" min="1" max="99" step="1" value={thresholds[t.key]} onChange={e => onThresholds({ ...thresholds, [t.key]: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "#2c2c2a", minWidth: 28, textAlign: "right" }}>{thresholds[t.key]}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "16px 20px 0" }}>
          <button onClick={() => { onWeights({ ...DEFAULT_WEIGHTS }); onBoosts({ ...DEFAULT_BOOSTS }); onThresholds({ ...DEFAULT_THRESHOLDS }); }} style={{ flex: 1, padding: "10px", background: "#F1EFE8", border: "0.5px solid #D3D1C7", borderRadius: 10, fontSize: 13, color: "#5F5E5A", cursor: "pointer" }}>Reset defaults</button>
          <button onClick={onClose} style={{ flex: 2, padding: "10px", background: "#2c2c2a", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "#F1EFE8", cursor: "pointer" }}>Apply settings</button>
        </div>
      </div>
    </div>
  );
}

function IconTrash()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function IconSwap()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>; }
function IconScan()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>; }
function IconUpload()   { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function IconSettings() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5F5E5A" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }

const cardLabel = { fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", marginBottom: 8, fontWeight: 500 };
const card = { background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };

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
  const [imgSize,      setImgSize]      = useState({ w: 0, h: 0 });
  const [copied,       setCopied]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [weights,      setWeights]      = useState({ ...DEFAULT_WEIGHTS });
  const [boosts,       setBoosts]       = useState({ ...DEFAULT_BOOSTS });
  const [thresholds,   setThresholds]   = useState({ ...DEFAULT_THRESHOLDS });

  const fileRef       = useRef();
  const replaceRef    = useRef();
  const imgContainerRef = useRef();
  const tickerRef     = useRef(null);
  const timerRef      = useRef(null);
  const startRef      = useRef(null);
  const pendingRef    = useRef(null);

  useEffect(() => {
    const update = () => {
      if (imgContainerRef.current) {
        const r = imgContainerRef.current.getBoundingClientRect();
        setImgSize({ w: r.width, h: r.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (imgContainerRef.current) ro.observe(imgContainerRef.current);
    return () => ro.disconnect();
  }, [imgUrl]);

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
    setEstimate(avg); startRef.current = Date.now();
    setLoading(true); setResult(null); setShowHeat(false); setActiveZone(null);
    setStep(0); setElapsed(0); setRevealing(false);
    let s = 0;
    tickerRef.current = setInterval(() => { s = Math.min(s + 1, STEPS.length - 1); setStep(s); }, 1600);
    timerRef.current  = setInterval(() => setElapsed(e => e + 1), 1000);
    try {
      const byteStr = atob(imgB64), arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: imgMime });
      const form = new FormData();
      form.append("image", blob, "image.jpg");
      form.append("settings", JSON.stringify({ weights, boosts, thresholds }));
      const res = await fetch("/api/analyse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      window._deepscanHistory = [...(window._deepscanHistory || []), duration].slice(-5);
      clearInterval(tickerRef.current); clearInterval(timerRef.current);
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

  const reset = () => { setImgUrl(null); setImgB64(null); setResult(null); setShowHeat(false); setActiveZone(null); setLoading(false); setRevealing(false); setStep(0); clearInterval(tickerRef.current); clearInterval(timerRef.current); };

  const remaining = Math.max(0, estimate - elapsed);
  const pct       = Math.min((elapsed / estimate) * 100, 100);
  const revScore  = pendingRef.current ? (pendingRef.current.overall_risk_score ?? 0) : 0;
  const revealMeta = revScore >= thresholds.high
    ? { bg: "#FCEBEB", color: "#A32D2D", border: "#F09595", icon: "⚠", text: "High risk detected" }
    : revScore >= thresholds.suspicious
    ? { bg: "#FAEEDA", color: "#854F0B", border: "#FAC775", icon: "!", text: "Suspicious signals found" }
    : { bg: "#EAF3DE", color: "#3B6D11", border: "#C0DD97", icon: "✓", text: "Looks mostly clean" };

  const totalFlagged = result ? ALL_SIGNALS.filter(s => result.signals?.[s.key]?.detected).length : 0;
  const isClean      = result ? (result.overall_risk_score ?? 0) < thresholds.suspicious : true;

  // Active zone layout
  const activeZoneData = result?.zones?.[activeZone] ?? null;
  const zoneLayout = activeZoneData && imgSize.w > 0 ? calcZoneLayout(activeZoneData, imgSize.w, imgSize.h) : null;
  const lineColor = isClean ? "#3B6D11" : "#666";
  const calloutBorder = isClean ? "#C0DD97" : "#F09595";
  const calloutTitleColor = isClean ? "#27500A" : "#A32D2D";
  const calloutHeaderBg = isClean ? "#EAF3DE" : "#FCEBEB";

  return (
    <div style={{ background: "#F1EFE8", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes scanline   { 0%{top:-2px} 100%{top:100%} }
        @keyframes pulsebox   { 0%,100%{opacity:0.15} 50%{opacity:0.72} }
        @keyframes pulse-dot  { 0%,100%{transform:scale(1);opacity:0.45} 50%{transform:scale(1.7);opacity:0.15} }
        @keyframes fade-callout { from{opacity:0} to{opacity:1} }
        @keyframes draw-s { from{stroke-dashoffset:${LINE}} to{stroke-dashoffset:0} }
        @keyframes draw-v { from{stroke-dashoffset:${V_LEN}} to{stroke-dashoffset:0} }
        @keyframes draw-h { from{stroke-dashoffset:${H_LEN}} to{stroke-dashoffset:0} }
        .scan-line { position:absolute;left:0;right:0;height:2px;background:rgba(55,138,221,0.8);animation:scanline 1.8s linear infinite;pointer-events:none; }
        .scan-box  { position:absolute;border:1.5px solid rgba(55,138,221,0.65);border-radius:4px;background:rgba(55,138,221,0.1);pointer-events:none;animation:pulsebox 1.4s ease-in-out infinite; }
        @media(max-width:700px){ .two-col{ flex-direction:column !important; } .left-col{ position:relative !important; height:auto !important; overflow:visible !important; border-right:none !important; border-bottom:0.5px solid #D3D1C7 !important; } .right-col{ max-height:none !important; overflow:visible !important; } }
      `}</style>

      {showSettings && <SettingsPanel weights={weights} boosts={boosts} thresholds={thresholds} onWeights={setWeights} onBoosts={setBoosts} onThresholds={setThresholds} onClose={() => setShowSettings(false)} />}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #D3D1C7", padding: "14px 24px 10px", flexShrink: 0 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      {/* Body */}
      <div style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%" }}>

        {/* Upload state — centred single column */}
        {!imgUrl && (
          <div style={{ padding: "40px 24px" }}>
            <div onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
              style={{ border: `1.5px dashed ${drag ? "#378ADD" : "#B4B2A9"}`, borderRadius: 16, padding: "64px 40px", textAlign: "center", cursor: "pointer", background: drag ? "#E6F1FB" : "#e8e7e2", transition: "background 0.15s, border-color 0.15s", maxWidth: 560, margin: "0 auto" }}>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><IconUpload /></div>
              <p style={{ fontSize: 16, fontWeight: 500, color: "#444441", margin: "0 0 4px" }}>Drop an image here</p>
              <p style={{ fontSize: 13, color: "#888780", margin: 0 }}>or click to browse — JPEG, PNG, WebP</p>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
            </div>
          </div>
        )}

        {/* Two-column layout once image is loaded */}
        {imgUrl && (
          <div className="two-col" style={{ display: "flex", height: "calc(100vh - 73px)", overflow: "hidden" }}>

            {/* ── Left column: image (sticky) ── */}
            <div className="left-col" style={{ width: "52%", flexShrink: 0, padding: "20px 16px 20px 24px", borderRight: "0.5px solid #D3D1C7", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>

              {/* Image container */}
              <div style={{ background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: 10 }}>
                <div ref={imgContainerRef} style={{ position: "relative", borderRadius: 8, marginBottom: 8 }}>
                  <img src={imgUrl} alt="Uploaded" style={{ width: "100%", display: "block", borderRadius: 8 }} />

                  {/* Scan overlay */}
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

                  {/* Zone dots + lines + callout */}
                  {!loading && !revealing && showHeat && result?.zones?.length > 0 && (() => {
                    const L = zoneLayout;
                    return (
                      <div onClick={() => setActiveZone(null)} style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }}>
                        {L && (
                          <svg key={`svg-${activeZone}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 15, overflow: "hidden" }}>
                            {L.mode === "straight" ? (
                              <line x1={L.lx1} y1={L.ly} x2={L.lx2} y2={L.ly} stroke={lineColor} strokeWidth="1.5" strokeDasharray={LINE} strokeDashoffset={LINE} style={{ animation: "draw-s 0.22s ease-out forwards" }} />
                            ) : (
                              <>
                                <line x1={L.vx1} y1={L.vy1} x2={L.vx2} y2={L.vy2} stroke={lineColor} strokeWidth="1.5" strokeDasharray={V_LEN} strokeDashoffset={V_LEN} style={{ animation: "draw-v 0.16s ease-out forwards" }} />
                                <line x1={L.hx1} y1={L.hy1} x2={L.hx2} y2={L.hy2} stroke={lineColor} strokeWidth="1.5" strokeDasharray={H_LEN} strokeDashoffset={H_LEN} style={{ animation: "draw-h 0.18s ease-out 0.16s forwards" }} />
                              </>
                            )}
                          </svg>
                        )}
                        {L && activeZoneData && (
                          <div key={`box-${activeZone}`} style={{ position: "absolute", left: L.bx, top: L.by, width: BOX_W, background: "#fff", border: `1px solid ${calloutBorder}`, borderRadius: 8, overflow: "hidden", zIndex: 20, pointerEvents: "none", opacity: 0, animation: `fade-callout 0.18s ease-out ${L.mode === "straight" ? "0.24s" : "0.36s"} forwards` }}>
                            <div style={{ background: calloutHeaderBg, padding: "6px 12px", borderBottom: `0.5px solid ${calloutBorder}` }}>
                              <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: calloutTitleColor, margin: "0 0 1px" }}>Problem</p>
                              <p style={{ fontSize: 14, fontWeight: 700, color: calloutTitleColor, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toTitleCase(activeZoneData.label)}</p>
                            </div>
                            <div style={{ padding: "6px 12px" }}>
                              <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", margin: "0 0 2px" }}>What was detected</p>
                              <p style={{ fontSize: 12, color: "#2c2c2a", lineHeight: 1.5, margin: 0 }}>{activeZoneData.detail || activeZoneData.label}</p>
                            </div>
                          </div>
                        )}
                        {result.zones.map((z, i) => <ZoneDot key={i} idx={i} z={z} isClean={isClean} activeIdx={activeZone} setActiveIdx={setActiveZone} />)}
                      </div>
                    );
                  })()}
                </div>

                {/* Image actions */}
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
                <button onClick={analyse} style={{ width: "100%", padding: "12px", background: "#2c2c2a", color: "#F1EFE8", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                  Analyse image
                </button>
              )}

              {/* Re-analyse when result exists */}
              {result && !loading && !revealing && (
                <button onClick={analyse} style={{ width: "100%", padding: "10px", background: "#fff", color: "#2c2c2a", border: "0.5px solid #D3D1C7", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
                  Re-analyse
                </button>
              )}

              <p style={{ fontSize: 11, color: "#B4B2A9", textAlign: "center", lineHeight: 1.6 }}>
                Results are probabilistic and should not be used as sole evidence of authenticity.
              </p>
            </div>

            {/* ── Right column: results (scrollable) ── */}
            <div className="right-col" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px 16px" }}>

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
                <div style={{ background: revealMeta.bg, border: `1.5px solid ${revealMeta.border}`, borderRadius: 12, padding: "36px 16px", textAlign: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 40, marginBottom: 10, lineHeight: 1 }}>{revealMeta.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: revealMeta.color, marginBottom: 4 }}>{revealMeta.text}</div>
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
                      <span style={{ fontSize: 40, fontWeight: 500, color: "#2c2c2a" }}>{result.overall_risk_score ?? 0}</span>
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
                </>
              )}

              {/* Empty right panel before scan */}
              {!result && !loading && !revealing && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", color: "#B4B2A9", gap: 8 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D3D1C7" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <p style={{ fontSize: 13, margin: 0 }}>Results will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
