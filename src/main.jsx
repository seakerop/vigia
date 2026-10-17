import { createRoot } from 'react-dom/client';
import { VigiaProvider } from './lib/store.jsx';
import App from './App.jsx';
import './styles.css';

// Sin StrictMode a propósito: el doble montaje de efectos en dev duplicaría
// las llamadas a Binance/Yahoo (mismo criterio que en Bóveda).
createRoot(document.getElementById('root')).render(
  <VigiaProvider>
    <App />
  </VigiaProvider>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
