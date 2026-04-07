import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App' // Ini akan memanggil App.tsx yang sudah berisi Google Classroom

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)