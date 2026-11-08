import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStorage } from './data/storage';
import { initMotion } from './motion';
import { initTheme } from './theme';
import { startOpenedFiles } from './platform/openedFiles';
import { showWindowAfterPaint } from './platform/window';
import { startUpdates } from './platform/updates';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

initMotion();
initTheme();
// The desktop window stays hidden until the themed paper is on screen: no white flash.
showWindowAfterPaint();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Recover crash edits and load the job list before the first paint, so a job
// route never flashes "Job not found". startStorage reports failures itself.
void startStorage().finally(() => {
  // After storage, so a .kerfjob opened from Explorer imports into a loaded list.
  void startOpenedFiles();
  void startUpdates();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
