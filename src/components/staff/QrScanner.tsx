'use client';

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertTriangle } from 'lucide-react';

/**
 * Camera-based QR scanner. Decodes the confirmation page's QR (which
 * encodes `{origin}/booking/{id}`) and hands back just the trailing id
 * segment — the caller looks that up via the staff/admin booking APIs
 * rather than opening the public customer page.
 */
export function QrScanner({ onScan, onClose }: { onScan: (bookingId: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        if (!cancelled) setError('Could not access the camera. Check permissions and try again.');
      }
    }

    function extractBookingId(raw: string): string | null {
      // Accept a full confirmation/booking URL or a bare id.
      try {
        const url = new URL(raw);
        const parts = url.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('booking');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      } catch {
        // Not a URL — fall through to treating it as a bare id.
      }
      return /^[A-Za-z0-9_-]{1,64}$/.test(raw.trim()) ? raw.trim() : null;
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code?.data) {
        const bookingId = extractBookingId(code.data);
        if (bookingId) {
          onScan(bookingId);
          return; // stop the loop — cleanup effect tears the camera down
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onScan intentionally not a dep; re-subscribing would restart the camera
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-label="Scan booking QR code">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Camera className="w-4 h-4 text-orange-600" /> Scan QR pass
          </span>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-square">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs font-semibold text-red-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <p className="px-4 py-3 text-[11px] font-medium text-slate-500 text-center">
          Point the camera at the customer&rsquo;s QR pass.
        </p>
      </div>
    </div>
  );
}
