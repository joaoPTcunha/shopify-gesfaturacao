import { authenticate } from "../../shopify.server";

export const loader = async ({ request }) => {
  try {
    const authResult = await authenticate.admin(request);
    if (authResult.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/ges-orders" },
      });
    }
    // authenticate.admin handles redirects/OAuth
    return null;
  } catch (error) {
    console.error("Error in auth loader:", error);
    if (error instanceof Response) {
      return error;
    }
    return new Response("Authentication error", { status: 500 });
  }
};

export default function Auth() {
  return null;
}
