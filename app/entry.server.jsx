import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";

/**
 * Entry server simplificado para renderizar a app Remix em JSX
 */
export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
) {
  const callbackName = isbot(request.headers.get("user-agent") || "")
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve({
            body,
            status: responseStatusCode,
            headers: responseHeaders,
          });
          pipe(body);
        },
        onError: (err) => {
          console.error(err);
          responseHeaders.set("Content-Type", "text/plain");
          resolve({
            body: "Internal Server Error",
            status: 500,
            headers: responseHeaders,
          });
          abort();
        },
      },
    );
  });
}
