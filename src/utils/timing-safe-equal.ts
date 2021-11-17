import { timingSafeEqual as timingSafeEqualArr } from 'worktop/crypto';

export function timingSafeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  return timingSafeEqualArr(aa, bb);
}
