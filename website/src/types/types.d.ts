type Coord = [number, number];

interface HipparcosEntry {
  HIP: number
  DEICRS: number
  RAICRS: number
  Vmag: number
  coords: Coord
}

declare interface Array<T> {
   at(index: number): T | undefined;
}
