'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Flag, X } from 'lucide-react';
import { formatUsd, type PublicSlot } from '@/lib/campaign';
import styles from './sponsor-dialog.module.css';

interface SponsorDialogProps {
  open: boolean;
  slots: PublicSlot[];
  loading: boolean;
  loadError: boolean;
  refreshing: boolean;
  onClose: () => void;
  onRetry: () => void;
  onChooseSpot: () => void;
}

function SponsorLogo({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.logo} aria-hidden="true">
    {url && !failed
      ? <img src={url} alt="" width={30} height={30} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <span>{name.trim().slice(0, 1).toUpperCase()}</span>}
  </span>;
}

export default function SponsorDialog({ open, slots, loading, loadError, refreshing, onClose, onRetry, onChooseSpot }: SponsorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sponsoredSlots = slots.filter(slot => slot.sponsor !== null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return <dialog
    ref={dialogRef}
    id="sponsors-dialog"
    className={styles.dialog}
    aria-labelledby="sponsors-title"
    aria-describedby="sponsors-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={onClose}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >
    <header className={styles.header}>
      <div><h2 id="sponsors-title">Meet the sponsors</h2><p id="sponsors-description">The brands currently backing these legs. Amounts in USD.</p></div>
      <button className={styles.close} type="button" aria-label="Close sponsors" onClick={onClose} autoFocus><X size={23} /></button>
    </header>
    <div className={styles.content}>
      {loadError ? <div className={styles.state} role="status">
        <h3>Sponsor list temporarily unavailable.</h3>
        <p>We couldn’t check the current sponsors. Please try again.</p>
        <button className={styles.action} type="button" onClick={onRetry} disabled={refreshing}>{refreshing ? 'Checking sponsors…' : 'Retry sponsor list'} <ArrowUpRight size={16} /></button>
      </div> : loading ? <p className={styles.loading} role="status">Loading sponsors…</p> : sponsoredSlots.length ? <ul className={styles.list} aria-label="Current sponsors">
        {sponsoredSlots.map(slot => <li className={styles.row} key={slot.id} data-sponsor-slot={slot.id}>
          <div className={styles.sponsor}>
            <h3>{slot.label}</h3>
            <a className={styles.brand} href={slot.sponsor!.website} target="_blank" rel="noopener noreferrer sponsored">
              <SponsorLogo key={slot.sponsor!.logoUrl ?? slot.sponsor!.name} name={slot.sponsor!.name} url={slot.sponsor!.logoUrl} />
              <span>{slot.sponsor!.name}</span><ArrowUpRight className={styles.external} size={14} aria-hidden="true" />
            </a>
          </div>
          <span className={styles.amount} aria-label={`${formatUsd(slot.currentBidCents)} USD accepted sponsorship`}>{formatUsd(slot.currentBidCents)}</span>
        </li>)}
      </ul> : <div className={styles.state}>
        <Flag className={styles.emptyIcon} size={30} aria-hidden="true" />
        <h3>Your brand could be first.</h3>
        <p>No sponsors yet. Choose a zone to explore its sponsorship.</p>
        <button className={styles.action} type="button" onClick={onChooseSpot}>Choose a sponsorship spot <ArrowUpRight size={16} /></button>
      </div>}
    </div>
    {!loadError && !loading && sponsoredSlots.length > 0 && <footer className={styles.footer}>
      <p>Previous sponsors remain in the bid history.</p>
      <button className={styles.action} type="button" onClick={onChooseSpot}>Explore the spots <ArrowUpRight size={15} /></button>
    </footer>}
  </dialog>;
}
