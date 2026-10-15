import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import DialogHost from './components/common/DialogHost.jsx'
import { observeLabelAssociation } from './utils/labelAssociation'

observeLabelAssociation(document.body)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <DialogHost />
  </StrictMode>,
)

