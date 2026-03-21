export default function LoadingScreen() {
  return (
    <div className="screen">
      <div className="loading-screen">
        <span className="loading-screen__icon">
          {/* Studio monolight icon */}
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Stand pole */}
            <rect x="19" y="26" width="2" height="10" rx="1" fill="currentColor" opacity="0.5"/>
            {/* Head body */}
            <rect x="10" y="10" width="20" height="14" rx="3" fill="currentColor" opacity="0.9"/>
            {/* Fresnel lens rings */}
            <circle cx="20" cy="17" r="5" stroke="var(--color-bg)" strokeWidth="1.5" opacity="0.6"/>
            <circle cx="20" cy="17" r="3" stroke="var(--color-bg)" strokeWidth="1" opacity="0.4"/>
            {/* Barn door top */}
            <rect x="8" y="7" width="10" height="3" rx="1" fill="currentColor" opacity="0.6"
              transform="rotate(-15 8 7)"/>
            {/* Barn door bottom */}
            <rect x="22" y="20" width="10" height="3" rx="1" fill="currentColor" opacity="0.6"
              transform="rotate(15 22 20)"/>
          </svg>
        </span>
        <span className="loading-screen__text">Setting up your lights&hellip;</span>
        <div className="loading-bar">
          <div className="loading-bar__fill" />
        </div>
      </div>
    </div>
  );
}
