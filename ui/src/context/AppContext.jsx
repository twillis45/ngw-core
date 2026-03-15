import { createContext, useContext, useReducer } from 'react';

/* -- default light factory (kept for backward compat) -- */

let _nextId = 1;
export function defaultLight() {
  return {
    id: `light-${_nextId++}`,
    type: 'strobe_mono',
    brand: '',
    features: { dimmable: true, battery: false, waterproof: false, smart_ready: false },
  };
}

/* -- wizard step sequences ----------------------------- */

const MOOD_STEPS      = ['master_mode', 'mood', 'subject', 'environment', 'gear_question'];
const KIT_STEPS       = ['gear_entry', 'mood', 'subject', 'environment'];
const REF_MATCH_STEPS = ['subject', 'environment', 'gear_question'];
const EDIT_KIT_STEPS  = ['gear_entry'];

/* -- initial state ------------------------------------- */

/* -- persist master mode across sessions -- */
const MASTER_MODE_KEY = 'ngw_master_mode';
function _loadMasterMode() {
  try { return localStorage.getItem(MASTER_MODE_KEY) || null; } catch { return null; }
}

/* -- persist room dimensions across sessions -- */
const ROOM_DIMS_KEY = 'ngw_room_dimensions';
function _loadRoomDimensions() {
  try {
    const raw = localStorage.getItem(ROOM_DIMS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Convert exact ceiling height (ft) to the legacy categorical value. */
function _ceilingFtToCategory(ft) {
  if (ft < 8) return 'under_8';
  if (ft < 10) return '8_9';
  if (ft < 12) return '10_12';
  return '12_plus';
}

const initialState = {
  screen: 'welcome',       // 'welcome' | 'wizard' | 'loading' | 'results' | 'auth' | ...
  history: [],
  user: null,               // { id, email, username } when logged in
  appMode: null,            // 'build' | 'match' | 'shot_match' | 'shoot' | 'lab'
  intent: null,             // 'mood' | 'kit'
  wizardStep: 0,
  wizardSteps: [],          // computed from intent
  mood: null,
  subjectType: null,
  environment: null,
  ceilingHeight: null,
  roomDimensions: _loadRoomDimensions(),  // { lengthFt, widthFt, ceilingFt, source }
  floorPlan: null,           // { subjectPos: {x,y}, cameraPos: {x,y} }
  spatialWarnings: [],       // string[] — real-time constraint warnings
  skinTone: null,            // 'light' | 'medium' | 'dark'
  masterMode: _loadMasterMode(),  // persisted across sessions
  gearPreference: 'recommend',   // 'my_gear' | 'recommend' | 'any' — homepage gear toggle
  gearMode: null,           // 'my_gear' | 'best_setup'
  gear: {
    lights: [],             // [{ type: 'speedlight', qty: 2 }, ...]
    modifiers: [],          // ['softbox', 'beauty_dish', ...]
    support: [],            // [{ type: 'c_stand', qty: 3 }, ...]
  },
  referenceImage: null,        // { file, preview, serverPath } — primary image
  referenceImages: [],         // [{ file, preview, serverPath }] — all uploaded images
  refAnalysis: null,           // analysis from reference image upload
  shootRole: null,             // 'photographer' | 'assistant' | 'second_shooter'
  loading: false,
  apiResponse: null,
  result: null,
  error: null,
};

/* -- reducer ------------------------------------------- */

function reducer(state, action) {
  switch (action.type) {

    /* -- intent & wizard navigation -- */

    case 'SET_APP_MODE':
      return { ...state, appMode: action.mode };

    case 'SET_INTENT': {
      const isKit = action.intent === 'kit';
      const isRefMatch = action.intent === 'ref_match';
      const isEditKit = action.intent === 'edit_kit';
      let steps;
      if (isEditKit) steps = [...EDIT_KIT_STEPS];
      else if (isRefMatch) steps = [...REF_MATCH_STEPS];
      else if (isKit) steps = [...KIT_STEPS];
      else steps = [...MOOD_STEPS];
      // Derive appMode from intent when not already set
      let appMode = state.appMode;
      if (!appMode) {
        if (isKit || isEditKit) appMode = 'build';
        else if (isRefMatch) appMode = 'match';
        else appMode = 'build';
      }
      return {
        ...state,
        appMode,
        intent: action.intent,
        wizardSteps: steps,
        wizardStep: 0,
        screen: 'wizard',
        history: [...state.history, state.screen],
        error: null,
        gearMode: (isKit || isEditKit) ? 'my_gear' : null,
      };
    }

    case 'WIZARD_NEXT': {
      const next = state.wizardStep + 1;
      if (next >= state.wizardSteps.length) return state; // don't auto-advance past end
      return { ...state, wizardStep: next };
    }

    case 'WIZARD_BACK': {
      if (state.wizardStep <= 0) {
        // go back to welcome
        const hist = [...state.history];
        const prev = hist.pop() || 'welcome';
        return {
          ...state,
          screen: prev,
          history: hist,
          wizardStep: 0,
          wizardSteps: [],
          intent: null,
        };
      }
      return { ...state, wizardStep: state.wizardStep - 1 };
    }

    /* -- simple field setters -- */

    case 'SET_MOOD':
      return { ...state, mood: action.mood };

    case 'SET_SUBJECT_TYPE':
      return { ...state, subjectType: action.subjectType };

    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.environment };

    case 'SET_CEILING_HEIGHT':
      return { ...state, ceilingHeight: action.ceilingHeight };

    case 'SET_SKIN_TONE':
      return { ...state, skinTone: action.skinTone };

    case 'SET_MASTER_MODE': {
      // Persist to localStorage so it survives page reloads
      try {
        if (action.masterMode) localStorage.setItem(MASTER_MODE_KEY, action.masterMode);
        else localStorage.removeItem(MASTER_MODE_KEY);
      } catch { /* ignore */ }
      return { ...state, masterMode: action.masterMode };
    }

    /* -- homepage gear preference -- */

    case 'SET_GEAR_PREFERENCE':
      return { ...state, gearPreference: action.payload }; // 'my_gear' | 'recommend' | 'any'

    /* -- gear mode -- */

    case 'SET_GEAR_MODE': {
      let steps = [...state.wizardSteps];
      if (action.mode === 'my_gear') {
        if (!steps.includes('gear_entry')) {
          steps = [...steps, 'gear_entry'];
        }
      } else {
        steps = steps.filter(s => s !== 'gear_entry');
      }
      return { ...state, gearMode: action.mode, wizardSteps: steps };
    }

    /* -- gear: lights -- */

    case 'ADD_GEAR_LIGHT': {
      const existing = state.gear.lights.find(l => l.type === action.lightType);
      if (existing) {
        return {
          ...state,
          gear: {
            ...state.gear,
            lights: state.gear.lights.map(l =>
              l.type === action.lightType ? { ...l, qty: l.qty + 1 } : l
            ),
          },
        };
      }
      return {
        ...state,
        gear: {
          ...state.gear,
          lights: [...state.gear.lights, { type: action.lightType, qty: 1 }],
        },
      };
    }

    case 'REMOVE_GEAR_LIGHT':
      return {
        ...state,
        gear: {
          ...state.gear,
          lights: state.gear.lights.filter(l => l.type !== action.lightType),
        },
      };

    case 'UPDATE_GEAR_QTY': {
      const updated = state.gear.lights.map(l => {
        if (l.type !== action.lightType) return l;
        const newQty = l.qty + (action.delta || 0);
        return { ...l, qty: newQty };
      }).filter(l => l.qty > 0);
      return { ...state, gear: { ...state.gear, lights: updated } };
    }

    /* -- gear: load saved kit -- */

    case 'LOAD_GEAR_KIT': {
      // Normalize modifiers: accept both old string[] and new {type,qty}[] formats
      const rawMods = action.gear.modifiers || [];
      const normalizedMods = rawMods.map(m =>
        typeof m === 'string' ? { type: m, qty: 1 } : m
      );
      return { ...state, gear: { lights: action.gear.lights || [], modifiers: normalizedMods, support: action.gear.support || [] } };
    }

    /* -- gear: modifiers -- */

    case 'ADD_MODIFIER': {
      const existing = state.gear.modifiers.find(m => m.type === action.modifier);
      if (existing) {
        return {
          ...state,
          gear: {
            ...state.gear,
            modifiers: state.gear.modifiers.map(m =>
              m.type === action.modifier ? { ...m, qty: m.qty + 1 } : m
            ),
          },
        };
      }
      return {
        ...state,
        gear: {
          ...state.gear,
          modifiers: [...state.gear.modifiers, { type: action.modifier, qty: 1 }],
        },
      };
    }

    case 'REMOVE_MODIFIER':
      return {
        ...state,
        gear: {
          ...state.gear,
          modifiers: state.gear.modifiers.filter(m => m.type !== action.modifier),
        },
      };

    case 'UPDATE_MODIFIER_QTY': {
      const updated = state.gear.modifiers.map(m => {
        if (m.type !== action.modifier) return m;
        const newQty = m.qty + (action.delta || 0);
        return { ...m, qty: newQty };
      }).filter(m => m.qty > 0);
      return { ...state, gear: { ...state.gear, modifiers: updated } };
    }

    // Legacy support for old TOGGLE_MODIFIER dispatches
    case 'TOGGLE_MODIFIER': {
      const found = state.gear.modifiers.find(m => m.type === action.modifier);
      if (found) {
        return {
          ...state,
          gear: {
            ...state.gear,
            modifiers: state.gear.modifiers.filter(m => m.type !== action.modifier),
          },
        };
      }
      return {
        ...state,
        gear: {
          ...state.gear,
          modifiers: [...state.gear.modifiers, { type: action.modifier, qty: 1 }],
        },
      };
    }

    /* -- gear: support -- */

    case 'ADD_SUPPORT_GEAR': {
      const existing = state.gear.support.find(s => s.type === action.supportType);
      if (existing) {
        return {
          ...state,
          gear: {
            ...state.gear,
            support: state.gear.support.map(s =>
              s.type === action.supportType ? { ...s, qty: s.qty + 1 } : s
            ),
          },
        };
      }
      return {
        ...state,
        gear: {
          ...state.gear,
          support: [...state.gear.support, { type: action.supportType, qty: 1 }],
        },
      };
    }

    case 'REMOVE_SUPPORT_GEAR':
      return {
        ...state,
        gear: {
          ...state.gear,
          support: state.gear.support.filter(s => s.type !== action.supportType),
        },
      };

    case 'UPDATE_SUPPORT_QTY': {
      const updated = state.gear.support.map(s => {
        if (s.type !== action.supportType) return s;
        const newQty = s.qty + (action.delta || 0);
        return { ...s, qty: newQty };
      }).filter(s => s.qty > 0);
      return { ...state, gear: { ...state.gear, support: updated } };
    }

    /* -- reference image -- */

    case 'SET_REFERENCE_IMAGE':
      return { ...state, referenceImage: action.payload };

    case 'SET_REFERENCE_IMAGES':
      return {
        ...state,
        referenceImages: action.payload,
        referenceImage: action.payload[0] || null,
      };

    case 'CLEAR_REFERENCE_IMAGE':
      return { ...state, referenceImage: null, referenceImages: [], refAnalysis: null };

    case 'SET_REF_ANALYSIS':
      return { ...state, refAnalysis: action.analysis };

    /* -- shoot mode -- */

    case 'SET_SHOOT_ROLE':
      return { ...state, shootRole: action.role };

    /* -- spatial calibration -- */

    case 'SET_ROOM_DIMENSIONS': {
      const dims = action.dimensions;
      // Persist to localStorage
      try {
        if (dims) localStorage.setItem(ROOM_DIMS_KEY, JSON.stringify(dims));
        else localStorage.removeItem(ROOM_DIMS_KEY);
      } catch { /* ignore */ }
      // Auto-derive categorical ceiling height for backward compat
      const ceilingHeight = dims ? _ceilingFtToCategory(dims.ceilingFt) : state.ceilingHeight;
      return { ...state, roomDimensions: dims, ceilingHeight };
    }

    case 'SET_FLOOR_PLAN':
      return { ...state, floorPlan: action.plan };

    case 'SET_SPATIAL_WARNINGS':
      return { ...state, spatialWarnings: action.warnings };

    /* -- async / navigation -- */

    case 'SET_LOADING':
      return {
        ...state,
        loading: true,
        error: null,
        screen: 'loading',
        history: [...state.history, state.screen],
      };

    case 'SET_RESULT':
      return {
        ...state,
        loading: false,
        result: action.result,
        apiResponse: action.apiResponse,
        error: null,
        screen: 'results',
      };

    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, screen: 'results' };

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

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'LOGOUT':
      return { ...state, user: null };

    case 'RESET':
      _nextId = 1;
      return { ...initialState, user: state.user, masterMode: state.masterMode, roomDimensions: state.roomDimensions, appMode: null, refAnalysis: null };

    default:
      return state;
  }
}

/* -- context ------------------------------------------- */

const StateCtx = createContext(null);
const DispatchCtx = createContext(null);

export function AppProvider({ children, devModeUser }) {
  const init = devModeUser ? { ...initialState, user: devModeUser } : initialState;
  const [state, dispatch] = useReducer(reducer, init);
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
