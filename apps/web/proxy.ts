import { NextResponse, type NextRequest } from "next/server";
import { AUTH_REQUEST_PATH_HEADER } from "@/lib/auth/request-path";

function wantsSharedMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) {
    return false;
  }

  const accept = acceptHeader.toLowerCase();
  return accept.includes("text/markdown") || accept.includes("text/plain");
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (
    request.method === "GET" &&
    segments.length === 2 &&
    segments[0] === "shared" &&
    wantsSharedMarkdown(request.headers.get("accept"))
  ) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = `/api/shared/${segments[1]}/markdown`;
    return NextResponse.rewrite(rewrittenUrl);
  }

  const requestHeaders = new Headers(request.headers);
  // Overwrite incoming values; only the actual request URL is authoritative.
  requestHeaders.set(
    AUTH_REQUEST_PATH_HEADER,
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/shared/:path*",
    "/settings/:path*",
    "/sessions/:path*",
    "/codespace/:path*",
    "/get-started",
    "/:username/:repo",
  ],
};
