import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (root === null) throw new Error('élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <App version={__APP_VERSION__} />
  </StrictMode>,
);
