import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { JwtPayload } from "../jwt.strategy";

/** Extract the authenticated user payload from the request. */
export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? (user?.[data] as string) : user;
  },
);
