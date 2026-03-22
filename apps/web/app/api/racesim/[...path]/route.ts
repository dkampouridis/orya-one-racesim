import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { catalogFallback } from "@/lib/catalog-fallback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "iad1";

function resolveApiBaseUrl() {
  const value =
    process.env.API_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    (process.env.NODE_ENV === "development" ? "http://localhost:8000/api" : "");

  if (!value) {
    throw new Error("API_URL is not configured for the frontend proxy.");
  }

  return value;
}

function normalizeBackendError(text: string, status: number) {
  const lower = text.toLowerCase();
  if (
    lower.includes("sample catalog") ||
    lower.includes("fictional grid") ||
    lower.includes("unknown-gp") ||
    lower.includes("was not found")
  ) {
    return NextResponse.json(
      {
        detail:
          "The backend deployment is still on the old fictional season data. Redeploy the Render API from the latest main branch to run 2026 Formula 1 simulations.",
      },
      { status: 503 },
    );
  }

  return new NextResponse(text, { status });
}

function normalizeGatewayError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const lowered = message.toLowerCase();
  if (lowered.includes("aborted") || lowered.includes("timeout")) {
    return NextResponse.json(
      {
        detail:
          "The RaceSim backend did not respond before the Vercel proxy timeout. If Render is cold or still redeploying, wait a moment and try again.",
      },
      { status: 504 },
    );
  }

  return NextResponse.json(
    {
      detail:
        error instanceof Error
          ? error.message
          : "The RaceSim API request failed before the backend responded.",
    },
    { status: 504 },
  );
}

async function forward(request: NextRequest, path: string[], method: "GET" | "POST") {
  if (method === "GET" && path.join("/") === "defaults") {
    return NextResponse.json(catalogFallback, {
      status: 200,
      headers: {
        "x-racesim-source": "frontend-catalog",
      },
    });
  }

  const url = `${resolveApiBaseUrl()}/${path.join("/")}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(method === "GET" ? 8000 : 55000),
    });

    const text = await response.text();
    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");

    if (responseType) {
      responseHeaders.set("content-type", responseType);
    }

    if (!response.ok) {
      return normalizeBackendError(text, response.status);
    }

    return new NextResponse(text, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return normalizeGatewayError(error);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path, "POST");
}
