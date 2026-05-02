/**
 * Complete cinematic menu screen.
 * Combines the 3D world background with the menu UI overlay.
 * Simplified for single global world entry.
 */
import { MenuScene3D } from './MenuScene3D';
import { MenuOverlay } from './MenuOverlay';

interface Props {
  onEnterWorld: (playerName: string) => Promise<void>;
  isReconnecting: boolean;
}

export function CinematicMenu({ onEnterWorld, isReconnecting }: Props) {
  return (
    <div className="w-screen h-screen relative overflow-hidden">
      {/* 3D cinematic world background */}
      <MenuScene3D />
      
      {/* UI overlay on top */}
      <MenuOverlay 
        onEnterWorld={onEnterWorld}
        isReconnecting={isReconnecting}
      />
      
      {/* Subtle animated vignette effect */}
      <div 
        className="absolute inset-0 z-5 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.4) 100%)',
          animation: 'pulse 8s ease-in-out infinite',
        }}
      />
      
      {/* Bottom gradient for grounding */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32 z-5 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
