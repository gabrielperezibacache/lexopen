"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import styles from "./EditorialMotion.module.css";
import ink from "./EditorialInk.module.css";

const subjects = {
  casefiles: { es: "del expediente", en: "case file" },
  billing: { es: "del libro contable", en: "accounting ledger" },
  deadlines: { es: "del reloj de bolsillo", en: "pocket watch" },
  research: { es: "de la lupa", en: "magnifying glass" },
};

type DataConnection = EventTarget & { saveData?: boolean };

const FIRST_PLAY_DELAY = 900;
const REST_BETWEEN_CYCLES = 14_000;
const PLAYBACK_RATE = .8;

/** Quiet automatic cycles, suspended for user preferences, visibility or an explicit pause. */
export function EditorialMotion({
  stillSrc,
  motionSrc,
  subject,
}: {
  stillSrc: string;
  motionSrc: string;
  subject: keyof typeof subjects;
}) {
  const { locale } = useI18n();
  const english = locale === "en";
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingFrame = useRef<{ video: HTMLVideoElement; id: number; kind: "video" | "paint" } | null>(null);
  const playAttempt = useRef(0);
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [resting, setResting] = useState(true);
  const [round, setRound] = useState(0);
  const [autoAllowed, setAutoAllowed] = useState<boolean | null>(null);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(false);
  const [intent, setIntent] = useState<"auto" | "manual" | "paused">("auto");
  const eligible = (autoAllowed === true || intent === "manual") && intent !== "paused" && inView && tabVisible && !failed && !blocked;
  const name = subjects[subject];
  const action = failed
    ? english ? "Retry" : "Reintentar"
    : eligible ? english ? "Pause" : "Pausar"
    : intent === "paused" ? english ? "Resume" : "Reanudar"
    : english ? "Play" : "Reproducir";
  const label = english ? `${action} ${name.en} animation` : `${action} animación ${name.es}`;

  const cancelFrame = useCallback(() => {
    const pending = pendingFrame.current;
    if (!pending) return;
    if (pending.kind === "video") pending.video.cancelVideoFrameCallback(pending.id);
    else window.cancelAnimationFrame(pending.id);
    pendingFrame.current = null;
  }, []);

  const pauseVideo = useCallback((video: HTMLVideoElement | null) => {
    playAttempt.current += 1;
    cancelFrame();
    video?.pause();
  }, [cancelFrame]);

  const playVideo = useCallback((video: HTMLVideoElement) => {
    const attempt = ++playAttempt.current;
    cancelFrame();
    if (video.ended) { setResting(true); video.currentTime = 0; }
    video.muted = true;
    video.playbackRate = PLAYBACK_RATE;
    void video.play().catch((error: unknown) => {
      if (attempt !== playAttempt.current) return;
      setResting(true);
      if (error instanceof DOMException && error.name === "NotAllowedError") setBlocked(true);
      else { setFailed(true); setActivated(false); setReady(false); }
    });
  }, [cancelFrame]);

  const presentVideo = useCallback((video: HTMLVideoElement) => {
    cancelFrame();
    if (video.paused) return;
    const attempt = playAttempt.current;
    function reveal(mediaTime?: number) {
      pendingFrame.current = null;
      if (attempt !== playAttempt.current || videoRef.current !== video || video.paused || video.ended) return;
      // A seek can leave the previous decoded frame queued in the compositor.
      if (video.seeking || (mediaTime !== undefined && Math.abs(mediaTime - video.currentTime) > .25)) { schedule(); return; }
      setReady(true);
      setResting(false);
    }
    function schedule() {
      if (typeof video.requestVideoFrameCallback === "function") {
        const id = video.requestVideoFrameCallback((_, frame) => reveal(frame.mediaTime));
        pendingFrame.current = { video, id, kind: "video" };
      } else {
        const id = window.requestAnimationFrame(() => reveal());
        pendingFrame.current = { video, id, kind: "paint" };
      }
    }
    schedule();
  }, [cancelFrame]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: DataConnection }).connection;
    function preferencesChanged() { setAutoAllowed(!motion.matches && !connection?.saveData); }
    function visibilityChanged() { setTabVisible(!document.hidden); }
    preferencesChanged();
    visibilityChanged();
    motion.addEventListener("change", preferencesChanged);
    connection?.addEventListener("change", preferencesChanged);
    document.addEventListener("visibilitychange", visibilityChanged);

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= .25), { threshold: .25 });
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", preferencesChanged);
      connection?.removeEventListener("change", preferencesChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!eligible) { pauseVideo(video); return; }
    if (intent === "manual" && video) {
      // The click already called play() inside its user-activation event.
      // Only resume here after returning to the viewport or visible tab.
      if (video.paused) playVideo(video);
      return () => pauseVideo(video);
    }
    const delay = !activated ? intent === "manual" ? 0 : FIRST_PLAY_DELAY
      : video?.ended && intent === "auto" ? REST_BETWEEN_CYCLES : 0;
    const timer = window.setTimeout(() => {
      if (!activated) { setActivated(true); return; }
      if (!video) return;
      playVideo(video);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      pauseVideo(video);
    };
  }, [eligible, activated, round, intent, pauseVideo, playVideo]);

  function toggle() {
    if (eligible) { setIntent("paused"); return; }
    // Mount synchronously so stricter media policies receive play() during the click.
    if (!videoRef.current) flushSync(() => setActivated(true));
    setFailed(false);
    setBlocked(false);
    setIntent("manual");
    if (videoRef.current) playVideo(videoRef.current);
  }

  function finishCycle() {
    setResting(true);
    setIntent("auto");
    setRound(value => value + 1);
  }

  return (
    <div ref={rootRef} className={styles.root} data-editorial-motion={subject}
      data-editorial-ready={activated && ready && !resting && (eligible || intent === "paused") || undefined}
      data-editorial-user-control={autoAllowed === false || intent === "paused" || failed || blocked || undefined}>
      <div className={styles.frame}>
        <Image src={stillSrc} width={640} height={360} alt="" aria-hidden="true" unoptimized className={`${styles.still} ${ink.ink}`} />
        {activated && (
          <video
            ref={videoRef}
            src={motionSrc}
            width={640}
            height={360}
            muted
            playsInline
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
            className={`${styles.video} ${ink.ink}`}
            onPlaying={event => presentVideo(event.currentTarget)}
            onSeeking={() => { cancelFrame(); setResting(true); }}
            onEnded={finishCycle}
            onError={() => { cancelFrame(); setActivated(false); setReady(false); setResting(true); setFailed(true); }}
          />
        )}
      </div>
      <button type="button" onClick={toggle} className={styles.toggle} aria-label={label} title={label} aria-busy={eligible && activated && !ready || undefined}>
        {failed ? <RotateCcw size={14} aria-hidden="true" /> : eligible ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        <span className="sr-only">{action}</span>
      </button>
      {failed && <span className="sr-only" role="status">{english ? "The animation could not be played. The illustration remains available." : "No se pudo reproducir la animación. La ilustración sigue disponible."}</span>}
    </div>
  );
}
