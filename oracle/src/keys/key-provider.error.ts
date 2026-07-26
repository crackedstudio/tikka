export class KeyProviderError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyProviderError';
  }
}
