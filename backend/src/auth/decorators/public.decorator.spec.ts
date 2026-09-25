import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public decorator', () => {
  it('exports IS_PUBLIC_KEY used by JwtAuthGuard metadata checks', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });

  it('returns a SetMetadata decorator factory for isPublic=true', () => {
    const decorator = Public();
    expect(typeof decorator).toBe('function');

    // Apply to a dummy handler to verify Nest metadata is set
    class TestController {
      @Public()
      adminRoute() {
        return true;
      }
    }

    const metadata = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      TestController.prototype.adminRoute,
    );
    expect(metadata).toBe(true);
  });
});
