const API_PROXY_URL = "/api/racesim";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text || "API request failed";
    try {
      const payload = JSON.parse(text) as { detail?: string };
      message = payload.detail || message;
    } catch {
      // Keep the raw text if it is not valid JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchDefaults<T>() {
  const response = await fetch(`${API_PROXY_URL}/defaults`, {
    cache: "no-store",
  });
  return handleResponse<T>(response);
}

export async function fetchSuggestions<T>(payload: object) {
  const response = await fetch(`${API_PROXY_URL}/strategy-suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<T>(response);
}

export async function runSimulation<T>(payload: object) {
  const response = await fetch(`${API_PROXY_URL}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<T>(response);
}
