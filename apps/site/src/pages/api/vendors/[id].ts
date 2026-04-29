import type { APIRoute } from "astro";
import { getVendorIntelligenceByIdOrAlias } from "@devngn/vendors";
import {
  guardVendorApiRequest,
  vendorApiError,
  vendorApiJson,
} from "../../../lib/vendor-api";

export const prerender = false;

const vendorIdPattern = /^[a-z0-9][a-z0-9-]{0,80}$/;

export const GET: APIRoute = ({ params, request, site }) => {
  const guard = guardVendorApiRequest(request);

  if (guard instanceof Response) {
    return guard;
  }

  const id = params.id;

  if (id === undefined || !vendorIdPattern.test(id)) {
    return vendorApiError(
      400,
      "invalid_vendor_id",
      "Vendor identifiers must use lowercase letters, numbers, and hyphens.",
      guard.headers,
    );
  }

  const vendor = getVendorIntelligenceByIdOrAlias(id);

  if (vendor === null) {
    return vendorApiError(
      404,
      "vendor_not_found",
      "No vendor intelligence is available for that identifier.",
      guard.headers,
    );
  }

  return vendorApiJson(
    {
      ...vendor,
      access: {
        subscriptionLevel: guard.access.subscriptionLevel,
        accountId: guard.access.accountId,
      },
      links: {
        self: new URL(`/api/vendors/${id}`, site ?? request.url).toString(),
        collection: new URL("/api/vendors", site ?? request.url).toString(),
        publicRegistry: new URL(
          "/registry/v1/vendors.json",
          site ?? request.url,
        ).toString(),
      },
    },
    guard.headers,
  );
};
