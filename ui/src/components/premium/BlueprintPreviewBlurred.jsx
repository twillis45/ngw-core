/** BlueprintPreviewBlurred — locked blueprint visual above paywall headline.
 *  Always blurred. Establishes locked value before pricing. */
export default function BlueprintPreviewBlurred() {
  return (
    <div className="ngw-blueprint-preview" aria-hidden="true">
      <div className="ngw-blueprint-preview__rows">
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--wide" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--med" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--short" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--wide" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--med" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--short" />
        <div className="ngw-blueprint-preview__row ngw-blueprint-preview__row--wide" />
      </div>
    </div>
  );
}
