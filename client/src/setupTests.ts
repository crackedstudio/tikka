import '@testing-library/jest-dom';
import 'whatwg-fetch';
import type React from 'react';

import ReactDOM from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rootMap = new WeakMap<Element, Root>();

if (!(ReactDOM as any).render) {
  // @ts-ignore
  ReactDOM.render = (element: unknown, container: Element | null, callback?: () => void) => {
    if (!container) return null;
    const root = createRoot(container as HTMLElement);
    rootMap.set(container, root);
    root.render(element as React.ReactNode, callback);
    return root;
  };
}

if (!(ReactDOM as any).unmountComponentAtNode) {
  // @ts-ignore
  ReactDOM.unmountComponentAtNode = (container: Element | null) => {
    if (!container) return false;
    const root = rootMap.get(container);
    if (!root) return false;
    root.unmount();
    rootMap.delete(container);
    return true;
  };
}
