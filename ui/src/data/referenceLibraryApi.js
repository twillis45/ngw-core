/**
 * Reference Library API — client for /api/studio/references endpoints.
 */
import { authHeaders } from './authApi';

const API_BASE = '/api';

export async function fetchReferences(category) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const res = await fetch(`${API_BASE}/studio/references?${params}`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to load references (${res.status})`);
  }
  return res.json();
}

export async function uploadReference({ image, name, category, analysisId, notes, tags }) {
  const form = new FormData();
  form.append('image', image);
  form.append('name', name);
  if (category) form.append('category', category);
  if (analysisId) form.append('analysis_id', analysisId);
  if (notes) form.append('notes', notes);
  if (tags) form.append('tags', tags);

  const res = await fetch(`${API_BASE}/studio/references`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to upload reference (${res.status})`);
  }
  return res.json();
}

export async function deleteReference(refId) {
  const res = await fetch(`${API_BASE}/studio/references/${encodeURIComponent(refId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to delete reference (${res.status})`);
  }
  return res.json();
}
