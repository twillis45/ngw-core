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

/** Upload a reference image and return { path, analysis }. */

export async function uploadReferenceImage(file) {
  const form = new FormData();
  form.append('file', file);

  const resp = await fetch('/api/upload-reference', {
    method: 'POST',
    body: form,
  });

  if (!resp.ok) {
    throw new Error('Failed to upload reference image');
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
