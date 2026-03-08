export default function LoadingScreen() {
  return (
    <div className="screen">
      <div className="loading-screen">
        <span className="loading-screen__icon">{'\u{1F526}'}</span>
        <span className="loading-screen__text">Setting up your lights&hellip;</span>
        <div className="loading-bar">
          <div className="loading-bar__fill" />
        </div>
      </div>
    </div>
  );
}
