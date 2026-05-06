import QRCode from 'qrcode-svg'
import type { TracerBulletScan } from '../tracer/storage'

type Props = {
  scan: TracerBulletScan
  baseUrl: string
  size?: number
}

export function QrInvite({ scan, baseUrl, size = 256 }: Props) {
  const url = `${baseUrl}/join?t=${scan.joinToken}`
  const qr = new QRCode({ content: url, width: size, height: size, color: '#000000', background: '#ffffff', ecl: 'M' })
  const svgString = qr.svg()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: svgString }} />
      <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', letterSpacing: '0.1em' }}>
        {scan.shortCode}
      </span>
    </div>
  )
}
