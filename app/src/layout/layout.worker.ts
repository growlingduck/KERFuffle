import { handleRequest } from './protocol';
import type { LayoutAnswer, LayoutRequest } from './protocol';

/** The layout worker: runs the sheet optimizer off the main thread, so typing and scrolling never wait for it. */
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (answer: LayoutAnswer) => void;
};

scope.onmessage = (event) => handleRequest(event.data, (answer) => scope.postMessage(answer));
