'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { ArrowUpRight } from 'lucide-react';
import styles from './roast-story.module.css';

const posts = [
  {
    id: '2099147589551788373',
    title: 'Post 1 · September 13',
    date: 'September 13, 2026',
    dateTime: '2026-09-13',
    text: '99.99% of my life people told me I had chicken legs\n\nhow about now 🥱?',
  },
  {
    id: '2100833699583656270',
    title: 'Post 2 · September 18',
    date: 'September 18, 2026',
    dateTime: '2026-09-18',
    text: 'I\'m tired of those virtue-signaling gurus preaching the "healthy-life" being the only way to get the body/mind you want…',
  },
];

type TwitterWindow = Window & {
  twttr?: {
    widgets: {
      createTweet: (id: string, target: HTMLElement, options: {
        theme: 'dark'; cards: 'hidden'; conversation: 'none'; dnt: boolean; lang: string;
      }) => Promise<HTMLElement | undefined>;
    };
  };
};

function RoastTweet({ post, scriptReady }: { post: typeof posts[number]; scriptReady: boolean }) {
  const tweetUrl = `https://x.com/david_attisaas/status/${post.id}`;
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const target = container.current;
    const widgets = (window as TwitterWindow).twttr?.widgets;
    if (!scriptReady || !target || !widgets) return;

    // Keep X's DOM separate from React and discard any embed from an earlier mount.
    const mount = document.createElement('div');
    target.appendChild(mount);
    let cancelled = false;
    widgets.createTweet(post.id, mount, {
      theme: 'dark', cards: 'hidden', conversation: 'none', dnt: true, lang: 'en',
    }).then(element => {
      if (!cancelled && element) setLoaded(true);
    }).catch(() => {
      // The source text and link stay usable when X cannot load.
    });

    return () => { cancelled = true; mount.remove(); };
  }, [scriptReady, post.id]);

  return <section className={styles.tweetSource} aria-label={`Original tweet — ${post.date}`}>
    <div className={styles.tweetHeading}>
      <h3>{post.title}</h3>
      <a href={tweetUrl} target="_blank" rel="noopener noreferrer">Read the replies <ArrowUpRight size={16} aria-hidden="true" /><span className={styles.screenReaderOnly}> on X (opens in a new tab)</span></a>
    </div>
    <div ref={container} className={styles.tweetEmbed} />
    {!loaded && <blockquote className={styles.tweetFallback}>
      <div><strong>David Attias</strong><span>@david_attisaas</span></div>
      <p>{post.text}</p>
      <a href={tweetUrl} target="_blank" rel="noopener noreferrer"><time dateTime={post.dateTime}>{post.date}</time><span className={styles.screenReaderOnly}> — open the original tweet on X (opens in a new tab)</span></a>
    </blockquote>}
  </section>;
}

export default function RoastTweets() {
  const [scriptReady, setScriptReady] = useState(false);

  return <>
    {posts.map(post => <RoastTweet key={post.id} post={post} scriptReady={scriptReady} />)}
    <Script id="roast-tweet-widgets" src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" onReady={() => setScriptReady(true)} />
  </>;
}
