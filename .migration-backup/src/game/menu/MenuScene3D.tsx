/**
 * Lightweight cinematic landing screen.
 * NO 3D Canvas, NO GLB loading, NO terrain, NO realtime.
 * Pure CSS atmosphere to eliminate all asset egress on the landing page.
 */
export function MenuScene3D() {
  return (
    <div className="absolute inset-0 z-0" style={{
      background: 'linear-gradient(135deg, #0a0a14 0%, #1a1020 30%, #0d1520 60%, #0a0a14 100%)',
    }}>
      {/* Animated gradient overlay for depth */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsla(30,40%,15%,0.4) 0%, transparent 70%)',
      }} />
      
      {/* Subtle star-like particles via CSS */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 2 + 1,
              height: Math.random() * 2 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `hsla(${40 + Math.random() * 20}, 30%, ${50 + Math.random() * 30}%, ${0.2 + Math.random() * 0.4})`,
              animation: `pulse ${4 + Math.random() * 6}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Ground fog gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3" style={{
        background: 'linear-gradient(to top, hsla(220,20%,8%,0.8) 0%, transparent 100%)',
      }} />
    </div>
  );
}
