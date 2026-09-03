"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type GrokCharacterInstance = {
  destroy(): void;
  setState(state: "idle" | "happy" | "listening", options?: { resetEyes?: boolean }): void;
};

type GrokCharacterConstructor = new (
  svg: SVGSVGElement,
  options: {
    color: "black";
    followPointer: false;
    loginWrap: true;
    mode: "manual";
    shape: "squircle";
    sizePx: number;
    state: "idle";
  },
) => GrokCharacterInstance;

declare global {
  interface Window {
    GrokCharacter?: GrokCharacterConstructor;
  }
}

const VENDOR_ROOT = "/vendor/grok-icon-study";
const ENGINE_SCRIPTS = [
  "geometry-data.js",
  "math.js",
  "tables.js",
  "pose.js",
  "tricks.js",
  "eyes.js",
  "fx.js",
  "character.js",
] as const;

const MOOD_LOOP = [
  { state: "idle", duration: 2_400 },
  { state: "happy", duration: 6_400 },
  { state: "listening", duration: 2_400 },
] as const;

export function SeekCompanion() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loadedScripts, setLoadedScripts] = useState(0);
  const engineReady = loadedScripts === ENGINE_SCRIPTS.length;

  useEffect(() => {
    if (!engineReady || !svgRef.current || !window.GrokCharacter) return;

    const character = new window.GrokCharacter(svgRef.current, {
      color: "black",
      followPointer: false,
      loginWrap: true,
      mode: "manual",
      shape: "squircle",
      sizePx: 180,
      state: "idle",
    });
    svgRef.current.dataset.state = MOOD_LOOP[0].state;

    let phase = 0;
    let timer: number;
    const advance = () => {
      phase = (phase + 1) % MOOD_LOOP.length;
      character.setState(MOOD_LOOP[phase].state);
      if (svgRef.current) svgRef.current.dataset.state = MOOD_LOOP[phase].state;
      timer = window.setTimeout(advance, MOOD_LOOP[phase].duration);
    };
    timer = window.setTimeout(advance, MOOD_LOOP[0].duration);

    return () => {
      window.clearTimeout(timer);
      character.destroy();
    };
  }, [engineReady]);

  return <div className="seek-companion">
    <svg ref={svgRef} className="seek-companion__canvas" role="img" aria-label="Seek 吉祥物" />
    {!engineReady && <Script
      key={ENGINE_SCRIPTS[loadedScripts]}
      src={`${VENDOR_ROOT}/${ENGINE_SCRIPTS[loadedScripts]}`}
      strategy="afterInteractive"
      onReady={() => setLoadedScripts((count) => Math.min(count + 1, ENGINE_SCRIPTS.length))}
    />}
  </div>;
}
