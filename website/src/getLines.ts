import { add, angleFromXAxis, rotateAround, divide, magnitude, multiply } from "./utils/vector";

const L: Coord[] = [[0, 1], [0, 0], [1, 0]];
const I: Coord[] = [[0, 1], [0, 0]];
const N: Coord[] = [[0, 0], [0, 1], [1, 0], [1, 1]];
const U: Coord[] = [ [0, 1], [0,0], [1,0], [1,1] ];
const S: Coord[] = [ [1,1], [0,0.7], [1, 0.3], [0.5, 0], [0, 0.1] ];

type partialHipparcos = Pick<HipparcosEntry, 'RAICRS' | 'DEICRS'>;
type nearestFunction = (toPoint: partialHipparcos, count: number, maxDistance?: number) => [HipparcosEntry, number][];

const toCoords = (p: partialHipparcos): Coord => [p.RAICRS, p.DEICRS];
const toScreen = (c: Coord): Coord => [c[0], -c[1]];
const toHipparcos = (c: Coord) => ({ RAICRS: c[0], DEICRS: c[1] });

const distanceBetweenLetters = 1;
const okayRadius = 0.3;
const ORIGIN: Coord = [0, 0];

export const getLines = (getNearest: nearestFunction, vpObj: partialHipparcos, zoom: number): { path: Coord[]; }[] => {
  const pixelScale = Math.pow(2, (zoom + 8));
  const unit = 5000 / pixelScale;

  let startPoint = add(toScreen(toCoords(vpObj)), multiply([-3, -1], unit));
  let direction: Coord = [1, 0];

  const paths = [L, I, N, U, S].map(letter => {
    direction = divide(direction, magnitude(direction));
    startPoint = add(startPoint, multiply(direction, distanceBetweenLetters * unit));

    const starNodes = letter.map(p => {
      const skyCoords = add(startPoint, multiply(rotateAround(ORIGIN, p, angleFromXAxis(ORIGIN, direction)), unit));
      let nearbyStars = getNearest(toHipparcos(toScreen(skyCoords)), 10, okayRadius * unit).map(c => c[0]);
      
      if (nearbyStars.length == 0) {
        console.log('getting nearest')
        nearbyStars = getNearest(toHipparcos(skyCoords), 1).map(c => c[0]);
      }

      const bestStar = nearbyStars.reduce((currMin, star) => {
        if (!currMin) {
          return star;
        }
        if (currMin.Vmag < star.Vmag) {
          return currMin;
        }
      }, undefined as undefined | HipparcosEntry);

      return bestStar ? toScreen(toCoords(bestStar)) : skyCoords;
    });

    startPoint = add(startPoint, [Math.max(...letter.map(c => c[0])), Math.min(...letter.map(c => c[1]))])
    return { path: starNodes }
  });

  return paths;
}
