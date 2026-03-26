import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import { ZodSchema } from "zod";

/** Validates payload with a Zod schema; throws BadRequestException on failure. */
export function createZodPipe<T>(schema: ZodSchema<T>) {
  return class implements PipeTransform {
    transform(value: unknown, _metadata: ArgumentMetadata): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.errors.map((e) => e.message).join("; ");
        throw new BadRequestException({
          message: msg,
          errors: result.error.errors,
        });
      }
      return result.data;
    }
  };
}
