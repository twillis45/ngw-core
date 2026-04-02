import { useDispatch } from '../context/AppContext';
import { GALLERY_ITEMS } from '../data/exampleData';

/**
 * Homepage section: horizontal-scroll gallery of example images.
 * Tapping an image triggers the upload flow (file picker).
 */
export default function ExampleGallery({ onUploadClick }) {
  const dispatch = useDispatch();

  function handleItemClick(item) {
    // For now, all gallery items trigger the file upload flow.
    // In future, items with pre-baked data could navigate directly to ref_eval.
    if (onUploadClick) {
      onUploadClick();
    }
  }

  return (
    <div className="hp-section hp-gallery">
      <h2 className="hp-section__title">Try It On Any Photo</h2>
      <p className="hp-section__sub">
        Tap an image to see the full analysis — or upload your own.
      </p>

      <div className="hp-gallery__scroll">
        {GALLERY_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            className="hp-gallery__item"
            onClick={() => handleItemClick(item)}
          >
            <div
              className="hp-gallery__thumb"
              style={{ background: item.gradient }}
            />
            <div className="hp-gallery__label">{item.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
