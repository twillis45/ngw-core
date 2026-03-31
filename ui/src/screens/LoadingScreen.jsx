import NGWLogo from '../components/NGWLogo';

export default function LoadingScreen() {
  return (
    <div className="screen loading-screen-wrap">
      <div className="loading-screen">
        <NGWLogo size="lg" loading={true} />
        <span className="loading-screen__text">Setting up your lights&hellip;</span>
      </div>
    </div>
  );
}
