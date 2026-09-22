'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Camera, Expand, Play, X } from 'lucide-react';
import { galleryItems, type GalleryItem } from '@/lib/gallery';
import styles from './david-gallery.module.css';

function GalleryThumbnail({ item }: { item: GalleryItem }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={styles.thumbnailFallback}><Camera size={32} aria-hidden="true" /><span>Open {item.kind}</span></span> :
    <img className={styles.thumbnail} src={item.thumbnail} alt={item.alt} width={item.width} height={item.height}
      style={{ objectPosition: item.position }} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export default function DavidGallery() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isOpen = activeIndex !== null;
  const activeItem = activeIndex === null ? null : galleryItems[activeIndex];

  const closeGallery = useCallback(() => {
    videoRef.current?.pause();
    setActiveIndex(null);
  }, []);

  function changeMedia(direction: number) {
    videoRef.current?.pause();
    setMediaFailed(false);
    setActiveIndex(index => index === null ? null : (index + direction + galleryItems.length) % galleryItems.length);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!isOpen) {
      if (dialog.open) {
        dialog.close();
        openerRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  return <>
    <section id="the-gallery" className={styles.section} aria-labelledby="gallery-heading">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}><Camera size={16} aria-hidden="true" /> FROM MY CAMERA ROLL</span>
          <h2 id="gallery-heading">BEHIND THE<br /><span>CHICKEN LEGS.</span></h2>
        </div>
        <div className={styles.intro}>
          <div className={styles.identity}>
            <img src="/gallery/sunshine-selfie-thumb.webp" width={48} height={48} alt="" loading="lazy" decoding="async" />
            <div><strong>David Attias</strong><a href="https://x.com/david_attisaas" target="_blank" rel="noopener noreferrer">@david_attisaas <ArrowUpRight size={14} aria-hidden="true" /></a></div>
          </div>
          <p>A few training sessions, a little sunshine, and the person behind this whole idea.</p>
        </div>
      </div>

      <div className={styles.grid}>
        {galleryItems.map((item, index) => <button key={item.id} type="button" className={styles.card}
          data-featured={index < 3} data-gallery-item={item.id}
          aria-label={`${item.kind === 'video' ? 'Play video' : 'View photo'}: ${item.title}`}
          aria-haspopup="dialog" aria-controls="gallery-dialog"
          onClick={event => { openerRef.current = event.currentTarget; setMediaFailed(false); setActiveIndex(index); }}>
          <GalleryThumbnail item={item} />
          <span className={styles.shade} aria-hidden="true" />
          <span className={styles.badge} aria-hidden="true">{item.kind === 'video' ? <><Play size={11} fill="currentColor" /> VIDEO · {item.duration}</> : <><Camera size={13} /> PHOTO</>}</span>
          {item.kind === 'video' && <span className={styles.play} aria-hidden="true"><Play size={23} fill="currentColor" /></span>}
          <span className={styles.cardFooter} aria-hidden="true"><span>{item.title}</span><span className={styles.openIcon}>{item.kind === 'video' ? <ArrowUpRight size={18} /> : <Expand size={17} />}</span></span>
        </button>)}
      </div>

      <div className={styles.footer}>
        <p><span className={styles.dot} aria-hidden="true" /> 3 photos · 3 videos <span className={styles.footerHint}>· Open any moment</span></p>
        <a href="#sponsorships">Back these legs <ArrowUpRight size={17} aria-hidden="true" /></a>
      </div>
    </section>

    <dialog ref={dialogRef} id="gallery-dialog" className={styles.dialog} aria-labelledby="gallery-media-title"
      aria-describedby="gallery-media-caption" onCancel={event => { event.preventDefault(); closeGallery(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeGallery();
      }}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], video[controls]');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          return;
        }
        if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        // Keep native video controls' arrow-key seeking and volume behavior.
        if (event.target instanceof HTMLVideoElement) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          changeMedia(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}>
      {activeItem && <>
        <div className={styles.dialogHeader}>
          <span><Camera size={16} aria-hidden="true" /> DAVID’S CAMERA ROLL</span>
          <div><span className={styles.counter} aria-live="polite">{activeIndex! + 1} / {galleryItems.length}</span><button type="button" className={styles.iconButton} aria-label="Close gallery" onClick={closeGallery} autoFocus><X size={23} /></button></div>
        </div>
        <div className={styles.mediaStage}
          onTouchStart={event => {
            if (event.touches.length !== 1 || event.target instanceof HTMLVideoElement) { touchStart.current = null; return; }
            touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          }}
          onTouchEnd={event => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || !event.changedTouches.length) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMedia(dx < 0 ? 1 : -1);
          }}>
          {mediaFailed ? <div className={styles.mediaError} role="status"><Camera size={30} aria-hidden="true" /><p>This {activeItem.kind} couldn’t load.</p><a href={activeItem.src} target="_blank" rel="noopener noreferrer">Open it in a new tab <ArrowUpRight size={16} /></a></div> : activeItem.kind === 'video' ?
            <video key={activeItem.id} ref={videoRef} className={styles.fullMedia} src={activeItem.src} poster={activeItem.thumbnail}
              controls playsInline autoPlay muted preload="none" aria-label={activeItem.alt} onError={() => setMediaFailed(true)} /> :
            <img key={activeItem.id} className={styles.fullMedia} src={activeItem.src} alt={activeItem.alt} onError={() => setMediaFailed(true)} />}
        </div>
        <div className={styles.dialogFooter}>
          <div className={styles.caption}><h3 id="gallery-media-title">{activeItem.title}</h3><p id="gallery-media-caption">{activeItem.caption}</p></div>
          <div className={styles.navigation}>
            <button className={styles.iconButton} type="button" aria-label="Previous gallery item" onClick={() => changeMedia(-1)}><ArrowLeft size={22} /></button>
            <button className={styles.iconButton} type="button" aria-label="Next gallery item" onClick={() => changeMedia(1)}><ArrowRight size={22} /></button>
          </div>
        </div>
      </>}
    </dialog>
  </>;
}
