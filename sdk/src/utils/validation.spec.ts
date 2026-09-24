import {
  validateCreateRaffleInput,
  CreateRaffleInput,
} from './validation';
import { TikkaSdkError, TikkaSdkErrorCode } from './errors';

describe('validateCreateRaffleInput', () => {
  const validInput: CreateRaffleInput = {
    ticketPrice: '10000000',
    maxTickets: 10,
    durationInSeconds: 86400,
  };

  it('accepts a form-valid payload', () => {
    expect(() => validateCreateRaffleInput(validInput)).not.toThrow();
  });

  it('rejects empty ticketPrice', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, ticketPrice: '' }),
    ).toThrow(TikkaSdkError);
    expect(() =>
      validateCreateRaffleInput({ ...validInput, ticketPrice: '' }),
    ).toThrow('ticketPrice must be a non-empty string');
  });

  it('rejects zero maxTickets', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, maxTickets: 0 }),
    ).toThrow(TikkaSdkError);
    expect(() =>
      validateCreateRaffleInput({ ...validInput, maxTickets: 0 }),
    ).toThrow('maxTickets must be a positive integer');
  });

  it('rejects negative maxTickets', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, maxTickets: -5 }),
    ).toThrow(TikkaSdkError);
  });

  it('rejects zero durationInSeconds', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, durationInSeconds: 0 }),
    ).toThrow(TikkaSdkError);
    expect(() =>
      validateCreateRaffleInput({ ...validInput, durationInSeconds: 0 }),
    ).toThrow('durationInSeconds must be a positive integer');
  });

  it('rejects negative durationInSeconds', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, durationInSeconds: -3600 }),
    ).toThrow(TikkaSdkError);
  });

  it('rejects fractional durationInSeconds', () => {
    expect(() =>
      validateCreateRaffleInput({ ...validInput, durationInSeconds: 12.5 }),
    ).toThrow(TikkaSdkError);
  });

  it('accepts boundary values', () => {
    expect(() =>
      validateCreateRaffleInput({
        ticketPrice: '1',
        maxTickets: 1,
        durationInSeconds: 1,
      }),
    ).not.toThrow();
  });
});
