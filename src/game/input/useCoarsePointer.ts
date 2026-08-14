"use client";

import { useEffect, useState } from "react";

/** True on phones / tablets where an on-screen stick should replace tap-to-move. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => {
      const touch =
        mq.matches ||
        navigator.maxTouchPoints > 0 ||
        "ontouchstart" in window;
      setCoarse(touch && window.innerWidth < 1024);
    };
    update();
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return coarse;
}
