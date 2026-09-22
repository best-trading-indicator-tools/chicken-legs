interface GalleryBase {
  id: string;
  title: string;
  caption: string;
  alt: string;
  thumbnail: string;
  width: number;
  height: number;
  position?: string;
}

export type GalleryItem = GalleryBase & (
  | { kind: 'photo'; src: string }
  | { kind: 'video'; src: string; duration: string }
);

export const galleryItems: GalleryItem[] = [
  {
    id: 'stair-sprints', kind: 'video', title: 'Stairs count as leg day.',
    caption: 'A stair-sprint session. These legs do get used.',
    alt: 'David sprinting up an outdoor staircase during training',
    thumbnail: '/gallery/stair-sprints-poster.webp', src: '/gallery/stair-sprints.mp4',
    width: 900, height: 1600, duration: '0:08', position: '50% 45%',
  },
  {
    id: 'seafront-back', kind: 'photo', title: 'The legs in question.',
    caption: 'The other side of the story.',
    alt: 'David from behind in red shorts on a palm-lined promenade',
    thumbnail: '/gallery/seafront-back-thumb.webp', src: '/gallery/seafront-back.webp',
    width: 960, height: 1280, position: '50% 60%',
  },
  {
    id: 'training-selfie', kind: 'photo', title: 'Hi, I’m David.',
    caption: 'The person behind the legs, the posts, and this whole idea.',
    alt: 'David smiling in a cap and headphones at an outdoor workout area',
    thumbnail: '/gallery/training-selfie-thumb.webp', src: '/gallery/training-selfie.webp',
    width: 810, height: 1440, position: '50% 18%',
  },
  {
    id: 'hanging-knee-raises', kind: 'video', title: 'Putting in the reps.',
    caption: 'Hanging knee raises at the outdoor gym.',
    alt: 'David performing hanging knee raises on outdoor exercise bars',
    thumbnail: '/gallery/hanging-knee-raises-poster.webp', src: '/gallery/hanging-knee-raises.mp4',
    width: 900, height: 1600, duration: '0:12', position: '50% 45%',
  },
  {
    id: 'quad-closeup', kind: 'photo', title: 'A closer look.',
    caption: 'One of the quads that started the conversation.',
    alt: 'Close-up of David’s quad beside turquoise shorts',
    thumbnail: '/gallery/quad-closeup-thumb.webp', src: '/gallery/quad-closeup.webp',
    width: 960, height: 720, position: '25% 55%',
  },
  {
    id: 'stair-jumps', kind: 'video', title: 'Taking the stairs.',
    caption: 'Stair jumps from another training session.',
    alt: 'David jumping up a wide outdoor staircase',
    thumbnail: '/gallery/stair-jumps-poster.webp', src: '/gallery/stair-jumps.mp4',
    width: 900, height: 1600, duration: '0:12', position: '50% 30%',
  },
  {
    id: 'sunshine-selfie', kind: 'photo', title: 'Out in the sun.',
    caption: 'A little sunshine between workouts.',
    alt: 'David taking a close-up selfie in the sunshine, wearing a cap',
    thumbnail: '/gallery/sunshine-selfie-thumb.webp', src: '/gallery/sunshine-selfie.webp',
    width: 917, height: 1222, position: '50% 18%',
  },
];
