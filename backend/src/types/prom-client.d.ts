declare module 'prom-client' {
  export class Counter<T = any> {
    constructor(opts: any);
    inc(val?: number): void;
  }

  export class Registry {
    metrics(): Promise<string>;
  }

  export function collectDefaultMetrics(opts?: any): void;
}
