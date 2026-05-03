import { devLog, devWarn } from '../utils/devLog';
import { Component, ReactNode, Suspense, useEffect } from 'react';

interface SceneErrorBoundaryState {
  hasError: boolean;
}

export class SceneErrorBoundary extends Component<{ children: ReactNode }, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SceneDiag] R3F subtree error caught', error);
    console.error('[SceneDiag] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function SceneSuspenseFallback() {
  useEffect(() => {
    devWarn('[SceneDiag] Scene suspended — waiting for 3D assets/components');
    const timeout = window.setTimeout(() => {
      console.error('[SceneDiag] Scene still suspended after 5000ms');
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
      devLog('[SceneDiag] Scene suspense resolved');
    };
  }, []);

  return null;
}

export function SceneDiagnosticsBoundary({ children }: { children: ReactNode }) {
  return (
    <SceneErrorBoundary>
      <Suspense fallback={<SceneSuspenseFallback />}>
        {children}
      </Suspense>
    </SceneErrorBoundary>
  );
}
