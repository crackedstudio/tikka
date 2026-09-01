/**
 * Playwright adapter for the shared MSW handlers.
 *
 * This reuses the exact same `routeDefs` that back the Vitest unit specs
 * (see src/test/handlers/index.ts), so the unit and e2e suites share one source
 * of truth and can never drift apart. MSW's Node request interception cannot see
 * the browser's network traffic, so we register the same resolvers as Playwright
 * routes and execute them in the test process.
 */

import type { Page, Route } from '@playwright/test';
import { routeDefs, type RouteDef } from '../../src/test/handlers';

function pathToRegExp(path: string): RegExp {
  const pattern = path
    .replace(/:[^/]+/g, '([^/]+)')
    .replace(/\//g, '\\/');
  return new RegExp(`^${pattern}$`);
}

function extractParams(def: RouteDef, pathname: string): Record<string, string> {
  const matches = pathToRegExp(def.path).exec(pathname);
  const paramNames = (def.path.match(/:[^/]+/g) ?? []).map((p) => p.slice(1));
  const params: Record<string, string> = {};
  if (matches) {
    paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(matches[i + 1]);
    });
  }
  return params;
}

async function handleRoute(def: RouteDef, route: Route): Promise<void> {
  const request = route.request();

  if (request.method().toUpperCase() !== def.method.toUpperCase()) {
    await route.continue();
    return;
  }

  const url = new URL(request.url());
  const params = extractParams(def, url.pathname);

  const init: RequestInit = {
    method: request.method(),
    headers: request.headers(),
  };
  if (!['GET', 'HEAD'].includes(request.method().toUpperCase())) {
    const body = request.postData();
    if (body !== null) init.body = body;
  }

  const fetchRequest = new Request(request.url(), init);
  const { status, body } = await def.resolver({ request: fetchRequest, params });

  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Apply the shared API handlers to a Playwright page. Call once per page (e.g. in
 * a `beforeEach`) to get deterministic, fixture-seeded responses for the auth and
 * raffle endpoints without per-spec `page.route` boilerplate.
 */
export async function applySharedHandlers(page: Page): Promise<void> {
  for (const def of routeDefs) {
    const regex = pathToRegExp(def.path);
    await page.route(
      (url) => regex.test(url.pathname),
      (route) => handleRoute(def, route)
    );
  }
}
