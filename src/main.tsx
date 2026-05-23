import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AccountProvider } from './AccountContext.tsx';
import { AuthProvider } from './AuthContext.tsx';
import { ToastProvider } from './ToastContext.tsx';

// Use the Client ID from the environment variable
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AuthProvider>
        <AccountProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AccountProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);
