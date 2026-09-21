import { ArrowUpRight, Flame } from 'lucide-react';
import RoastTweet from './roast-tweet';
import styles from './roast-story.module.css';

export default function RoastStory() {
  return <section className={styles.section} id="the-story" aria-labelledby="roast-title">
    <div className={styles.copy}>
      <span className="eyebrow"><Flame size={17} aria-hidden="true" /> THE COMMENTS THAT STARTED IT</span>
      <h2 id="roast-title">THEY ROASTED<br />MY LEGS.<br /><span>I FOUND MY FUEL.</span></h2>
      <p>My coach and chiropractor see a soccer midfielder. The internet sees… chicken legs. And the comment section did not hold back.</p>
      <p>I laughed. Then I got motivated. Now I want to show the world <strong>how strong these legs really are.</strong></p>
      <p>On November 8, I’m putting them to the test at the Nice–Cannes marathon. All 42.195 kilometres. Consider it my very long reply.</p>
      <a className={styles.cta} href="#sponsorships">Be part of the comeback <ArrowUpRight size={18} aria-hidden="true" /></a>
    </div>
    <figure className={styles.evidence}>
      <div className={styles.imageHeading}><span className={styles.liveDot} aria-hidden="true" /> THE INTERNET HAS ENTERED THE CHAT</div>
      <a className={styles.imageLink} href="/images/chicken-legs-roasts-800.webp" target="_blank" rel="noopener noreferrer" aria-label="Open the roast collage at full size in a new tab">
        <img src="/images/chicken-legs-roasts-800.webp" width={800} height={800} loading="lazy" decoding="async" alt="A collage of real comments roasting my legs: ‘They are still chicken’, ‘You’re showing me leg bones I didn’t even know existed’, and ‘And… you’ve never had a leg day in your life.’" />
      </a>
      <figcaption>
        <div className={styles.captionRow}><span>Actual comments. Unexpected motivation.</span><a href="/images/chicken-legs-roasts-800.webp" target="_blank" rel="noopener noreferrer">View collage <ArrowUpRight size={16} aria-hidden="true" /><span className={styles.screenReaderOnly}> (opens in a new tab)</span></a></div>
        <RoastTweet />
      </figcaption>
    </figure>
  </section>;
}
