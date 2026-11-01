import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStorage } from './data/storage';
import { initMotion } from './motion';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

initMotion();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Recover crash edits and load the job list before the first paint, so a job
// route never flashes "Job not found". startStorage reports failures itself.
void startStorage().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
