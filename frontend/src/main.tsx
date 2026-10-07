import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { RefsProvider } from './lib/refs';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RefsProvider>
          <App />
        </RefsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
