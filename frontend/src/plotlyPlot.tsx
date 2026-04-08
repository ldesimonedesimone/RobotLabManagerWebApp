import type { ComponentType, CSSProperties } from 'react'
import type { Data, Layout } from 'plotly.js'
import PlotImport from 'react-plotly.js'

type PlotProps = {
  data: Data[]
  layout?: Partial<Layout>
  config?: { responsive?: boolean; displayModeBar?: boolean }
  style?: CSSProperties
}

function resolvePlotComponent(): ComponentType<PlotProps> {
  const mod = PlotImport as unknown
  if (typeof mod === 'function') {
    return mod as ComponentType<PlotProps>
  }
  if (mod !== null && typeof mod === 'object' && 'default' in mod) {
    const d = (mod as { default: unknown }).default
    if (typeof d === 'function') {
      return d as ComponentType<PlotProps>
    }
  }
  throw new Error(
    'react-plotly.js: expected a component export; check Vite interop / reinstall deps.',
  )
}

export const Plot = resolvePlotComponent()
