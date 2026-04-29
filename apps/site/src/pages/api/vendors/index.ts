import type { APIRoute } from "astro";
import { getVendorIntelligenceDatabase } from "@devngn/vendors";
import { guardVendorApiRequest, vendorApiJson } from "../../../lib/vendor-api";

export const prerender = false;

export const GET: APIRoute = ({ request, site }) => {
  const guard = guardVendorApiRequest(request);

  if (guard instanceof Response) {
    return guard;
  }

  const database = getVendorIntelligenceDatabase();

  return vendorApiJson(
    {
      ...database,
      access: {
        subscriptionLevel: guard.access.subscriptionLevel,
        accountId: guard.access.accountId,
      },
      links: {
        self: new URL("/api/vendors", site ?? request.url).toString(),
        registry: new URL(
          "/registry/v1/vendors.json",
          site ?? request.url,
        ).toString(),
      },
    },
    guard.headers,
  );
};
