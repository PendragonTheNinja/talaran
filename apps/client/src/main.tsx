import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './themes/stonehold.css'
import './lib/popupMotion.css'
import App from './App.tsx'
import { initTheme } from './lib/theme'
import { initChatSize } from './lib/chatSize'
import { watchPopupExits } from './lib/popupMotion'

initTheme()
initChatSize()
watchPopupExits()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)