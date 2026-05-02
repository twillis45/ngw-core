export default function LoadingScreen() {
  return (
    <div className="screen loading-screen-wrap">
      <div className="loading-screen">
        <div className="processing-stage" aria-hidden="true">
          <div className="processing-frame">
            <span className="processing-corner processing-corner--tl" />
            <span className="processing-corner processing-corner--tr" />
            <span className="processing-corner processing-corner--bl" />
            <span className="processing-corner processing-corner--br" />
            <span className="processing-sweep" />
            <span className="processing-reticle" />
          </div>
        </div>
        <span className="loading-screen__text">Setting up your lights&hellip;</span>
      </div>
    </div>
  );
}
