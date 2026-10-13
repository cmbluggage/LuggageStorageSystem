import { ImageResponse } from 'next/og';

// iOS home-screen icon: the SiteHeader logo mark, square (iOS applies its own corner mask).
export const size = { width: 180, height: 180 };
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
          borderRadius: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11 }}>
        <div style={{ width: 26, height: 58, borderRadius: 5, background: '#fff' }} />
        <div style={{ width: 26, height: 84, borderRadius: 5, background: '#fff' }} />
        <div style={{ width: 26, height: 68, borderRadius: 5, background: '#fff' }} />
        </div>
      </div>
    ),
    size,
  );
}
