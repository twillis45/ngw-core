/** POST /recommend and return the raw API response. */

export async function fetchRecommendation(payload) {
  const resp = await fetch('/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    const msg = typeof err.detail === 'string'
      ? err.detail
      : JSON.stringify(err.detail || err, null, 2);
    throw new Error(msg);
  }

  return resp.json();
}

/** POST /api/shoot-match and return UI-ready card data. */

export async function fetchShootMatch(wizardState) {
  const resp = await fetch('/api/shoot-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wizardState),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    const msg = typeof err.detail === 'string'
      ? err.detail
      : JSON.stringify(err.detail || err, null, 2);
    throw new Error(msg);
  }

  return resp.json();
}
