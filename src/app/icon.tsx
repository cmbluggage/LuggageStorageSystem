import { ImageResponse } from 'next/og';

// Browser-tab favicon: the same orange logo mark as SiteHeader (three white bars).
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#e8620a',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        <div style={{ width: 5, height: 10, borderRadius: 1, background: '#fff' }} />
        <div style={{ width: 5, height: 15, borderRadius: 1, background: '#fff' }} />
        <div style={{ width: 5, height: 12, borderRadius: 1, background: '#fff' }} />
        </div>
      </div>
    ),
    size,
  );
}
