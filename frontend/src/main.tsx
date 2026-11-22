import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import App from './App.tsx'
import { WidgetWindow } from './components/Widgets/WidgetWindow'
import { WIDGET_KINDS, type WidgetKind } from './widgets/types'

function isWidgetKind(value: string | undefined): value is WidgetKind {
  return typeof value === 'string' && (WIDGET_KINDS as string[]).includes(value)
}

/**
 * A popped-out widget runs the same bundle in its own native window, so the
 * entry point has to pick the surface. The window label, `widget-<kind>-<id>`,
 * is the only thing that distinguishes it.
 */
function readWidgetTarget(): { kind: WidgetKind; id: string } | null {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return null
  }
  const label = getCurrentWindow().label
  if (!label.startsWith('widget-')) return null
  const [, kind, id] = label.split('-')
  if (!isWidgetKind(kind) || !id) return null
  return { kind, id }
}

const widget = readWidgetTarget()

// The webview brings its own browser chrome: right click offers Back, Refresh,
// Save as, Print and Inspect, and Alt+Left would navigate the shell away from
// the app. Aether draws its own menus, so both are turned off for every window.
document.addEventListener('contextmenu', (event) => event.preventDefault())
window.addEventListener('keydown', (event) => {
  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {widget ? <WidgetWindow kind={widget.kind} id={widget.id} /> : <App />}
    </MotionConfig>
  </StrictMode>,
)
