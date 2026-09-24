import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";

/**
 * Creates a validation pipe using a Zod schema.
 *
 * When validation fails, throws BadRequestException with:
 * ```json
 * {
 *   "message": "error1; error2",
 *   "errors": [ { code, path, message, ... } ]
 * }
 * ```
 *
 * @example
 * ```typescript
 * @Get()
 * @UsePipes(new (createZodPipe(MySchema))())
 * async list(@Query() query: MyDto) { ... }
 * ```
 *
 * @param schema - Zod schema to validate against
 * @returns PipeTransform class that validates and transforms data
 * @throws BadRequestException when validation fails
 */
export function createZodPipe<T>(schema: z.ZodType<T, any, any>) {
  return class implements PipeTransform {
    transform(value: unknown, _metadata: ArgumentMetadata): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const msg = result.error.issues.map((e) => e.message).join("; ");
        throw new BadRequestException({
          message: msg,
          errors: result.error.issues,
        });
      }
      return result.data as T;
    }
  };
}

/**
 * Parse a ZodError and extract summary information for logging.
 * @internal Used internally by validation pipe, exposed for testing/debugging.
 */
export function formatZodError(error: z.ZodError<unknown>): string {
  return error.issues
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join(".")} ` : "";
      return `${path}${e.message}`;
    })
    .join("; ");
}
