import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register the app-shell service worker in production only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('تعذر تسجيل Service Worker:', error);
    });
  });
}

window.addEventListener('load', () => {
  window.setTimeout(() => document.documentElement.classList.add('anim'), 1500);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
