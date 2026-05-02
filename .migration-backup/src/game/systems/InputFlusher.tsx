import { useFrame } from '@react-three/fiber';
import { flushInput } from './InputSystem';

export function InputFlusher() {
  // Priority -999 runs FIRST in R3F v8 (ascending sort).
  // With double-buffered input, flush MUST run first:
  // it swaps accumulated DOM events into the readable buffer
  // before any consumer (Player, BuildMode, etc.) reads them.
  useFrame(() => {
    flushInput();
  }, -999);
  return null;
}
