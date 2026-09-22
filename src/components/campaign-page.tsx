'use client';

import PhotoViewer from './photo-viewer';
import RoastStory from './roast-story';
import DavidGallery from './david-gallery';
import MusicToggle from './music-toggle';
import SponsorDialog from './sponsor-dialog';
import sponsorStyles from './sponsor-dialog.module.css';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Crosshair, Flag, Footprints, History, LockKeyhole, MoveHorizontal, Pause, Play, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { campaign, slots, formatUsd, type AuctionSnapshot } from '@/lib/campaign';

const initialAuctions: AuctionSnapshot = { mode: 'preview', paymentsEnabled: false, closed: false, currentTotalCents: 0, slots: slots.map(slot => ({ ...slot, currentBidCents: 0, nextBidCents: campaign.startingBidCents, sponsor: null, history: [], reserved: false })) };

function Countdown() {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, new Date(campaign.biddingClosesAt).getTime() - Date.now()));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, []);
  const days = remaining === null ? '—' : String(Math.floor(remaining / 86400000)).padStart(2, '0');
  const hours = remaining === null ? '—' : String(Math.floor(remaining / 3600000) % 24).padStart(2, '0');
  const minutes = remaining === null ? '—' : String(Math.floor(remaining / 60000) % 60).padStart(2, '0');
  return <div className="countdown" aria-label={`Bidding closes November 1 at 23:59 Paris time. ${days} days, ${hours} hours, ${minutes} minutes remaining.`}>
    <Clock3 size={14} /><span>{remaining === 0 ? 'Bidding has closed' : <><b>{days}</b>d <b>{hours}</b>h <b>{minutes}</b>m <span className="countdown-suffix">to make your move</span></>}</span>
  </div>;
}

export default function CampaignPage() {
  const [auctions, setAuctions] = useState<AuctionSnapshot>(initialAuctions);
  const [selectedId, setSelectedId] = useState('left-quad');
  const [view, setView] = useState<'front' | 'back'>('front');
  const [autoRotate, setAutoRotate] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sponsorsOpen, setSponsorsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [auctionsLoaded, setAuctionsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const rulesDialog = useRef<HTMLDialogElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const selected = auctions.slots.find(slot => slot.id === selectedId) ?? auctions.slots[0];
  const history = auctions.slots.flatMap(slot => slot.history.map(bid => ({ ...bid, slotLabel: slot.label }))).sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());
  const available = auctions.slots.filter(slot => !slot.sponsor).length;

  const changeView = useCallback((nextView: 'front' | 'back') => {
    setAutoRotate(false);
    setView(nextView);
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const respectPreference = () => { if (preference.matches) setAutoRotate(false); };
    respectPreference();
    preference.addEventListener('change', respectPreference);
    return () => preference.removeEventListener('change', respectPreference);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/auctions', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json() as AuctionSnapshot;
      setAuctions(data); setLoadError(false); setAuctionsLoaded(true);
    } catch { setLoadError(true); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session_id');
    if (params.get('checkout') === 'cancelled' || params.get('canceled') === 'true') setPaymentStatus('cancelled');
    if (!session) return;
    setPaymentStatus('pending');
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(session)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json();
        if (active) { setPaymentStatus(result.status); if (result.status === 'accepted') void refresh(); }
      } catch { /* Keep the status pending until the server confirms payment. */ }
    };
    void poll(); const timer = setInterval(poll, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    const dialog = checkoutDialog.current;
    if (checkoutOpen && dialog && !dialog.open) dialog.showModal();
    else if (!checkoutOpen && dialog?.open) dialog.close();
  }, [checkoutOpen]);
  useEffect(() => {
    const dialog = rulesDialog.current;
    if (rulesOpen && dialog && !dialog.open) dialog.showModal();
    else if (!rulesOpen && dialog?.open) dialog.close();
  }, [rulesOpen]);

  function selectSlot(id: string) {
    setSelectedId(id); setError('');
    changeView(slots.find(slot => slot.id === id)?.view ?? 'front');
  }
  function openSlotCheckout(id: string) {
    const slot = auctions.slots.find(slot => slot.id === id);
    if (!slot) return;
    selectSlot(id);
    if (slot.nextBidCents === null || slot.reserved || auctions.closed || loadError) return;
    idempotencyKey.current = crypto.randomUUID(); setCheckoutOpen(true);
  }
  function openCheckout() {
    openSlotCheckout(selectedId);
  }
  function closeSponsorsAndChooseSpot() {
    setSponsorsOpen(false);
    requestAnimationFrame(() => {
      document.getElementById('sponsorships')?.scrollIntoView({ behavior: 'smooth' });
      document.querySelector<HTMLButtonElement>('.slot-row.selected')?.focus({ preventScroll: true });
    });
  }
  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auctionsLoaded || !auctions.paymentsEnabled || auctions.closed || selected.reserved || submitting || loadError || selected.nextBidCents === null) return;
    const data = new FormData(event.currentTarget);
    setSubmitting(true); setError('');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.current ?? crypto.randomUUID() }, body: JSON.stringify({ slotId: selected.id, sponsorName: data.get('sponsorName'), email: data.get('email'), website: data.get('website'), logoUrl: data.get('logoUrl') || undefined, termsAccepted: data.get('terms') === 'on' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Could not open checkout. Please try again.');
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Checkout returned an unexpected address. Please try again.');
      window.location.assign(destination.href);
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); void refresh(); setSubmitting(false); }
  }

  return <>
    <a className="skip-link" href="#sponsorships">Skip to sponsorships</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Chicken Legs home"><span className="brand-chicken">🐔</span><span>CHICKEN<span className="brand-light">LEGS</span><i>✳</i></span></a>
      <div className="header-event"><span className="status-dot" /> THE NICE–CANNES EXPERIMENT <span className="header-year">/ 2026</span></div>
      <div className="header-actions">
        <nav aria-label="Main navigation"><a href="#the-story">The backstory</a><button onClick={() => setRulesOpen(true)}>How it works <ArrowUpRight size={14} /></button></nav>
        <div className="header-music"><MusicToggle /></div>
      </div>
    </header>

    <main>
      {paymentStatus && <div className={`payment-notice ${paymentStatus === 'accepted' ? 'success' : ''}`} role="status">
        <ShieldCheck size={20} /><span>{paymentStatus === 'accepted' ? 'Payment confirmed. Your brand has officially joined leg day.' : paymentStatus === 'cancelled' ? 'Checkout cancelled. No spot has changed hands.' : paymentStatus === 'refunded' ? 'Stripe has issued your refund. Your bank may take time to show it.' : paymentStatus === 'refund_review' ? 'Your refund needs attention. Please contact David for an update.' : paymentStatus === 'review' ? 'Your payment needs review. Please don’t pay again for this spot.' : paymentStatus === 'refunding' ? 'A refund for this sponsorship is being processed.' : paymentStatus === 'expired' ? 'This checkout expired. Choose a spot to try again.' : paymentStatus === 'unknown' ? 'We couldn’t verify this checkout. If you already paid, please contact David before trying again.' : 'Checking your payment. Your sponsorship appears after confirmation.'}{['review', 'refund_review', 'unknown'].includes(paymentStatus) && <> <a href="https://x.com/david_attisaas" target="_blank" rel="noopener noreferrer">Contact David ↗</a></>}</span><button aria-label="Dismiss payment notification" onClick={() => setPaymentStatus(null)}><X size={16} /></button>
      </div>}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="tiny-line" /> QUESTIONABLE LEGS. EXCELLENT AD SPACE.</div>
          <h1 id="hero-title"><span className="headline-line">I’M SELLING</span><span className="headline-line">MY <span className="chicken-word">CHICKEN<svg viewBox="0 0 300 12" aria-hidden="true"><path d="M2 8 Q135 -3 297 6 M18 11 Q160 2 280 10" /></svg></span></span><span className="headline-line lime">LEGS.</span><span className="headline-asterisk">✳</span></h1>
          <p className="hero-description">My coach sees a soccer midfielder.<br />The internet sees chicken legs.<br /><strong>I see a business opportunity.</strong></p>
          <a href="#sponsorships" className="primary-button hero-cta">Put your logo on a leg <ArrowUpRight size={19} /></a>
          <button className={sponsorStyles.trigger} type="button" aria-haspopup="dialog" aria-controls="sponsors-dialog" onClick={() => setSponsorsOpen(true)}>View the Sponsors <ArrowUpRight size={16} /></button>
          <div className="race-ticket"><span className="race-icon"><Footprints size={21} /></span><div><span><span className="race-route">NICE <ArrowRight size={11} /> CANNES</span> MARATHON</span><p>42.195 km. My first marathon. <b>08.11.26</b></p></div></div>
          <p className="hero-footnote">Yes, these are real legs.<br />Yes, your logo really goes on them.</p>
        </div>

        <div className="model-column">
          <div className="model-topline"><span><Crosshair size={13} /> THE PRIME REAL ESTATE</span><span>{auctions.slots.length} SPONSOR SPOTS</span></div>
          <div className="model-stage photo-stage"><PhotoViewer selectedSlot={selectedId} onSelectSlot={selectSlot} view={view} onViewChange={changeView} autoRotate={autoRotate && !checkoutOpen && !rulesOpen && !sponsorsOpen} onAutoViewChange={setView} sponsors={Object.fromEntries(auctions.slots.filter(slot => slot.sponsor).map(slot => [slot.id, { name: slot.sponsor!.name, logoUrl: slot.sponsor!.logoUrl }]))} /></div>
          <div className="model-bottomline"><span><MoveHorizontal size={14} /> PICK A SPOT · CHANGE VIEW</span><div className="view-toggle" aria-label="Photo view"><button type="button" className="view-arrow" aria-label="Previous photo view" aria-keyshortcuts="ArrowLeft" onClick={() => changeView(view === 'front' ? 'back' : 'front')}>←</button><button aria-pressed={view === 'front'} onClick={() => changeView('front')}>Front</button><button aria-pressed={view === 'back'} onClick={() => changeView('back')}>Back</button><button type="button" className="view-arrow" aria-label="Next photo view" aria-keyshortcuts="ArrowRight" onClick={() => changeView(view === 'front' ? 'back' : 'front')}>→</button><button type="button" className="view-arrow" aria-label={autoRotate ? 'Pause automatic photo switching' : 'Resume automatic photo switching'} title={autoRotate ? 'Pause automatic photo switching' : 'Resume automatic photo switching'} onClick={() => setAutoRotate(previous => !previous)}>{autoRotate ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}</button></div></div>
          <div className="model-caption">REAL LEGS. <span>RACE-DAY REAL ESTATE.</span></div>
        </div>

        <aside className="sponsor-panel" id="sponsorships" aria-labelledby="sponsorship-title">
          <div className="panel-status"><span className="status-dot" /> {auctions.closed ? 'BIDDING CLOSED' : auctions.mode === 'live' && auctions.paymentsEnabled ? 'SPONSORSHIPS ARE OPEN' : auctions.mode === 'sandbox' ? 'TEST DRIVE · NO REAL PAYMENTS' : 'FIRST LOOK · BIDDING OPENS SOON'}<span>↗</span></div>
          <div className="panel-intro">
            <div className="panel-heading"><h2 id="sponsorship-title">PICK YOUR<br /> PIECE OF LEG.</h2><p>Click a spot to see sponsorship details.</p></div>
            <div className="panel-footer"><button className="primary-button sponsor-cta" onClick={openCheckout} aria-haspopup="dialog" aria-controls="checkout-dialog" disabled={auctions.closed || selected.reserved || loadError || selected.nextBidCents === null}>{auctions.closed ? 'The legs are spoken for' : selected.reserved ? 'Spot temporarily reserved' : <>Claim the {selected.label.toLowerCase()} <ArrowUpRight size={18} /></>}</button><p><LockKeyhole size={11} /> {auctions.paymentsEnabled ? 'Secure payment with Stripe' : 'Explore a spot · Payments aren’t open yet'}</p></div>
            {loadError && <p className="inline-error" role="status">Spot availability is temporarily unavailable. <button onClick={refresh}>Retry</button></p>}
          </div>
          <div className="slots-list" aria-label="Sponsorship spots">{auctions.slots.map((slot, index) => <button key={slot.id} type="button" className={`slot-row ${selectedId === slot.id ? 'selected' : ''}`} onClick={() => openSlotCheckout(slot.id)} aria-pressed={selectedId === slot.id} aria-haspopup="dialog" aria-controls="checkout-dialog">
            <span className="slot-number">0{index + 1}</span><span className="slot-description"><strong>{slot.label}</strong><span>{slot.reserved ? 'Checkout in progress' : slot.sponsor ? slot.sponsor.name : 'Your brand here'}</span></span><span className="slot-price">{slot.nextBidCents === null ? 'At limit' : formatUsd(slot.nextBidCents)}<span>{slot.sponsor ? 'to take over' : 'opening bid'}</span></span><ArrowUpRight className="slot-arrow" size={15} />
          </button>)}</div>
          <div className="panel-deadline"><Countdown /><span>Closes Nov 1, 23:59 Paris</span></div>
        </aside>
      </section>

      <section className="campaign-stats" aria-label="Campaign at a glance"><div><span className="stat-icon"><Crosshair size={18} /></span><strong>{available}<span> / {auctions.slots.length}</span></strong><span>SPOTS STILL UNCLAIMED</span></div><div><strong>$1,000</strong><span>WHERE THE BIDDING STARTS</span></div><div><strong>2×</strong><span>EACH NEW TAKEOVER</span></div><div><strong>42.195<span> km</span></strong><span>OF VERY PUBLIC ADVERTISING</span></div></section>

      <section className="how-section" id="how-it-works"><div className="section-intro"><div><span className="eyebrow">A BEAUTIFULLY RIDICULOUS DEAL</span><h2>LEG DAY. <span className="serif-word">Pay day.</span></h2></div><p>A little internet banter.<br />A very real sponsorship.</p></div><div className="steps-grid"><article><span className="step-number">01 /</span><Crosshair size={24} /><h3>Pick your spot.</h3><p>Quads, hamstrings, calves or front ankles. Left or right. Claim an open spot for $1,000.</p></article><article><span className="step-number">02 /</span><Sparkles size={24} /><h3>Make your mark.</h3><p>Hold the spot at closing and your logo becomes a temporary tattoo for race day.</p></article><article><span className="step-number">03 /</span><RotateCcw size={24} /><h3>Outbid? Money back.*</h3><p>Every takeover doubles the price. You get refunded, and your brand stays in the bid history.</p></article></div><p className="fee-footnote">*Less the original itemized Stripe fees. <button onClick={() => setRulesOpen(true)}>The completely transparent small print <ArrowUpRight size={12} /></button></p></section>

      <RoastStory />
      <DavidGallery />

      <section className="history-section" id="bid-history"><div className="section-intro"><div><span className="eyebrow">EVERY BID BECOMES PART OF THE STORY</span><h2>THE LEG <span className="serif-word">ledger.</span></h2></div><span className="history-count"><History size={15} /> {history.length} accepted {history.length === 1 ? 'bid' : 'bids'}</span></div>{history.length ? <div className="history-table-wrap"><table><thead><tr><th>Sponsor</th><th>Real estate</th><th>Bid</th><th>Status</th></tr></thead><tbody>{history.map(bid => <tr key={bid.id}><td><a href={bid.website} target="_blank" rel="noopener noreferrer sponsored">{bid.sponsorName} <ArrowUpRight size={12} /></a></td><td>{bid.slotLabel}</td><td>{formatUsd(bid.amountCents)}</td><td><span className={`bid-status ${bid.status}`}>{bid.status === 'current' ? 'Current sponsor' : 'Outbid'}</span></td></tr>)}</tbody></table></div> : <div className="empty-history"><span className="empty-history-icon"><Flag size={27} /></span><div><h3>Great legs. Clean slate.</h3><p>No sponsors yet. Someone gets to say they were here first.</p></div><button onClick={openCheckout}>Make the first move <ArrowUpRight size={17} /></button></div>}</section>

      <section className="faq-section"><h2>FAIR QUESTIONS.</h2><div><details><summary>What exactly does my brand get? <ChevronDown size={18} /></summary><p>If you hold a spot when bidding closes, your logo becomes a temporary tattoo on that muscle for the November 8 marathon. Every accepted sponsor is also mentioned in the website’s bid history, even after being outbid.</p></details><details><summary>How does getting outbid work? <ChevronDown size={18} /></summary><p>Each new sponsor pays exactly double the current bid. After their payment is confirmed, your refund is automatically initiated, less the original itemized Stripe fees. Your brand remains in the history. Refunds may take time to reach your card.</p></details><details><summary>When does bidding close? <ChevronDown size={18} /></summary><p>November 1, 2026 at 23:59 Paris time (22:59 UTC), one week before the race. This leaves time to prepare the winning tattoos.</p></details><details><summary>Is this a half marathon? <ChevronDown size={18} /></summary><p>Nope. The full 42.195 km Marathon des Alpes-Maritimes, from Nice to Cannes, on Sunday November 8, 2026. <a href="https://www.marathon06.com/2026/" target="_blank" rel="noopener noreferrer">Meet the marathon ↗</a></p></details></div></section>
    </main>
    <footer className="site-footer"><a className="brand" href="/"><span className="brand-chicken">🐔</span><span>CHICKEN<span className="brand-light">LEGS</span></span></a><span>A RUNNING JOKE. A REAL MARATHON.</span><button onClick={() => setRulesOpen(true)}>Auction & refund rules <ArrowUpRight size={13} /></button></footer>

    <SponsorDialog open={sponsorsOpen} slots={auctions.slots} loading={!auctionsLoaded} loadError={loadError} refreshing={refreshing} onClose={() => setSponsorsOpen(false)} onRetry={refresh} onChooseSpot={closeSponsorsAndChooseSpot} />
    <dialog ref={checkoutDialog} id="checkout-dialog" className="checkout-dialog" onCancel={() => setCheckoutOpen(false)} onClose={() => setCheckoutOpen(false)} onClick={event => { if (event.target === event.currentTarget) setCheckoutOpen(false); }} aria-labelledby="checkout-title">
      <div className="dialog-content"><button className="dialog-close" aria-label="Close sponsorship" onClick={() => setCheckoutOpen(false)}><X size={20} /></button><span className="eyebrow">YOUR NEXT BIG BRAND PLACEMENT</span><h2 id="checkout-title">THE {selected.label.toUpperCase()}.</h2><div className="checkout-price"><span>{selected.nextBidCents === null ? 'Unavailable' : formatUsd(selected.nextBidCents)} <small>USD</small></span><span>{selected.sponsor ? 'Take over this spot' : 'Opening sponsorship'}</span></div><div className="checkout-benefits"><span><Check size={14} /> Race-day logo tattoo if you win</span><span><Check size={14} /> Your brand in the bid history</span></div>
        {!auctions.paymentsEnabled && <div className="preview-notice"><Clock3 size={17} /><p>{auctions.mode === 'sandbox' ? 'This is a test checkout. No real money will be charged.' : 'Sponsorships aren’t open yet. You can explore the details here before bidding begins.'}</p></div>}
        <form onSubmit={submitCheckout}><label>Brand name<input name="sponsorName" required maxLength={80} placeholder="Your soon-to-be-famous brand" autoComplete="organization" /></label><div className="form-two"><label>Website<input name="website" type="url" required placeholder="https://yourbrand.com" autoComplete="url" /></label><label>Email<input name="email" type="email" required placeholder="you@yourbrand.com" autoComplete="email" /></label></div><label>Logo URL <span className="field-optional">optional</span><input name="logoUrl" type="url" placeholder="https://yourbrand.com/logo.png" /></label><label className="terms-checkbox"><input type="checkbox" name="terms" required /><span>I agree to the auction rules. If outbid, I receive a refund less the original itemized Stripe fees, converted from EUR at the original payment’s exchange rate.</span></label><p className="checkout-fineprint">Bidding closes November 1 at 23:59 Paris time. The next takeover costs {selected.nextBidCents === null ? 'unavailable' : formatUsd(selected.nextBidCents * 2)}. Later exchange-rate differences are covered by us.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={!auctionsLoaded || !auctions.paymentsEnabled || auctions.closed || selected.reserved || selected.nextBidCents === null || submitting || loadError}>{submitting ? 'Opening secure checkout…' : !auctions.paymentsEnabled ? 'Bidding opens soon' : <>Continue to Stripe <ArrowUpRight size={18} /></>}</button><p className="checkout-security"><LockKeyhole size={12} /> {auctions.paymentsEnabled ? 'Payment is processed securely by Stripe.' : 'No payment will be taken in this preview.'}</p></form>
      </div>
    </dialog>
    <dialog ref={rulesDialog} className="rules-dialog" onCancel={() => setRulesOpen(false)} onClose={() => setRulesOpen(false)} onClick={event => { if (event.target === event.currentTarget) setRulesOpen(false); }} aria-labelledby="rules-title"><div className="dialog-content"><button className="dialog-close" aria-label="Close rules" onClick={() => setRulesOpen(false)}><X size={20} /></button><span className="eyebrow">NO FUNNY BUSINESS. JUST FUNNY LEGS.</span><h2 id="rules-title">THE GROUND RULES.</h2><ol><li><strong>Eight spots. Eight independent auctions.</strong> Left and right quads, hamstrings, calves and front ankles each start at $1,000 USD.</li><li><strong>A takeover doubles the price.</strong> $1,000 → $2,000 → $4,000. You hold a spot only after your payment is confirmed.</li><li><strong>The final winner wears the crown.</strong> Hold the spot at closing and your logo will be a temporary tattoo for race day. Accepted sponsors stay in the public bid history.</li><li><strong>Outbid sponsors get a refund.</strong> We initiate a refund of the original USD payment less Stripe’s original itemized payment and conversion fees. Euro fees are converted using the original payment’s exchange rate, rounded to the nearest cent. We absorb later exchange-rate differences and unitemized conversion costs. Refund receipt isn’t instant.</li><li><strong>There is a finish line.</strong> Bidding closes November 1, 2026 at 23:59 Paris time. The marathon is November 8.</li></ol><button className="primary-button" onClick={() => { setRulesOpen(false); document.getElementById('sponsorships')?.scrollIntoView({ behavior: 'smooth' }); }}>Got it. Show me the legs. <ArrowRight size={17} /></button></div></dialog>
  </>;
}
