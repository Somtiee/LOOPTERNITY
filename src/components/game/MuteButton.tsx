"use client";

import { useEffect, useState } from "react";
import { audio } from "@/game/audio/AudioManager";

type MuteButtonProps = {
  className?: string;
  size?: "sm" | "md";
};

function SpeakerOn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5v5h3.2L12 18.5V5.5L7.2 9.5H4Z"
        fill="currentColor"
      />
      <path
        d="M15.2 9.2a3.2 3.2 0 0 1 0 5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17.4 7a5.6 5.6 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerOff({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5v5h3.2L12 18.5V5.5L7.2 9.5H4Z"
        fill="currentColor"
      />
      <path
        d="M16 9.5 20.5 14.5M20.5 9.5 16 14.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MuteButton({ className = "", size = "md" }: MuteButtonProps) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(audio.isMuted());
  }, []);

  const dim = size === "sm" ? "h-11 w-11 sm:h-9 sm:w-9" : "h-11 w-11";
  const icon = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";

  return (
    <button
      type="button"
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Unmute" : "Mute"}
      onClick={() => {
        void audio.unlock();
        const next = audio.toggleMute();
        setMuted(next);
        if (!next) audio.sfx("click");
      }}
      className={`pointer-events-auto inline-flex ${dim} items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white/80 backdrop-blur-sm transition hover:border-white/30 hover:bg-black/55 hover:text-white active:scale-95 ${className}`}
    >
      {muted ? <SpeakerOff className={icon} /> : <SpeakerOn className={icon} />}
    </button>
  );
}
