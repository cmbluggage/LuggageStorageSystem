'use client';

import React, { useState } from 'react';
import { QrCode } from 'lucide-react';
import { QrScanner } from './QrScanner';

/** Opens the camera scanner and hands the decoded booking id to `onScan`. */
export function QrScanButton({ onScan }: { onScan: (bookingId: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Scan booking QR code"
        title="Scan QR pass"
        className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 hover:bg-orange-100 text-slate-700
                   hover:text-orange-700 flex items-center justify-center transition-colors cursor-pointer"
      >
        <QrCode className="w-4 h-4" />
      </button>

      {open && (
        <QrScanner
          onClose={() => setOpen(false)}
          onScan={(id) => {
            setOpen(false);
            onScan(id);
          }}
        />
      )}
    </>
  );
}
