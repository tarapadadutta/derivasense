import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const apiPath = pathname.replace(/^\/api\//, "");
  const allowed = ["auth/", "admin/", "zerodha/"];

  if (!allowed.some((prefix) => apiPath.startsWith(prefix))) {
    return NextResponse.json(
      { error: "API route not permitted." },
      { status: 404 }
    );
  }

  const backendUrl =
    process.env.BACKEND_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8000"
      : "");

  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const headers = new Headers();

    for (const name of ["authorization", "content-type", "accept"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);

    const response = await fetch(
      `${backendUrl.replace(/\/+$/, "")}${pathname}${request.nextUrl.search}`,
      {
        method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      }
    );

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");

    if (contentType) responseHeaders.set("content-type", contentType);

    responseHeaders.set("Cache-Control", "no-store, max-age=0");

    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to reach the DerivaSense backend.",
        source: "DerivaSense API proxy",
      },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;