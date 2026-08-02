import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RuntimeGate from './RuntimeGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeGate />
  </StrictMode>,
)
