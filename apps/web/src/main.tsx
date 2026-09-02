import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthGate } from './features/auth/AuthGate';
import { AuthenticatedAppShell } from './features/auth/AuthenticatedAppShell';
import { AuthProvider } from './features/auth/AuthProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <AuthenticatedAppShell>
            <App />
          </AuthenticatedAppShell>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);