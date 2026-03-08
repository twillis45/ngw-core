import { createContext, useContext, useReducer } from 'react';

/* ── default light factory ─────────────────────────── */

let _nextId = 1;
export function defaultLight() {
  return {
    id: `light-${_nextId++}`,
    type: 'strobe_mono',
    brand: '',
    features: { dimmable: true, battery: false, waterproof: false, smart_ready: false },
  };
}

/* ── initial state ─────────────────────────────────── */

const initialState = {
  screen: 'welcome',     // welcome | mood | gear | loading | results
  history: [],

  intent: null,           // 'match' | 'build'
  gearMode: 'my_gear',   // 'my_gear' | 'best_setup'
  mood: null,
  environment: null,
  skinTone: null,
  referenceImage: null,  // File object from upload

  lights: [defaultLight()],
  modifiers: [],

  loading: false,
  apiResponse: null,
  result: null,           // transformed photographer-friendly result
  error: null,
};

/* ── reducer ───────────────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE':
      return {
        ...state,
        screen: action.screen,
        history: [...state.history, state.screen],
        error: null,
      };

    case 'GO_BACK': {
      const hist = [...state.history];
      const prev = hist.pop() || 'welcome';
      return { ...state, screen: prev, history: hist };
    }

    case 'SET_INTENT':
      return { ...state, intent: action.intent };

    case 'SET_GEAR_MODE':
      return { ...state, gearMode: action.mode };

    case 'SET_MOOD':
      return { ...state, mood: action.mood };

    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.environment };

    case 'SET_SKIN_TONE':
      return { ...state, skinTone: action.skinTone };

    case 'SET_REFERENCE_IMAGE':
      return { ...state, referenceImage: action.file };

    case 'ADD_LIGHT':
      return { ...state, lights: [...state.lights, defaultLight()] };

    case 'REMOVE_LIGHT':
      if (state.lights.length <= 1) return state;
      return { ...state, lights: state.lights.filter(l => l.id !== action.lightId) };

    case 'UPDATE_LIGHT':
      return {
        ...state,
        lights: state.lights.map(l =>
          l.id === action.lightId ? { ...l, ...action.updates } : l
        ),
      };

    case 'UPDATE_LIGHT_FEATURE': {
      return {
        ...state,
        lights: state.lights.map(l =>
          l.id === action.lightId
            ? { ...l, features: { ...l.features, [action.feature]: action.value } }
            : l
        ),
      };
    }

    case 'TOGGLE_MODIFIER': {
      const mods = state.modifiers.includes(action.modifier)
        ? state.modifiers.filter(m => m !== action.modifier)
        : [...state.modifiers, action.modifier];
      return { ...state, modifiers: mods };
    }

    case 'SET_LOADING':
      return {
        ...state,
        loading: true,
        error: null,
        screen: 'loading',
        history: [...state.history, state.screen],   // save 'gear' so back works
      };

    case 'SET_RESULT':
      return {
        ...state,
        loading: false,
        result: action.result,
        apiResponse: action.apiResponse,
        error: null,
        screen: 'results',
        // don't push 'loading' — it's transient
      };

    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, screen: 'results' };

    case 'RESET':
      _nextId = 1;
      return { ...initialState, lights: [defaultLight()] };

    default:
      return state;
  }
}

/* ── context ───────────────────────────────────────── */

const StateCtx = createContext(null);
const DispatchCtx = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState() {
  return useContext(StateCtx);
}

export function useDispatch() {
  return useContext(DispatchCtx);
}
