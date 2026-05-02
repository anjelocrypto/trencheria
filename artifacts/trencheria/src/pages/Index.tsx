import { useState, useCallback } from 'react';
import { GameScene } from '../game/GameScene';
import { CinematicMenu } from '../game/menu/CinematicMenu';
import { MenuScene3D } from '../game/menu/MenuScene3D';
import { LoadingOverlay } from '../game/menu/LoadingOverlay';
import { useMultiplayer } from '../game/multiplayer/useMultiplayer';

type AppMode = 'lobby' | 'loading' | 'game';

const Index = () => {
  const [appMode, setAppMode] = useState<AppMode>('lobby');
  const [sceneReady, setSceneReady] = useState(false);
  const [overlayDone, setOverlayDone] = useState(false);
  const multiplayer = useMultiplayer();

  const handleEnterWorld = useCallback(async (playerName: string) => {
    await multiplayer.enterWorld(playerName);
    setSceneReady(false);
    setOverlayDone(false);
    setAppMode('loading');
  }, [multiplayer.enterWorld]);

  const handleSceneReady = useCallback(() => {
    console.log('[Index] Scene reported ready — will fade out overlay');
    setSceneReady(true);
  }, []);

  const handleOverlayFadeComplete = useCallback(() => {
    console.log('[Index] Overlay fade complete — entering game mode');
    setOverlayDone(true);
    setAppMode('game');
  }, []);

  const handleLeave = useCallback(async () => {
    await multiplayer.leaveWorld();
    setAppMode('lobby');
    setSceneReady(false);
    setOverlayDone(false);
  }, [multiplayer.leaveWorld]);

  if (appMode === 'lobby') {
    return (
      <CinematicMenu
        onEnterWorld={handleEnterWorld}
        isReconnecting={false}
      />
    );
  }

  // In 'loading' and 'game' modes, GameScene is always mounted.
  // The LoadingOverlay sits on top and fades out only when StartupReadiness
  // confirms the Canvas has rendered stable frames.
  return (
    <>
      <GameScene
        multiplayer={multiplayer}
        onLeaveWorld={handleLeave}
        onSceneReady={handleSceneReady}
      />
      {/* Loading overlay stays on top until scene is truly ready */}
      {!overlayDone && (
        <LoadingOverlay
          ready={sceneReady}
          onFadeComplete={handleOverlayFadeComplete}
        />
      )}
    </>
  );
};

export default Index;
