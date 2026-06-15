// The dusk-highway background scene, shared by the home and saved pages.
export default function Scene() {
  const stars = [
    { top: "12%", left: "18%", d: "0s" },
    { top: "20%", left: "78%", d: "0.8s" },
    { top: "9%", left: "55%", d: "1.6s" },
    { top: "26%", left: "33%", d: "2.2s" },
    { top: "16%", left: "88%", d: "1.1s" },
    { top: "30%", left: "65%", d: "0.4s" },
  ];
  return (
    <div className="scene" aria-hidden="true">
      <div className="sky" />
      <div className="stardust" />
      {stars.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{ top: s.top, left: s.left, animationDelay: s.d }}
        />
      ))}
      <div className="sun" />
      <div className="road">
        <div className="road-line" />
      </div>
      <div className="grain" />
      <div className="vignette" />
    </div>
  );
}
