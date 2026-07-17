import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppV2 from './AppV2.tsx'

const enableV2 = import.meta.env.VITE_EDITOR_V2 === 'true';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {enableV2 ? <AppV2 /> : <App />}
  </StrictMode>,
)
