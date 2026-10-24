import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {widget ? <WidgetWindow kind={widget.kind} id={widget.id} /> : <App />}
  </StrictMode>,
)
