import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { preloadClaims } from './utils/claims.ts';

preloadClaims().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}).catch((err) => {
  console.error('Failed to load claims data:', err);
  document.getElementById('root')!.innerHTML = '<p style="padding:2rem;color:red">Failed to load claims data.</p>';
});
