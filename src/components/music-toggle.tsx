'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Music2, VolumeX } from 'lucide-react';
import styles from './music-toggle.module.css';

const musicUrl = '/audio/chicken-legs-anthem-v2.mp3';

export default function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wantsPlayback = useRef(false);
  const request = useRef(0);
  const [status, setStatus] = useState<'off' | 'loading' | 'on'>('off');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      request.current++;
      wantsPlayback.current = false;
      audio?.pause();
    };
  }, []);

  function playbackFailed() {
    request.current++;
    wantsPlayback.current = false;
    setStatus('off');
    setFailed(true);
  }

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;
    const attempt = ++request.current;
    wantsPlayback.current = !wantsPlayback.current;
    setFailed(false);

    if (!wantsPlayback.current) {
      audio.pause();
      setStatus('off');
      return;
    }

    // Assign the source only after a click, keeping the initial page silent and light.
    if (!audio.getAttribute('src') || audio.error) audio.src = musicUrl;
    audio.volume = 0.4;
    setStatus('loading');
    try {
      await audio.play();
      if (request.current === attempt) setStatus(audio.paused ? 'off' : 'on');
    } catch {
      // A newer pause/play click may have intentionally cancelled this attempt.
      if (request.current === attempt) playbackFailed();
    }
  }

  return <>
    <div className={styles.control}>
      {failed && <p id="music-error" className={styles.error} role="status">Music couldn’t load. Try again.</p>}
      <button type="button" className={styles.button} onClick={toggleMusic}
        aria-label="Background music" aria-pressed={status === 'on'} aria-busy={status === 'loading'}
        aria-describedby={failed ? 'music-error' : undefined}
        title={status === 'loading' ? 'Cancel music playback' : status === 'on' ? 'Pause background music' : 'Play background music'}>
        {status === 'loading' ? <LoaderCircle size={19} className={styles.loading} aria-hidden="true" /> : status === 'on' ? <Music2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
        <span>{status === 'loading' ? 'Music…' : status === 'on' ? 'Music on' : 'Music off'}</span>
      </button>
    </div>
    <audio ref={audioRef} loop preload="none" hidden
      onPlaying={() => {
        if (wantsPlayback.current) setStatus('on');
        else audioRef.current?.pause();
      }}
      onPause={() => {
        if (!audioRef.current?.paused) return;
        wantsPlayback.current = false;
        setStatus('off');
      }}
      onError={playbackFailed} />
  </>;
}
