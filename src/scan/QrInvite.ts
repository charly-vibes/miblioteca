import QRCode from 'qrcode-svg'
import type { TracerBulletScan } from '../tracer/storage'

type QrInviteOptions = {
  scan: TracerBulletScan
  baseUrl: string
  size?: number
}

export function createQrInvite({ scan, baseUrl, size = 256 }: QrInviteOptions): HTMLElement {
  const url = `${baseUrl}/join?t=${scan.joinToken}`
  const qr = new QRCode({ content: url, width: size, height: size, color: '#000000', background: '#ffffff', ecl: 'M' })
  const svgString = qr.svg()

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px'

  const qrDiv = document.createElement('div')
  qrDiv.innerHTML = svgString

  const code = document.createElement('span')
  code.style.cssText = 'font-family:monospace;font-size:1.25rem;letter-spacing:0.1em'
  code.textContent = scan.shortCode

  wrapper.append(qrDiv, code)
  return wrapper
}
