const API_PROXY_URL = "/api/racesim";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "API request failed");
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
