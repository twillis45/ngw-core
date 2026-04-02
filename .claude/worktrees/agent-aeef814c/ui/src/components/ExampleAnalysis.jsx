import { useState } from 'react';
import DiagramCard from '../cards/DiagramCard';
import { EXAMPLE_ANALYSES } from '../data/exampleData';

/**
 * Homepage section: showcases a static example analysis
 * with reference image + lighting diagram + result chips.
 * Cycles through 3 examples via tab buttons.
 */
export default function ExampleAnalysis() {
  const [activeIdx, setActiveIdx] = useState(0);
  const example = EXAMPLE_ANALYSES[activeIdx];

  if (!example) return null;

  return (
    <div className="hp-section hp-example">
      <h2 className="hp-section__title">See What NGW Finds</h2>
      <p className="hp-section__sub">
        Upload any reference photo and get the complete lighting breakdown.
      </p>

      {/* Example selector tabs */}
      <div className="hp-example__tabs">
        {EXAMPLE_ANALYSES.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            className={`hp-example__tab${i === activeIdx ? ' hp-example__tab--active' : ''}`}
            onClick={() => setActiveIdx(i)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* 2-col grid: image + diagram */}
      <div className="hp-example__grid">
        <div className="hp-example__image-wrap">
          {example.thumbnail ? (
            <img
              src={example.thumbnail}
              alt={example.label}
              className="hp-example__img"
            />
          ) : (
            <div
              className="hp-example__placeholder"
              style={{ background: example.placeholderGradient }}
            >
              <span className="hp-example__placeholder-label">{example.category}</span>
            </div>
          )}
        </div>
        <div className="hp-example__diagram-wrap">
          <DiagramCard spec={example.diagramSpec} inline />
        </div>
      </div>

      {/* Result chips */}
      <div className="hp-example__chips">
        <span className="hp-example__chip hp-example__chip--accent">
          {example.chips.pattern}
        </span>
        <span className="hp-example__chip">
          {example.chips.camera}
        </span>
        <span className="hp-example__chip">
          {example.chips.modifier}
        </span>
        <span className="hp-example__chip">
          {example.lightCount} light{example.lightCount !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="hp-example__desc">{example.description}</p>
    </div>
  );
}
