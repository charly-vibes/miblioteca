import './styles.css'
import { mountAppHeader } from './pwa/AppHeader'
import { CaptureView } from './tracer/CaptureView'

const root = document.getElementById('root')!
mountAppHeader(root)
new CaptureView(root)
