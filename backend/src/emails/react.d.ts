declare module 'react' {
  export function createElement(...args: any[]): any;
  export type ReactElement = any;
}

declare module 'react/jsx-runtime' {
  export function jsx(...args: any[]): any;
  export function jsxs(...args: any[]): any;
  export const Fragment: any;
}

declare module 'react-dom/server' {
  export function renderToStaticMarkup(element: any): string;
  export function renderToString(element: any): string;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
