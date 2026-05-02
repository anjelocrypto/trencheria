import { useFrame } from '@react-three/fiber';
import { getMovementInput } from './InputSystem';

interface Props {
  buildMode: boolean;
  onToggle: () => void;
  onCycle: (dir: number) => void;
  onCancelBuild: () => void;
}

// Handles build mode input — toggle B, cycle Q/R, cancel ESC/right-click
export function BuildModeController({ buildMode, onToggle, onCycle, onCancelBuild }: Props) {
  useFrame(() => {
    const input = getMovementInput();

    if (input.buildToggle) {
      onToggle();
      return;
    }

    if (buildMode) {
      if (input.buildCancel) {
        onCancelBuild();
      }
      if (input.buildNext) {
        onCycle(1);
      }
      if (input.buildPrev) {
        onCycle(-1);
      }
    }
  });

  return null;
}
