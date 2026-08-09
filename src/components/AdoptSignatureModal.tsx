"use client";

import { useEffect, useRef, useState } from "react";

type Tab = "type" | "draw" | "upload";

const SIGNATURE_FONTS: { label: string; family: string; loadSpec: string }[] = [
  { label: "Dancing Script", family: "'Dancing Script', cursive",  loadSpec: "600 56px 'Dancing Script'" },
  { label: "Great Vibes",    family: "'Great Vibes', cursive",     loadSpec: "400 56px 'Great Vibes'" },
  { label: "Sacramento",     family: "'Sacramento', cursive",      loadSpec: "400 56px 'Sacramento'" },
  { label: "Allura",         family: "'Allura', cursive",          loadSpec: "400 56px 'Allura'" },
];

type Props = {
  open: boolean;
  initialName?: string;
  savedSignature?: string;
  onAdopt: (dataUrl: string, remember: boolean) => void;
  onClose: () => void;
};

export default function AdoptSignatureModal({
  open,
  initialName = "",
  savedSignature,
  onAdopt,
  onClose,
}: Props) {
  const [tab, setTab]                   = useState<Tab>("type");
  const [typedName, setTypedName]       = useState(initialName);
  const [selectedFont, setSelectedFont] = useState(0);
  const [remember, setRemember]         = useState(true);
  const [usingSaved, setUsingSaved]     = useState(!!savedSignature);
  const [hasDrawing, setHasDrawing]     = useState(false);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [isAdopting, setIsAdopting]     = useState(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawingRef  = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setTab("type");
    setTypedName(initialName);
    setSelectedFont(0);
    setRemember(true);
    setUsingSaved(!!savedSignature);
    setHasDrawing(false);
    setUploadedDataUrl(null);
    setIsAdopting(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // (Re)initialise draw canvas whenever the draw tab becomes visible
  useEffect(() => {
    if (!open || tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width  = canvas.clientWidth  * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#0f334b";
    setHasDrawing(false);
  }, [open, tab]);

  // ── Draw handlers ──────────────────────────────────────────────────────────
  function getPoint(canvas: HTMLCanvasElement, e: React.PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    const pt = getPoint(canvas, e);
    ctx?.beginPath();
    ctx?.moveTo(pt.x, pt.y);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pt = getPoint(canvas, e);
    ctx?.lineTo(pt.x, pt.y);
    ctx?.stroke();
  }
  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasDrawing(true);
  }
  function clearDraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  // ── Upload handler ────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadedDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Render typed text to a PNG data URL ───────────────────────────────────
  async function renderTypedSignature(): Promise<string> {
    const font = SIGNATURE_FONTS[selectedFont];
    try { await document.fonts.load(font.loadSpec); } catch { /* best-effort */ }

    // Measure the text first so the canvas is tight around it
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = font.loadSpec;
    const metrics = measure.measureText(typedName.trim());
    const textW = metrics.width;
    const ascent  = metrics.actualBoundingBoxAscent  || 50;
    const descent = metrics.actualBoundingBoxDescent || 10;

    const PAD_X = 12;
    const PAD_Y = 8;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.ceil(textW + PAD_X * 2);
    canvas.height = Math.ceil(ascent + descent + PAD_Y * 2);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = "#0f334b";
    ctx.font         = font.loadSpec;
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(typedName.trim(), PAD_X, PAD_Y + ascent);
    return canvas.toDataURL("image/png");
  }

  // ── Adopt ─────────────────────────────────────────────────────────────────
  async function handleAdopt() {
    if (usingSaved && savedSignature) {
      onAdopt(savedSignature, false);
      return;
    }
    setIsAdopting(true);
    try {
      let dataUrl: string;
      if (tab === "type") {
        dataUrl = await renderTypedSignature();
      } else if (tab === "draw") {
        dataUrl = canvasRef.current!.toDataURL("image/png");
      } else {
        dataUrl = uploadedDataUrl!;
      }
      onAdopt(dataUrl, remember);
    } finally {
      setIsAdopting(false);
    }
  }

  const canAdopt = usingSaved && savedSignature
    ? true
    : tab === "type"
      ? typedName.trim().length > 0
      : tab === "draw"
        ? hasDrawing
        : uploadedDataUrl !== null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-navy">Adopt your signature</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              By clicking Adopt &amp; Sign you agree this is your legal signature.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 flex-none text-xl leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          {/* ── Saved signature ──────────────────────────────────────────── */}
          {savedSignature && (
            <div className={`rounded-xl border-2 px-4 py-3 ${usingSaved ? "border-teal bg-teal/5" : "border-gray-100"}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-navy">Your saved signature</span>
                {usingSaved ? (
                  <button
                    type="button"
                    onClick={() => setUsingSaved(false)}
                    className="text-xs font-medium text-teal hover:underline"
                  >
                    Change
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUsingSaved(true)}
                    className="text-xs font-medium text-teal hover:underline"
                  >
                    Use this
                  </button>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={savedSignature} alt="Saved signature" className="h-12 object-contain" />
            </div>
          )}

          {/* ── Tabs + content (hidden when using saved) ─────────────────── */}
          {!usingSaved && (
            <>
              {/* Tab switcher */}
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                {(["type", "draw", "upload"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                      tab === t
                        ? "bg-white text-navy shadow-sm"
                        : "text-gray-500 hover:text-navy"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Type tab */}
              {tab === "type" && (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Type your name"
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                  />
                  <div className="flex flex-col gap-2">
                    {SIGNATURE_FONTS.map((font, i) => (
                      <button
                        key={font.label}
                        type="button"
                        onClick={() => setSelectedFont(i)}
                        className={`flex items-center justify-between rounded-xl border-2 px-5 py-2 text-left transition-colors ${
                          selectedFont === i
                            ? "border-teal bg-teal/5"
                            : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <span
                          style={{
                            fontFamily: font.family,
                            fontSize: "30px",
                            lineHeight: 1.4,
                            color: "#0f334b",
                          }}
                        >
                          {typedName.trim() || "Your Name"}
                        </span>
                        {selectedFont === i && (
                          <svg
                            className="ml-2 flex-none text-teal"
                            width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Draw tab */}
              {tab === "draw" && (
                <div className="flex flex-col gap-2">
                  <canvas
                    ref={canvasRef}
                    className="h-36 w-full touch-none rounded-xl border-2 border-teal bg-white"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {hasDrawing
                        ? "Signature captured."
                        : "Sign above using your mouse or finger."}
                    </p>
                    <button
                      type="button"
                      onClick={clearDraw}
                      className="text-xs font-medium text-teal hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Upload tab */}
              {tab === "upload" && (
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="sigUpload"
                    className="flex h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 hover:border-teal hover:bg-teal/10 transition-colors"
                  >
                    {uploadedDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={uploadedDataUrl} alt="Uploaded signature" className="max-h-24 max-w-[90%] object-contain" />
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d8f96" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <p className="text-sm font-medium text-teal">Click to upload signature image</p>
                        <p className="text-xs text-gray-400">PNG or JPG</p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      id="sigUpload"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {uploadedDataUrl && (
                    <button
                      type="button"
                      onClick={() => { setUploadedDataUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="self-end text-xs font-medium text-teal hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Remember checkbox */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal/30"
                />
                <span className="text-sm text-gray-600">
                  Remember this signature for future documents
                </span>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdopt}
            disabled={!canAdopt || isAdopting}
            className="flex-1 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdopting ? "Applying…" : "Adopt & Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
