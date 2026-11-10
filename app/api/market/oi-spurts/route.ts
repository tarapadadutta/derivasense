import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl =
    process.env.BACKEND_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:8000"
      : "");

  if (!backendUrl) {
    return NextResponse.json(
      {
        error: "BACKEND_URL is not configured for this deployment.",
      },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${backendUrl.replace(/\/+$/, "")}/api/market/oi-spurts`,
      {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to reach the DerivaSense market data backend.",
        source: "DerivaSense API proxy",
      },
      { status: 502 }
    );
  }
}
