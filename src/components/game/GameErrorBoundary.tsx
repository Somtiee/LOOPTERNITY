"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { message: string | null };

/** Keeps a thrown render error from becoming a white screen. */
export class GameErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return { message };
  }

  render() {
    if (!this.state.message) return this.props.children;

    return (
      <main className="flex h-dvh w-full flex-col items-center justify-center bg-[#070309] px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.28em] text-[#ffe08a]">
          LOOPTERNITY
        </p>
        <p className="mt-4 max-w-sm text-sm text-white/70">
          The climb hit a snag. Your run is safe to retry — this is not a
          white screen.
        </p>
        <p className="mt-2 max-w-sm text-[11px] text-white/40">
          {this.state.message}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ message: null })}
          className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#ffe08a] px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608]"
        >
          RETRY
        </button>
      </main>
    );
  }
}
