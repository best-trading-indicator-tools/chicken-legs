'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { ArrowUpRight } from 'lucide-react';
import styles from './roast-story.module.css';

const tweetId = '2099147589551788373';
const tweetUrl = `https://x.com/david_attisaas/status/${tweetId}`;

type TwitterWindow = Window & {
  twttr?: {
    widgets: {
      createTweet: (id: string, target: HTMLElement, options: {
        theme: 'dark'; cards: 'hidden'; conversation: 'none'; dnt: boolean; lang: string;
      }) => Promise<HTMLElement | undefined>;
    };
  };
};

export default function RoastTweet() {
  const container = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const target = container.current;
    const widgets = (window as TwitterWindow).twttr?.widgets;
    if (!scriptReady || !target || !widgets) return;

    // Keep X's DOM separate from React and discard any embed from an earlier mount.
    const mount = document.createElement('div');
    target.appendChild(mount);
    let cancelled = false;
    widgets.createTweet(tweetId, mount, {
      theme: 'dark', cards: 'hidden', conversation: 'none', dnt: true, lang: 'en',
    }).then(element => {
      if (!cancelled && element) setLoaded(true);
    }).catch(() => {
      // The source text and link stay usable when X cannot load.
    });

    return () => { cancelled = true; mount.remove(); };
  }, [scriptReady]);

  return <section className={styles.tweetSource} aria-label="Original tweet">
    <div className={styles.tweetHeading}>
      <h3>The tweet that started it</h3>
      <a href={tweetUrl} target="_blank" rel="noopener noreferrer">Read the replies <ArrowUpRight size={16} aria-hidden="true" /><span className={styles.screenReaderOnly}> on X (opens in a new tab)</span></a>
    </div>
    <div ref={container} className={styles.tweetEmbed} />
    {!loaded && <blockquote className={styles.tweetFallback}>
      <div><strong>David Attias</strong><span>@david_attisaas</span></div>
      <p>99.99% of my life people told me I had chicken legs<br /><br />how about now 🥱?</p>
      <a href={tweetUrl} target="_blank" rel="noopener noreferrer"><time dateTime="2026-09-13">September 13, 2026</time><span className={styles.screenReaderOnly}> — open the original tweet on X (opens in a new tab)</span></a>
    </blockquote>}
    <Script id="roast-tweet-widgets" src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" onReady={() => setScriptReady(true)} />
  </section>;
}
