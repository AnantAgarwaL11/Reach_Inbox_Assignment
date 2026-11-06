import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combines clsx (conditional classes) with tailwind-merge (deduplication).
// Without twMerge, classes like "px-2 px-4" would both be included;
// twMerge correctly keeps only the last one.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
