import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

async function forward(request: NextRequest, path: string[], method: "GET" | "POST") {
  const url = `${resolveApiBaseUrl()}/${path.join("/")}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  const responseHeaders = new Headers();
  const responseType = response.headers.get("content-type");

  if (responseType) {
    responseHeaders.set("content-type", responseType);
  }

  return new NextResponse(text, {
    status: response.status,
    headers: responseHeaders,
  });
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
