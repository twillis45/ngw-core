import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { hasKit } from '../data/kitStore';
import { loadSetups } from '../data/setupStore';
import { getAdminModes } from '../modes/modeRegistry';
import { isModeEnabled, isEnabled, setFlag } from '../modes/featureFlags';
import ModeCard from '../components/ModeCard';
import Toast from '../components/Toast';
import DiagramCard from '../cards/DiagramCard';
import { EXAMPLE_ANALYSES, GALLERY_ITEMS } from '../data/exampleData';

const DEV_TAP_COUNT = 5;
const DEV_TAP_WINDOW = 3000;

/* Gear options removed — V2 uses simplified Apple-style messaging */

/* Animated hero diagram spec — slowly rotating key light */
const HERO_DIAGRAM_SPEC = {
  lights: [
    { role: 'key', label: 'Key', angle_deg: 315, distance_m: 1.5, height_m: 2.0, modifier: 'softbox' },
    { role: 'fill', label: 'Fill', angle_deg: 60, distance_m: 2.0, height_m: 1.6, modifier: 'umbrella' },
  ],
  camera: { distance_m: 2.2 },
};

export default function WelcomeScreenV2() {
  const { user, gearPreference } = useAppState();
  const tapTimestamps = useRef([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [activeExample, setActiveExample] = useState(0);
  const [stickyVisible, setStickyVisible] = useState(false);
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const kitSaved = hasKit();
  const savedCount = loadSetups().length;
  const adminModes = getAdminModes().filter(m => isModeEnabled(m) && user);

  const example = EXAMPLE_ANALYSES[activeExample];

  const heroDiagramRef = useRef(null);

  /* ── Scroll to top on mount ── */
  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* ── Scroll-reveal + stagger with IntersectionObserver ── */
  useEffect(() => {
    const reveals = document.querySelectorAll('.v2-reveal');
    const staggers = document.querySelectorAll('.v2-stagger');
    if (reveals[0]) reveals[0].classList.add('v2-reveal--visible');

    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('v2-reveal--visible', 'v2-stagger--visible');
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el, i) => { if (i > 0) obs.observe(el); });
    staggers.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* ── Sticky header + hero parallax on scroll ── */
  useEffect(() => {
    let raf;
    const onScroll = () => {
      setStickyVisible(window.scrollY > 300);
      // Parallax the hero diagram
      if (heroDiagramRef.current) {
        const offset = window.scrollY * 0.18;
        heroDiagramRef.current.style.transform = `translateY(${offset}px)`;
      }
    };
    const throttled = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(onScroll); };
    window.addEventListener('scroll', throttled, { passive: true });
    return () => { window.removeEventListener('scroll', throttled); cancelAnimationFrame(raf); };
  }, []);

  /* ── File upload handler ── */
  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const reads = files.map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ file, preview: reader.result, serverPath: null });
      reader.readAsDataURL(file);
    }));
    Promise.all(reads).then(images => {
      dispatch({ type: 'SET_APP_MODE', mode: 'match' });
      dispatch({ type: 'SET_REFERENCE_IMAGES', payload: images });
      dispatch({ type: 'NAVIGATE', screen: 'ref_eval' });
    });
  }

  function triggerUpload() { fileRef.current?.click(); }

  /* ── Secret logo tap ── */
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const wasEnabled = isEnabled('enable_lab');
      setFlag('enable_lab', !wasEnabled);
      setToast({ message: wasEnabled ? 'Dev mode disabled' : 'Dev mode enabled', visible: true });
    }
  }, []);

  /* Gear selector removed — V2 simplified */

  /* ── Workflow card actions ── */
  function handleWorkflowClick(action) {
    switch (action) {
      case 'upload':
        dispatch({ type: 'SET_APP_MODE', mode: 'match' });
        triggerUpload();
        break;
      case 'wizard':
        dispatch({ type: 'SET_APP_MODE', mode: 'build' });
        dispatch({ type: 'SET_INTENT', intent: 'mood' });
        break;
      case 'shoot':
        dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
        dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
        break;
    }
  }

  function handleModeSelect(mode) {
    dispatch({ type: 'SET_APP_MODE', mode: mode.id });
    switch (mode.entryAction) {
      case 'wizard': dispatch({ type: 'SET_INTENT', intent: 'mood' }); break;
      case 'upload': triggerUpload(); break;
      case 'screen': dispatch({ type: 'NAVIGATE', screen: mode.entryScreen }); break;
    }
  }

  return (
    <div className="welcome-v2">
      {/* Hidden file input */}
      <input
        ref={fileRef} type="file" accept="image/*" multiple
        style={{ display: 'none' }} onChange={handleFileChange}
      />

      {/* ════════════════════════════════════════════
          TOP NAV — minimal Apple-style
          ════════════════════════════════════════════ */}
      <nav className="v2-nav">
        <span className="v2-nav__brand" onClick={handleLogoTap}>NGW</span>
        <div className="v2-nav__links">
          <button type="button" className="v2-nav__link" onClick={triggerUpload}>Analyze</button>
          <button type="button" className="v2-nav__link" onClick={() => handleWorkflowClick('wizard')}>Plan</button>
          <button type="button" className="v2-nav__link" onClick={() => handleWorkflowClick('shoot')}>Shoot</button>
          <button type="button" className="v2-nav__link" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}>Recipes</button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════
          STICKY HEADER — appears on scroll
          ════════════════════════════════════════════ */}
      <div className={`v2-sticky-header${stickyVisible ? ' v2-sticky-header--visible' : ''}`}>
        <span className="v2-sticky-header__brand" onClick={handleLogoTap}>NGW</span>
        <div className="v2-sticky-header__links">
          <button type="button" className="v2-nav__link" onClick={triggerUpload}>Analyze</button>
          <button type="button" className="v2-nav__link" onClick={() => handleWorkflowClick('wizard')}>Plan</button>
          <button type="button" className="v2-nav__link" onClick={() => handleWorkflowClick('shoot')}>Shoot</button>
          <button type="button" className="v2-nav__link" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}>Recipes</button>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          HERO — Diagram dominates top, text below
          ════════════════════════════════════════════ */}
      <div className="v2-hero">
        {/* Product shot — dramatic entrance at very top */}
        <div className="v2-hero__product v2-hero__fade v2-hero__fade--0" ref={heroDiagramRef}>
          <DiagramCard spec={HERO_DIAGRAM_SPEC} inline />
        </div>

        <h1 className="v2-hero__headline v2-hero__fade v2-hero__fade--1">
          Reverse-engineer<br />any photograph.
        </h1>
        <p className="v2-hero__sub v2-hero__fade v2-hero__fade--2">
          Upload a photo. Get the complete lighting setup.
        </p>

        <button type="button" className="btn btn--primary v2-hero__cta v2-hero__fade v2-hero__fade--3" onClick={triggerUpload}>
          Upload a Photo
        </button>
        <p className="v2-hero__hint v2-hero__fade v2-hero__fade--3">Free &mdash; no account needed</p>
      </div>

      {/* ════════════════════════════════════════════
          EXAMPLE ANALYSIS — full-bleed dark section
          ════════════════════════════════════════════ */}
      <div className="v2-section v2-section--alt v2-reveal v2-reveal--from-left">
        <h2 className="v2-section__title">See What NGW Finds</h2>
        <p className="v2-section__sub">
          Upload any reference photo and get the complete lighting breakdown.
        </p>

        <div className="v2-example__tabs">
          {EXAMPLE_ANALYSES.map((ex, i) => (
            <button
              key={ex.id} type="button"
              className={`v2-example__tab${i === activeExample ? ' v2-example__tab--active' : ''}`}
              onClick={() => setActiveExample(i)}
            >{ex.label}</button>
          ))}
        </div>

        {example && (
          <>
            <div className="v2-example__grid">
              <div className="v2-example__photo-wrap">
                {example.thumbnail ? (
                  <img
                    src={example.thumbnail}
                    alt={example.label}
                    className="v2-example__photo"
                    loading="lazy"
                  />
                ) : (
                  <div className="v2-example__placeholder" style={{ background: example.placeholderGradient }}>
                    <span className="v2-example__placeholder-label">{example.category}</span>
                  </div>
                )}
              </div>
              <div className="v2-example__diagram-wrap">
                <DiagramCard spec={example.diagramSpec} inline />
              </div>
            </div>

            <div className="v2-example__chips v2-stagger">
              <span className="v2-example__chip v2-example__chip--accent" style={{ '--stagger-i': 0 }}>{example.chips.pattern}</span>
              <span className="v2-example__chip" style={{ '--stagger-i': 1 }}>{example.chips.camera}</span>
              <span className="v2-example__chip" style={{ '--stagger-i': 2 }}>{example.chips.modifier}</span>
              <span className="v2-example__chip" style={{ '--stagger-i': 3 }}>
                {example.lightCount} light{example.lightCount !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="v2-example__desc">{example.description}</p>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════
          GALLERY — full-bleed default bg, real photos
          ════════════════════════════════════════════ */}
      <div className="v2-section v2-reveal v2-reveal--from-right">
        <h2 className="v2-section__title">Try It On Any Photo</h2>
        <p className="v2-section__sub">
          Tap an image to see the full analysis&nbsp;&mdash; or upload your own.
        </p>

        <div className="v2-gallery__scroll v2-stagger">
          {GALLERY_ITEMS.map((item, i) => (
            <button key={item.id} type="button" className="v2-gallery__item" style={{ '--stagger-i': i }} onClick={triggerUpload}>
              <div
                className="v2-gallery__thumb"
                style={item.image
                  ? { backgroundImage: `url(${item.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: item.gradient }
                }
              />
              <div className="v2-gallery__label">{item.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          HOW PHOTOGRAPHERS USE NGW — alt bg
          ════════════════════════════════════════════ */}
      <div className="v2-section v2-section--alt v2-reveal v2-reveal--from-left">
        <h2 className="v2-section__title">How Photographers Use NGW</h2>
        <p className="v2-section__sub">
          Three workflows for every stage of your shoot.
        </p>

        <div className="v2-workflow v2-stagger">
          <button type="button" className="v2-workflow__card" style={{ '--stagger-i': 0 }} onClick={() => handleWorkflowClick('upload')}>
            <span className="v2-workflow__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </span>
            <span className="v2-workflow__body">
              <span className="v2-workflow__title">Reverse-Engineer Any Photo</span>
              <span className="v2-workflow__desc">Upload a reference, get the exact lighting setup</span>
            </span>
            <span className="v2-workflow__arrow">{'\u203A'}</span>
          </button>

          <button type="button" className="v2-workflow__card" style={{ '--stagger-i': 1 }} onClick={() => handleWorkflowClick('wizard')}>
            <span className="v2-workflow__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </span>
            <span className="v2-workflow__body">
              <span className="v2-workflow__title">Plan Your Next Shoot</span>
              <span className="v2-workflow__desc">Build a lighting setup from mood + environment</span>
            </span>
            <span className="v2-workflow__arrow">{'\u203A'}</span>
          </button>

          <button type="button" className="v2-workflow__card" style={{ '--stagger-i': 2 }} onClick={() => handleWorkflowClick('shoot')}>
            <span className="v2-workflow__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </span>
            <span className="v2-workflow__body">
              <span className="v2-workflow__title">Shoot Mode: On-Set Assistant</span>
              <span className="v2-workflow__desc">Step-by-step light placement, exposure checks, and troubleshooting</span>
            </span>
            <span className="v2-workflow__arrow">{'\u203A'}</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          PRICING — 3-tier packages
          ════════════════════════════════════════════ */}
      <div className="v2-section v2-reveal v2-reveal--zoom">
        <h2 className="v2-section__title">Choose Your Plan</h2>
        <p className="v2-section__sub">
          Start free. Upgrade when you&rsquo;re ready.
        </p>

        <div className="v2-pricing">
          {/* Free */}
          <div className="v2-pricing__card">
            <div className="v2-pricing__header">
              <h3 className="v2-pricing__name">Free</h3>
              <div className="v2-pricing__price">$0</div>
              <div className="v2-pricing__period">forever</div>
            </div>
            <ul className="v2-pricing__features">
              <li>1 analysis</li>
              <li>Pattern identification</li>
              <li>Light count</li>
              <li>Key direction</li>
            </ul>
            <button type="button" className="v2-pricing__cta v2-pricing__cta--outline" onClick={triggerUpload}>
              Get Started
            </button>
          </div>

          {/* Starter */}
          <div className="v2-pricing__card v2-pricing__card--featured">
            <div className="v2-pricing__badge">Most Popular</div>
            <div className="v2-pricing__header">
              <h3 className="v2-pricing__name">Starter</h3>
              <div className="v2-pricing__price">$9<span className="v2-pricing__unit">/mo</span></div>
              <div className="v2-pricing__period">billed monthly</div>
            </div>
            <ul className="v2-pricing__features">
              <li>10 analyses / month</li>
              <li>Full lighting diagrams</li>
              <li>Lighting presets library</li>
              <li>Save setups</li>
            </ul>
            <button type="button" className="btn btn--primary v2-pricing__cta" onClick={triggerUpload}>
              Start Free Trial
            </button>
          </div>

          {/* Pro */}
          <div className="v2-pricing__card">
            <div className="v2-pricing__header">
              <h3 className="v2-pricing__name">Pro</h3>
              <div className="v2-pricing__price">$19<span className="v2-pricing__unit">/mo</span></div>
              <div className="v2-pricing__period">billed monthly</div>
            </div>
            <ul className="v2-pricing__features">
              <li>Unlimited analyses</li>
              <li>Shoot mode assistant</li>
              <li>Gear matching</li>
              <li>Export &amp; share setups</li>
              <li>Recipe packages</li>
              <li>Priority support</li>
            </ul>
            <button type="button" className="v2-pricing__cta v2-pricing__cta--outline" onClick={triggerUpload}>
              Start Free Trial
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECONDARY LINKS + ADMIN
          ════════════════════════════════════════════ */}
      <div className="v2-footer v2-section--alt">
        <button
          className="welcome__btn welcome__btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
        >
          <span className="welcome__btn-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            </svg>
          </span>
          <span className="welcome__btn-text">
            <strong>Lighting Recipes</strong>
            <small>Browse proven setups for any look</small>
          </span>
          <span className="welcome__btn-arrow">{'\u203A'}</span>
        </button>

        {kitSaved && (
          <button
            className="welcome__btn welcome__btn--secondary"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'my_kit' })}
          >
            <span className="welcome__btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </span>
            <span className="welcome__btn-text">
              <strong>My Kit</strong>
              <small>View and manage your saved gear</small>
            </span>
            <span className="welcome__btn-arrow">{'\u203A'}</span>
          </button>
        )}

        {savedCount > 0 && (
          <button
            className="welcome__btn welcome__btn--secondary"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
          >
            <span className="welcome__btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
            </span>
            <span className="welcome__btn-text">
              <strong>Saved Setups</strong>
              <small>{savedCount} saved setup{savedCount !== 1 ? 's' : ''}</small>
            </span>
            <span className="welcome__btn-arrow">{'\u203A'}</span>
          </button>
        )}

        {adminModes.map(mode => (
          <ModeCard key={mode.id} mode={mode} onSelect={handleModeSelect} />
        ))}

        {/* Back to V1 link */}
        <button
          className="welcome__btn welcome__btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
          style={{ opacity: 0.5 }}
        >
          <span className="welcome__btn-text">
            <strong>&larr; Back to Current Homepage</strong>
            <small>Return to the live version</small>
          </span>
        </button>

        <div className="welcome__build">v2 mockup</div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
