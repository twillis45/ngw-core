/**
 * NGW Error Code Registry
 *
 * Structured error codes for every failure surface in the app.
 * Format: ERR_<MODULE>_<SEQUENCE>
 *
 * Display pattern:
 *   import { resolveError } from '../lib/errors';
 *   const { code, message, hint } = resolveError(err, 'REF_EVAL');
 *
 * When the backend returns an error, it should include an `error_code` field.
 * When only a message is available, resolveError() infers the code from known strings.
 */

/* ── Error Definitions ─────────────────────────────────────────── */

export const ERROR_CODES = {

  // ── Reference Evaluation ─────────────────────────────────────
  ERR_REF_EVAL_001: {
    message: 'Could not analyze image',
    hint: 'The image may be too dark, too small, or contain no detectable subject. Try a higher-resolution JPEG with clear facial or lighting features.',
    surface: 'Reference Evaluation',
  },
  ERR_REF_EVAL_002: {
    message: 'No image selected',
    hint: 'Choose a JPG or PNG file first.',
    surface: 'Reference Evaluation',
  },
  ERR_REF_EVAL_003: {
    message: 'Analysis returned no data',
    hint: 'The image was uploaded but the vision pipeline returned an empty result. Check file format (JPEG/PNG only) and file size (< 20MB).',
    surface: 'Reference Evaluation',
  },
  ERR_REF_EVAL_004: {
    message: 'Pattern could not be determined',
    hint: 'The lighting pattern in the image is ambiguous or the image quality is insufficient. Try a well-lit portrait with clear shadow definition.',
    surface: 'Reference Evaluation',
  },

  // ── Image Upload ──────────────────────────────────────────────
  ERR_IMG_UPLOAD_001: {
    message: 'File type not supported',
    hint: 'Only JPEG and PNG images are accepted.',
    surface: 'Image Upload',
  },
  ERR_IMG_UPLOAD_002: {
    message: 'File too large',
    hint: 'Maximum file size is 20MB. Reduce resolution or compression before uploading.',
    surface: 'Image Upload',
  },
  ERR_IMG_UPLOAD_003: {
    message: 'Upload failed',
    hint: 'The file could not be saved on the server. Check your connection and try again.',
    surface: 'Image Upload',
  },

  // ── Shoot Match / Analysis ────────────────────────────────────
  ERR_SHOOT_MATCH_001: {
    message: 'Setup match failed',
    hint: 'The engine could not find a matching lighting setup. Verify your gear selection and mood, then try again.',
    surface: 'Shoot Match',
  },
  ERR_SHOOT_MATCH_002: {
    message: 'No matching setups found',
    hint: 'No lighting setups match your current gear and environment combination. Try a different mood or gear configuration.',
    surface: 'Shoot Match',
  },

  // ── Lab / Analysis Pipeline ───────────────────────────────────
  ERR_LAB_ANALYZE_001: {
    message: 'Image analysis failed',
    hint: 'The lab analysis pipeline returned an error. The image may be corrupt or the analysis service is temporarily unavailable.',
    surface: 'Lab Workbench',
  },
  ERR_LAB_ANALYZE_002: {
    message: 'No face detected',
    hint: 'The vision pipeline found no face in the image. Analysis requires a portrait with at least one visible face.',
    surface: 'Lab Workbench',
  },
  ERR_LAB_ANALYZE_003: {
    message: 'Low-signal image',
    hint: 'The image lacks enough lighting signals for reliable pattern detection. Check that catchlights, shadow edges, and facial geometry are visible.',
    surface: 'Lab Workbench',
  },

  // ── Network / Auth ────────────────────────────────────────────
  ERR_NET_001: {
    message: 'Network error',
    hint: 'Could not reach the server. Check your internet connection and try again.',
    surface: 'Network',
  },
  ERR_NET_002: {
    message: 'Request timed out',
    hint: 'The server took too long to respond. Analysis of complex images can take up to 30 seconds — please try again.',
    surface: 'Network',
  },
  ERR_AUTH_001: {
    message: 'Authentication required',
    hint: 'Your session has expired. Sign in again to continue.',
    surface: 'Auth',
  },
  ERR_AUTH_002: {
    message: 'Insufficient permissions',
    hint: 'This feature requires a Studio or Enterprise plan. Upgrade to access it.',
    surface: 'Auth',
  },

  // ── Benchmark ─────────────────────────────────────────────────
  ERR_BM_001: {
    message: 'Benchmark case not found',
    hint: 'The requested benchmark case ID does not exist or has been deleted.',
    surface: 'Benchmark',
  },
  ERR_BM_002: {
    message: 'Benchmark run failed',
    hint: 'One or more cases could not be evaluated. Check that all case images are accessible.',
    surface: 'Benchmark',
  },

  // ── Generic ───────────────────────────────────────────────────
  ERR_UNKNOWN: {
    message: 'An unexpected error occurred',
    hint: 'Something went wrong. Please try again or contact support if the problem persists.',
    surface: 'Unknown',
  },
};

/* ── Inference map — match known error strings to codes ─────────── */

const INFERENCE_MAP = [
  // Most specific first
  { pattern: /no face|face not found|face detection/i,       code: 'ERR_LAB_ANALYZE_002' },
  { pattern: /low.signal|insufficient signal/i,              code: 'ERR_LAB_ANALYZE_003' },
  { pattern: /could not analyze|analyze image/i,             code: 'ERR_REF_EVAL_001' },
  { pattern: /no image selected/i,                           code: 'ERR_REF_EVAL_002' },
  { pattern: /analysis returned no data/i,                   code: 'ERR_REF_EVAL_003' },
  { pattern: /pattern could not/i,                           code: 'ERR_REF_EVAL_004' },
  { pattern: /file type|unsupported.*format|format.*unsupported/i, code: 'ERR_IMG_UPLOAD_001' },
  { pattern: /file too large|size.*exceeded|maxsize/i,       code: 'ERR_IMG_UPLOAD_002' },
  { pattern: /upload.*fail|could not.*upload/i,              code: 'ERR_IMG_UPLOAD_003' },
  { pattern: /no matching setup|no setup found/i,            code: 'ERR_SHOOT_MATCH_002' },
  { pattern: /setup match.*fail/i,                           code: 'ERR_SHOOT_MATCH_001' },
  { pattern: /lab.*analysis.*fail|analysis.*fail/i,          code: 'ERR_LAB_ANALYZE_001' },
  { pattern: /timed? out|timeout/i,                          code: 'ERR_NET_002' },
  { pattern: /network|fetch.*fail|connection/i,              code: 'ERR_NET_001' },
  { pattern: /session.*expired|not authenticated|401/i,      code: 'ERR_AUTH_001' },
  { pattern: /permission|forbidden|403/i,                    code: 'ERR_AUTH_002' },
];

/**
 * Resolve an error to a structured { code, message, hint, surface } object.
 *
 * @param {Error|string|Object} err  - raw error from catch block or API response
 * @param {string}              [surface] - caller context hint e.g. 'REF_EVAL'
 * @returns {{ code: string, message: string, hint: string, surface: string }}
 */
export function resolveError(err, surface = '') {
  // If the error already carries a structured code from the backend, use it
  if (err && typeof err === 'object' && err.error_code && ERROR_CODES[err.error_code]) {
    const def = ERROR_CODES[err.error_code];
    return { code: err.error_code, ...def };
  }

  // Infer from the error message string
  const msg = typeof err === 'string' ? err : (err?.message || err?.detail || String(err || ''));
  for (const { pattern, code } of INFERENCE_MAP) {
    if (pattern.test(msg)) {
      return { code, message: msg || ERROR_CODES[code].message, hint: ERROR_CODES[code].hint, surface: ERROR_CODES[code].surface };
    }
  }

  return {
    code: 'ERR_UNKNOWN',
    message: msg || ERROR_CODES.ERR_UNKNOWN.message,
    hint: ERROR_CODES.ERR_UNKNOWN.hint,
    surface: surface || ERROR_CODES.ERR_UNKNOWN.surface,
  };
}

/**
 * Format an error for display.
 * Returns a JSX-friendly string: "Could not analyze image  [ERR_REF_EVAL_001]"
 */
export function formatErrorDisplay(err, surface = '') {
  const { code, message } = resolveError(err, surface);
  return `${message}  [${code}]`;
}
