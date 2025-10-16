import { json, redirect } from "@remix-run/node";
import { authenticate } from "../../../shopify.server";

export const loader = async ({ request }) => {
  try {
    console.log("Auth login loader called with URL:", request.url);
    const { session, redirect: authRedirect } =
      await authenticate.admin(request);

    if (authRedirect) {
      return authRedirect;
    }

    return json({ authenticated: false }, { status: 401 });
  } catch (error) {
    console.error("Error in auth.login loader:", error);
    return json(
      { error: "Authentication failed", details: error.message },
      { status: 500 },
    );
  }
};

export const action = async ({ request }) => {
  try {
    console.log("Auth login action called");
    const { session, redirect: authRedirect } =
      await authenticate.admin(request);

    if (authRedirect) {
      return authRedirect;
    }

    return redirect("/gesfaturacao/dashboard");
  } catch (error) {
    console.error("Error in auth.login action:", error);
    return json(
      { error: "Authentication failed", details: error.message },
      { status: 500 },
    );
  }
};
