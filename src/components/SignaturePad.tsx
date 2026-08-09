"use client";

import { useRef, useEffect, useState } from "react";

type SignaturePadProps = {
  onChange: (dataUrl: string | null) => void;
};

function getPoint(canvas: HTMLCanvasElement, event: PointerEvent | React.PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export default function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#16384A";
    }
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    const point = getPoint(canvas, event);
    ctx?.beginPath();
    ctx?.moveTo(point.x, point.y);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getPoint(canvas, event);
    ctx?.lineTo(point.x, point.y);
    ctx?.stroke();
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
    setUploadedDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onChange(null);
  }

  function handleModeChange(nextMode: "draw" | "upload") {
    setMode(nextMode);
    handleClear();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedDataUrl(dataUrl);
      setHasSignature(true);
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => handleModeChange("draw")}
          className={
            mode === "draw"
              ? "rounded-full bg-navy px-4 py-1.5 text-white"
              : "rounded-full px-4 py-1.5 text-gray-400 hover:text-navy"
          }
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("upload")}
          className={
            mode === "upload"
              ? "rounded-full bg-navy px-4 py-1.5 text-white"
              : "rounded-full px-4 py-1.5 text-gray-400 hover:text-navy"
          }
        >
          Upload signature
        </button>
      </div>

      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          className="h-32 w-full touch-none rounded-xl border-2 border-teal bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      ) : (
        <label
          htmlFor="signatureUpload"
          className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal bg-teal/5 transition-colors hover:bg-teal/10"
        >
          {uploadedDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedDataUrl} alt="Uploaded signature" className="max-h-24 max-w-[90%] object-contain" />
          ) : (
            <>
              <p className="text-sm font-medium text-navy">Click to upload your signature</p>
              <p className="text-xs text-gray-500">PNG or JPG</p>
            </>
          )}
          <input
            ref={fileInputRef}
            id="signatureUpload"
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {hasSignature
            ? "Signature captured."
            : mode === "draw"
              ? "Sign above using your mouse or finger."
              : "Upload an image of your signature."}
        </p>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs font-medium text-teal hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
