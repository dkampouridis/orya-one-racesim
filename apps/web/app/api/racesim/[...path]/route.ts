import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { catalogFallback } from "@/lib/catalog-fallback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "iad1";

type LiveSimulationPayload = {
  simulation_runs?: number;
  complexity_level?: "low" | "balanced" | "high";
  weather_preset_id?: string;
  grand_prix_id?: string;
  environment?: {
    rain_onset?: number;
    virtual_safety_cars?: number;
    full_safety_cars?: number;
    red_flags?: number;
    late_race_incidents?: number;
    randomness_intensity?: number;
  };
};

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

function getLiveSafeSimulationRuns(payload: LiveSimulationPayload) {
  let maxRuns = 260;

  if (payload.complexity_level === "balanced") {
    maxRuns = 240;
  } else if (payload.complexity_level === "high") {
    maxRuns = 200;
  }

  if (payload.weather_preset_id && /(rain|crossover|storm|mixed|wet)/i.test(payload.weather_preset_id)) {
    maxRuns -= 30;
  }

  if (
    payload.grand_prix_id &&
    ["belgian-grand-prix", "singapore-grand-prix", "azerbaijan-grand-prix", "las-vegas-grand-prix"].includes(
      payload.grand_prix_id,
    )
  ) {
    maxRuns -= 20;
  }

  const environment = payload.environment;
  if (environment) {
    const incidentPressure =
      (environment.full_safety_cars ?? 0) +
      (environment.virtual_safety_cars ?? 0) +
      (environment.red_flags ?? 0) +
      (environment.late_race_incidents ?? 0);

    if ((environment.rain_onset ?? 0) >= 0.35) {
      maxRuns -= 20;
    }

    if (incidentPressure >= 0.48) {
      maxRuns -= 20;
    }

    if ((environment.randomness_intensity ?? 0) >= 0.58) {
      maxRuns -= 10;
    }
  }

  return Math.max(160, Math.min(260, maxRuns));
}

function isHtmlErrorPayload(text: string, contentType: string | null) {
  if (contentType?.toLowerCase().includes("text/html")) {
    return true;
  }

  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function normalizeBackendError(
  text: string,
  status: number,
  contentType: string | null,
) {
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

  if (status === 502 || isHtmlErrorPayload(text, contentType)) {
    return NextResponse.json(
      {
        detail:
          "The RaceSim backend is temporarily unavailable. Render returned a bad gateway response. Wait a moment and try again.",
      },
      { status: 502 },
    );
  }

  if (status === 503) {
    return NextResponse.json(
      {
        detail:
          "The RaceSim backend is temporarily unavailable. If Render is redeploying or waking from cold start, try again in a moment.",
      },
      { status: 503 },
    );
  }

  if (status === 504) {
    return NextResponse.json(
      {
        detail:
          "The RaceSim backend timed out before the proxy received a complete response. Try again in a moment.",
      },
      { status: 504 },
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
  const requestPath = path.join("/");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  let body: string | undefined;
  if (method === "POST") {
    body = await request.text();
    if (requestPath === "simulate" && contentType?.includes("application/json") && process.env.NODE_ENV !== "development") {
      try {
        const payload = JSON.parse(body) as LiveSimulationPayload;
        const liveSafeRuns = getLiveSafeSimulationRuns(payload);
        if (typeof payload.simulation_runs === "number" && payload.simulation_runs > liveSafeRuns) {
          body = JSON.stringify({ ...payload, simulation_runs: liveSafeRuns });
        }
      } catch {
        // Preserve the raw request body if it is not valid JSON.
      }
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
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
      return normalizeBackendError(text, response.status, responseType);
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
