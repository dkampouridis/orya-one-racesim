import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { catalogFallback } from "@/lib/catalog-fallback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "iad1";

const PRODUCTION_PRIMARY_SIM_TIMEOUT_MS = 14000;
const PRODUCTION_EMERGENCY_SIM_TIMEOUT_MS = 10000;
const PRODUCTION_FAILSAFE_SIM_TIMEOUT_MS = 7000;
const SIMULATION_WAKE_TIMEOUT_MS = 2500;

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

type SimulateRequestShape = {
  body?: string;
  payload?: LiveSimulationPayload;
};

type SimulationAttemptOptions = {
  body: string | undefined;
  timeoutMs: number;
};

type SimulationRiskProfile = {
  heavyWeather: boolean;
  heavyChaos: boolean;
  heavyCircuit: boolean;
  veryHeavy: boolean;
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

function getSimulationRiskProfile(payload: LiveSimulationPayload): SimulationRiskProfile {
  const environment = payload.environment;
  const incidentPressure =
    (environment?.full_safety_cars ?? 0) +
    (environment?.virtual_safety_cars ?? 0) +
    (environment?.red_flags ?? 0) +
    (environment?.late_race_incidents ?? 0);

  const heavyWeather =
    Boolean(payload.weather_preset_id && /(rain|crossover|storm|mixed|wet)/i.test(payload.weather_preset_id)) ||
    (environment?.rain_onset ?? 0) >= 0.35;

  const heavyChaos =
    incidentPressure >= 0.48 ||
    (environment?.randomness_intensity ?? 0) >= 0.58;

  const heavyCircuit = Boolean(
    payload.grand_prix_id &&
      ["belgian-grand-prix", "singapore-grand-prix", "azerbaijan-grand-prix", "las-vegas-grand-prix"].includes(
        payload.grand_prix_id,
      ),
  );

  return {
    heavyWeather,
    heavyChaos,
    heavyCircuit,
    veryHeavy: (heavyWeather && heavyCircuit) || (heavyWeather && heavyChaos) || (heavyCircuit && heavyChaos),
  };
}

function getLiveSafeSimulationRuns(payload: LiveSimulationPayload) {
  const risk = getSimulationRiskProfile(payload);
  let maxRuns = 220;

  if (payload.complexity_level === "balanced") {
    maxRuns = 200;
  } else if (payload.complexity_level === "high") {
    maxRuns = 170;
  }

  if (risk.heavyWeather) {
    maxRuns -= 30;
  }

  if (risk.heavyCircuit) {
    maxRuns -= 25;
  }

  const environment = payload.environment;
  if (environment) {
    const incidentPressure =
      (environment.full_safety_cars ?? 0) +
      (environment.virtual_safety_cars ?? 0) +
      (environment.red_flags ?? 0) +
      (environment.late_race_incidents ?? 0);

    if (risk.heavyChaos) {
      maxRuns -= 20;
    }
  }

  if (risk.veryHeavy) {
    maxRuns = Math.min(maxRuns, 90);
  }

  return Math.max(80, Math.min(220, maxRuns));
}

function getEmergencySimulationRuns(payload: LiveSimulationPayload) {
  const capped = getLiveSafeSimulationRuns(payload);
  const risk = getSimulationRiskProfile(payload);

  if (risk.veryHeavy) {
    return Math.max(60, Math.min(70, capped - 10));
  }

  if (payload.complexity_level === "balanced") {
    return Math.max(70, Math.min(130, capped - 15));
  }

  if (payload.complexity_level === "high") {
    return Math.max(70, Math.min(120, capped - 20));
  }

  return Math.max(80, Math.min(140, capped - 10));
}

function tryParseSimulatePayload(body: string | undefined, contentType: string | null) {
  if (!body || !contentType?.includes("application/json")) {
    return {};
  }

  try {
    return { body, payload: JSON.parse(body) as LiveSimulationPayload };
  } catch {
    return { body };
  }
}

async function fetchWithTimeout(
  url: string,
  init: Omit<RequestInit, "signal">,
  timeoutMs: number,
) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function isTimeoutLikeError(error: unknown) {
  const lowered = error instanceof Error ? error.message.toLowerCase() : "";
  return lowered.includes("aborted") || lowered.includes("timeout");
}

function shouldRetrySimulationResponse(status: number) {
  return status === 502 || status === 503 || status === 504;
}

function buildSimulationAttemptBody(
  payload: LiveSimulationPayload,
  mode: "live-safe" | "emergency" | "failsafe",
) {
  const risk = getSimulationRiskProfile(payload);
  const runs =
    mode === "live-safe"
      ? getLiveSafeSimulationRuns(payload)
      : mode === "emergency"
        ? getEmergencySimulationRuns(payload)
        : risk.veryHeavy
          ? 50
          : 60;

  const complexityLevel =
    mode === "failsafe"
      ? "low"
      : mode === "live-safe" && risk.veryHeavy
        ? "low"
      : mode === "emergency" && payload.complexity_level === "high"
        ? "balanced"
        : mode === "emergency" && (risk.heavyWeather || risk.heavyChaos)
          ? "low"
        : payload.complexity_level;

  return JSON.stringify({
    ...payload,
    complexity_level: complexityLevel,
    simulation_runs:
      typeof payload.simulation_runs === "number"
        ? Math.min(payload.simulation_runs, runs)
        : runs,
  });
}

async function warmBackendForSimulation(url: string) {
  const healthUrl = url.replace(/\/simulate$/, "/health");

  try {
    await fetchWithTimeout(
      healthUrl,
      {
        method: "GET",
        cache: "no-store",
      },
      SIMULATION_WAKE_TIMEOUT_MS,
    );
  } catch {
    // Ignore warm-up failures and proceed with the simulation attempt.
  }
}

async function sendSimulationAttempt(
  url: string,
  headers: Headers,
  options: SimulationAttemptOptions,
) {
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      cache: "no-store",
      body: options.body,
    },
    options.timeoutMs,
  );
}

async function forwardSimulationRequest(
  url: string,
  headers: Headers,
  requestShape: SimulateRequestShape,
) {
  if (process.env.NODE_ENV === "development" || !requestShape.payload) {
    return sendSimulationAttempt(url, headers, {
      body: requestShape.body,
      timeoutMs: process.env.NODE_ENV === "development" ? 55000 : 32000,
    });
  }

  const payload = requestShape.payload;
  const liveSafeBody = buildSimulationAttemptBody(payload, "live-safe");
  const emergencyBody = buildSimulationAttemptBody(payload, "emergency");
  const failsafeBody = buildSimulationAttemptBody(payload, "failsafe");

  await warmBackendForSimulation(url);

  try {
    const primaryResponse = await sendSimulationAttempt(url, headers, {
      body: liveSafeBody,
      timeoutMs: PRODUCTION_PRIMARY_SIM_TIMEOUT_MS,
    });

    if (!shouldRetrySimulationResponse(primaryResponse.status)) {
      return primaryResponse;
    }
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }
  }

  await warmBackendForSimulation(url);

  try {
    const emergencyResponse = await sendSimulationAttempt(url, headers, {
      body: emergencyBody,
      timeoutMs: PRODUCTION_EMERGENCY_SIM_TIMEOUT_MS,
    });

    if (!shouldRetrySimulationResponse(emergencyResponse.status)) {
      return emergencyResponse;
    }
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }
  }

  return sendSimulationAttempt(url, headers, {
    body: failsafeBody,
    timeoutMs: PRODUCTION_FAILSAFE_SIM_TIMEOUT_MS,
  });
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
  let simulateRequest: SimulateRequestShape | undefined;
  if (method === "POST") {
    body = await request.text();
    if (requestPath === "simulate" && contentType?.includes("application/json") && process.env.NODE_ENV !== "development") {
      try {
        const payload = JSON.parse(body) as LiveSimulationPayload;
        const liveSafeRuns = getLiveSafeSimulationRuns(payload);
        if (typeof payload.simulation_runs === "number" && payload.simulation_runs > liveSafeRuns) {
          body = JSON.stringify({ ...payload, simulation_runs: liveSafeRuns });
        }
        simulateRequest = tryParseSimulatePayload(body, contentType);
      } catch {
        // Preserve the raw request body if it is not valid JSON.
      }
    } else if (requestPath === "simulate") {
      simulateRequest = tryParseSimulatePayload(body, contentType);
    }
  }

  try {
    const response =
      method === "POST" && requestPath === "simulate"
        ? await forwardSimulationRequest(url, headers, simulateRequest ?? { body })
        : await fetchWithTimeout(
            url,
            {
              method,
              headers,
              body,
              cache: "no-store",
            },
            method === "GET" ? 8000 : 55000,
          );

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
