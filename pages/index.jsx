"use client";
import { useState, useRef, useCallback } from "react";

function getVerdict(ai, df) {
  if (ai >= 0.70 && df >= 0.70) return { label: "AI-Generated Deepfake", tier: "danger" };
  if (df >= 0.70) return { label: "Deepfake Detected", tier: "danger" };
  if (ai >= 0.70) return { label: "AI-Generated", tier: "danger" };
  if (ai >= 0.55 || df >= 0.55) return { label: "Likely Manipulated", tier: "warning", lowConf: true };
  return { label: "Likely Authentic", tier: "success" };
}

const tierColors = {
  danger:  { bg: "#FCEBEB", text: "#791F1F", border: "#F09595" },
  warning: { bg: "#FAEEDA", text: "#633806", border: "#FAC775" },
  success: { bg: "#EAF3DE", text: "#27500A", border: "#C0DD97" },
};

const barColor = (v) => v >= 0.70 ? "#E24B4A" : v >= 0.55 ? "#EF9F27" : "#639922";

function ScoreBar({ label, value }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
        <span style={{ color: "#5F5E5A" }}>{label}</span>
        <span style={{ fontWeight: 500, color: "#2c2c2a" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "#F1EFE8", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor(value), borderRadius: 99, transition: "width 0.7s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const c = tierColors[verdict.tier];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "4px 14px", fontSize: 13, fontWeight: 500 }}>
        {verdict.label}
      </span>
      {verdict.lowConf && (
        <span style={{ fontSize: 11, color: "#854F0B" }}>Low confidence — treat with caution</span>
      )}
    </div>
  );
}

function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
function IconSwap() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>;
}
function IconScan() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
}
function IconSpinner() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite", display: "block" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}
function IconUpload() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}

const card = { background: "#fff", border: "0.5px solid #D3D1C7", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
const cardLabel = { fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888780", marginBottom: 8, fontWeight: 500 };
const STEPS = ["", "Scanning for artifacts...", "Mapping suspicious regions...", "Running forensic analysis..."];

export default function App() {
  const [imgUrl,    setImgUrl]    = useState(null);
  const [imgB64,    setImgB64]    = useState(null);
  const [imgMime,   setImgMime]   = useState("image/jpeg");
  const [drag,      setDrag]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState(0);
  const [result,    setResult]    = useState(null);
  const [showHeat,  setShowHeat]  = useState(false);
  const [copied,    setCopied]    = useState(false);
  const fileRef    = useRef();
  const replaceRef = useRef();

  const processFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImgMime(file.type || "image/jpeg");
    const r = new FileReader();
    r.onload = (e) => {
      setImgUrl(e.target.result);
      setImgB64(e.target.result.split(",")[1]);
      setResult(null);
      setShowHeat(false);
    };
    r.readAsDataURL(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    processFile(e.dataTransfer.files[0]);
  }, []);

  const analyse = async () => {
    if (!imgB64 || !imgMime) return;
    setLoading(true); setResult(null); setShowHeat(false); setStep(1);
    await new Promise(r => setTimeout(r, 1800));
    setStep(2);
    await new Promise(r => setTimeout(r, 1600));
    setStep(3);

    try {
      const byteStr = atob(imgB64);
      const arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: imgMime });

      const form = new FormData();
      form.append("image", blob, "image.jpg");

      const res  = await fetch("/api/analyse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      const verdict = getVerdict(data.ai, data.df);
      setResult({
        ai: data.ai,
        df: data.df,
        verdict,
        claudeText: data.finding,
        zones: data.zones ?? [],
      });
      setShowHeat(verdict.tier === "danger" && (data.zones?.length ?? 0) > 0);
    } catch (err) {
      setResult({
        ai: 0, df: 0,
        verdict: getVerdict(0, 0),
        claudeText: "Analysis failed: " + err.message,
        zones: [],
      });
    }

    setLoading(false); setStep(0);
  };

  const reset = () => {
    setImgUrl(null); setImgB64(null); setResult(null);
    setShowHeat(false); setLoading(false); setStep(0);
  };

  const copyAnalysis = () => {
    if (result?.claudeText) {
      navigator.clipboard.writeText(result.claudeText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const progress = step === 1 ? "30%" : step === 2 ? "60%" : step === 3 ? "85%" : "0%";

  return (
    <div style={{ background: "#F1EFE8", minHeight: "100vh", padding: "0 0 40px" }}>
      <style>{`
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
        @keyframes pulsebox { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.72; } }
        .scan-line { position: absolute; left: 0; right: 0; height: 2px; background: rgba(55,138,221,0.8); animation: scanline 1.8s linear infinite; pointer-events: none; }
        .scan-box  { position: absolute; border: 1.5px solid rgba(55,138,221,0.65); border-radius: 4px; background: rgba(55,138,221,0.1); pointer-events: none; animation: pulsebox 1.4s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #D3D1C7", padding: "14px 20px 10px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <div style={{ width: 22, height: 22, background: "#2c2c2a", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F1EFE8" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 17, fontWeight: 500, color: "#2c2c2a", margin: 0 }}>DeepScan</h1>
          </div>
          <p style={{ fontSize: 12, color: "#888780", margin: 0 }}>Detect AI-generated images &amp; deepfakes</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 0" }}>

        {!imgUrl ? (
          /* ── Upload zone ── */
          <div
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            style={{
              border: `1.5px dashed ${drag ? "#378ADD" : "#B4B2A9"}`,
              borderRadius: 16, padding: "48px 20px", textAlign: "center",
              cursor: "pointer",
              background: drag ? "#E6F1FB" : "#e8e7e2",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><IconUpload /></div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "#444441", margin: "0 0 4px" }}>Drop an image here</p>
            <p style={{ fontSize: 12, color: "#888780", margin: 0 }}>or tap to browse — JPEG, PNG, WebP</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => processFile(e.target.files[0])} />
          </div>
        ) : (
          <>
            {/* ── Image card ── */}
            <div style={{ ...card, padding: 10 }}>
              <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                <img src={imgUrl} alt="Uploaded" style={{ width: "100%", display: "block", borderRadius: 8 }} />

                {/* Scan overlay */}
                {loading && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: "rgba(44,44,42,0.32)" }} />
                    <div className="scan-line" />
                    {step >= 1 && <div className="scan-box" style={{ left: "8%",  top: "6%",  width: "36%", height: "46%", animationDelay: "0s" }} />}
                    {step >= 2 && <div className="scan-box" style={{ left: "55%", top: "5%",  width: "30%", height: "28%", animationDelay: "0.35s" }} />}
                    {step >= 2 && <div className="scan-box" style={{ left: "18%", top: "60%", width: "55%", height: "24%", animationDelay: "0.7s" }} />}
                    <div style={{ position: "absolute", bottom: 7, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 10, color: "rgba(255,255,255,0.92)", background: "rgba(44,44,42,0.65)", borderRadius: 4, padding: "2px 8px" }}>
                      {STEPS[step]}
                    </div>
                  </div>
                )}

                {/* Heatmap overlay — zones from Claude */}
                {!loading && showHeat && result?.zones?.length > 0 && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 8 }}>
                    {result.zones.map((z, i) => (
                      <div key={i} style={{
                        position: "absolute",
                        left: `${z.left}%`, top: `${z.top}%`,
                        width: `${z.width}%`, height: `${z.height}%`,
                        borderRadius: 4,
                        border: "1.5px solid rgba(226,75,74,0.65)",
                        background: "rgba(226,75,74,0.13)",
                      }}>
                        <span style={{
                          position: "absolute", bottom: "100%", left: 0, marginBottom: 3,
                          fontSize: 9, color: "rgba(255,255,255,0.95)",
                          background: "rgba(163,45,45,0.8)", borderRadius: 3,
                          padding: "1px 5px", whiteSpace: "nowrap",
                          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {z.label}
                        </span>
                      </div>
                    ))}
                    <div style={{ position: "absolute", bottom: 7, right: 9, fontSize: 9, color: "rgba(255,255,255,0.9)", background: "rgba(44,44,42,0.55)", borderRadius: 4, padding: "2px 7px" }}>
                      Suspicious regions highlighted
                    </div>
                  </div>
                )}
              </div>

              {/* Image action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {result && (
                  <button onClick={() => setShowHeat(h => !h)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                    <IconScan />{showHeat ? "Hide heatmap" : "Show heatmap"}
                  </button>
                )}
                <button onClick={() => replaceRef.current.click()}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                  <IconSwap />Replace
                </button>
                <button onClick={reset}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12, padding: "6px 0", color: "#A32D2D", cursor: "pointer" }}>
                  <IconTrash />Remove
                </button>
                <input ref={replaceRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => processFile(e.target.files[0])} />
              </div>
            </div>

            {/* ── Analyse CTA ── */}
            {!result && !loading && (
              <button onClick={analyse} style={{
                display: "block", width: "100%", padding: "11px",
                background: "#2c2c2a", color: "#F1EFE8",
                border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 10,
              }}>
                Analyse image
              </button>
            )}

            {/* ── Loading bar ── */}
            {loading && (
              <div style={{ ...card, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: "#5F5E5A", margin: 0 }}>{STEPS[step]}</p>
                  <IconSpinner />
                </div>
                <div style={{ height: 3, background: "#F1EFE8", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: "#888780", width: progress, transition: "width 0.7s ease" }} />
                </div>
              </div>
            )}

            {/* ── Results ── */}
            {result && (
              <>
                <div style={card}>
                  <p style={cardLabel}>Verdict</p>
                  <VerdictBadge verdict={result.verdict} />
                </div>

                <div style={card}>
                  <p style={cardLabel}>Detection scores</p>
                  <ScoreBar label="AI-generated probability"    value={result.ai} />
                  <ScoreBar label="Deepfake / face manipulation" value={result.df} />
                  <p style={{ fontSize: 10, color: "#888780", margin: "4px 0 0" }}>
                    Scores above 70% indicate strong likelihood. 55–70% triggers a low-confidence warning.
                  </p>
                </div>

                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ ...cardLabel, margin: 0 }}>Forensic finding</p>
                    <button onClick={copyAnalysis} style={{
                      fontSize: 11, padding: "3px 10px", cursor: "pointer",
                      color:       copied ? "#27500A" : "#5F5E5A",
                      borderColor: copied ? "#C0DD97" : undefined,
                      background:  copied ? "#EAF3DE" : undefined,
                    }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.75, color: "#2c2c2a", margin: 0 }}>
                    {result.claudeText}
                  </p>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <button onClick={analyse} style={{
                    display: "block", width: "100%", padding: "10px",
                    background: "#fff", color: "#2c2c2a",
                    border: "0.5px solid #D3D1C7", borderRadius: 10,
                    fontSize: 13, cursor: "pointer", marginBottom: 6,
                  }}>
                    Re-analyse
                  </button>
                  <button onClick={reset} style={{
                    display: "block", width: "100%", padding: "10px",
                    background: "#2c2c2a", color: "#F1EFE8",
                    border: "none", borderRadius: 10,
                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}>
                    Scan another image
                  </button>
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
