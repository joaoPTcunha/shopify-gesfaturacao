import { authenticate } from "./shopify.server";

export const loader = async ({ request }) => {
  return authenticate.admin(request);
};
