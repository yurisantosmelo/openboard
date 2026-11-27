import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Register extra compact font sizes and custom design-system shadows so tailwind-merge resolves them accurately.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs', '3xs', '4xs', '5xs'],
      shadow: ['card'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
