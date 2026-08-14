import type { ThemeId } from "../types";

const MUTE_KEY = "loopternity.muted";

export type MusicBed = "menu" | "game" | "none";

type SfxName =
  | "click"
  | "boost"
  | "hit"
  | "shield"
  | "enemy"
  | "gameover"
  | "nearMiss"
  | "start"
  | "success";

const MUSIC = {
  menu: "/audio/music/menu.mp3",
  game: {
    volcanic: "/audio/music/volcanic.mp3",
    planetary: "/audio/music/planetary.mp3",
    antarctica: "/audio/music/antarctica.mp3",
  },
} as const;

/** Theme-flavored SFX with shared fallbacks. */
const SFX: Record<SfxName, { shared: string; theme?: Partial<Record<ThemeId, string>> }> = {
  click: { shared: "/audio/sfx/click.ogg" },
  start: { shared: "/audio/sfx/start.ogg" },
  boost: {
    shared: "/audio/sfx/boost.mp3",
    theme: {
      volcanic: "/audio/sfx/boost-volcanic.mp3",
      planetary: "/audio/sfx/boost-planetary.mp3",
      antarctica: "/audio/sfx/boost-antarctica.mp3",
    },
  },
  hit: {
    shared: "/audio/sfx/hit.mp3",
    theme: {
      volcanic: "/audio/sfx/hit-volcanic.mp3",
      planetary: "/audio/sfx/hit-planetary.mp3",
      antarctica: "/audio/sfx/hit-antarctica.mp3",
    },
  },
  shield: {
    shared: "/audio/sfx/shield.mp3",
    theme: {
      volcanic: "/audio/sfx/shield-volcanic.mp3",
      planetary: "/audio/sfx/shield-planetary.mp3",
      antarctica: "/audio/sfx/shield-antarctica.ogg",
    },
  },
  enemy: {
    shared: "/audio/sfx/enemy.ogg",
    theme: {
      volcanic: "/audio/sfx/enemy-volcanic.ogg",
      planetary: "/audio/sfx/enemy-planetary.mp3",
      antarctica: "/audio/sfx/enemy-antarctica.ogg",
    },
  },
  nearMiss: {
    shared: "/audio/sfx/nearmiss.ogg",
    theme: {
      planetary: "/audio/sfx/nearmiss-planetary.mp3",
      antarctica: "/audio/sfx/nearmiss-antarctica.ogg",
    },
  },
  gameover: {
    shared: "/audio/sfx/gameover-heavy.mp3",
  },
  success: { shared: "/audio/sfx/start.ogg" },
};

/**
 * Real-track audio bus for LOOPTERNITY.
 * Music = HTMLAudioElement loops (per theme). SFX = one-shot Audio clones.
 */
class AudioManager {
  private music: HTMLAudioElement | null = null;
  private musicKey = "";
  private muted = false;
  private bed: MusicBed = "none";
  private themeId: ThemeId = "volcanic";
  private unlocked = false;
  private musicVol = 0.55;
  private sfxVol = 0.72;
  private preloadDone = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    }
  }

  isMuted() {
    return this.muted;
  }

  async unlock() {
    if (typeof window === "undefined") return;
    this.unlocked = true;
    this.preload();
    if (!this.muted && this.bed !== "none") {
      await this.ensureMusicPlaying();
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    }
    if (this.music) {
      this.music.muted = muted;
      if (muted) {
        this.music.pause();
      } else if (this.bed !== "none") {
        void this.unlock().then(() => this.ensureMusicPlaying());
      }
    } else if (!muted && this.bed !== "none") {
      void this.unlock().then(() => this.ensureMusicPlaying());
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setTheme(themeId: ThemeId) {
    if (this.themeId === themeId) return;
    this.themeId = themeId;
    if (this.bed === "game") {
      void this.ensureMusicPlaying(true);
    }
  }

  playBed(bed: MusicBed) {
    if (this.bed === bed && bed !== "game") {
      // still refresh if same bed but music never started
      if (bed !== "none" && this.unlocked && !this.muted) {
        void this.ensureMusicPlaying();
      }
      return;
    }
    this.bed = bed;
    if (bed === "none") {
      this.stopMusic();
      return;
    }
    void this.ensureMusicPlaying(true);
  }

  sfx(name: SfxName) {
    if (this.muted || typeof window === "undefined") return;
    void this.unlock().then(() => {
      const entry = SFX[name];
      const src = entry.theme?.[this.themeId] ?? entry.shared;
      const el = new Audio(src);
      el.volume = this.sfxVol;
      el.play().catch(() => {
        /* autoplay / decode race — ignore */
      });
    });
  }

  // --- internals -----------------------------------------------------------

  private preload() {
    if (this.preloadDone || typeof window === "undefined") return;
    this.preloadDone = true;
    const urls = [
      MUSIC.menu,
      MUSIC.game.volcanic,
      MUSIC.game.planetary,
      MUSIC.game.antarctica,
    ];
    for (const src of urls) {
      const a = new Audio();
      a.preload = "auto";
      a.src = src;
    }
  }

  private trackForBed(): string | null {
    if (this.bed === "menu") return MUSIC.menu;
    if (this.bed === "game") return MUSIC.game[this.themeId];
    return null;
  }

  private stopMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.removeAttribute("src");
    this.music.load();
    this.music = null;
    this.musicKey = "";
  }

  private async ensureMusicPlaying(forceRestart = false) {
    if (typeof window === "undefined") return;
    const src = this.trackForBed();
    if (!src || this.muted) {
      if (this.muted) this.music?.pause();
      return;
    }

    const key = `${this.bed}:${src}`;
    if (!forceRestart && this.music && this.musicKey === key && !this.music.paused) {
      return;
    }

    if (!this.music) {
      this.music = new Audio();
      this.music.loop = true;
      this.music.preload = "auto";
    }

    // Soft restart when switching themes / beds
    if (this.musicKey !== key || forceRestart) {
      try {
        this.music.pause();
      } catch {
        /* ignore */
      }
      this.music.src = src;
      this.musicKey = key;
      this.music.currentTime = 0;
    }

    this.music.volume = this.musicVol;
    this.music.muted = this.muted;
    this.music.loop = true;

    try {
      await this.music.play();
    } catch {
      // Needs a user gesture — unlock() will retry
    }
  }
}

export const audio = new AudioManager();
