declare module 'qrcode-svg' {
  export type QRCodeOptions = {
    content: string
    width?: number
    height?: number
    color?: string
    background?: string
    ecl?: 'L' | 'M' | 'Q' | 'H' | string
  }

  export default class QRCode {
    constructor(options: QRCodeOptions)
    svg(): string
  }
}
