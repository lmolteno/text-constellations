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
const toNormalized = (p: partialHipparcos) => ({ 
  RAICRS: p.RAICRS < 0 
    ? p.RAICRS + 360 
    : p.RAICRS > 360
      ? p.RAICRS - 360
      : p.RAICRS,
  DEICRS: p.DEICRS
});
const lerp = (a: number, b: number, alpha: number) => a + alpha * (b - a);

const distToMeridian = (ra: number): number => (ra < 180 ? ra : 360 - ra);

const normalizePath = (coords: Coord[]): Coord[][] => {
  if (coords.length == 0) {
    return [];
  }
  let polylines: Coord[][] = [];
  coords.forEach((c, i, a) => {
    if (!polylines.at(-1)?.length) {
      polylines.push([c]);
      return;
    }
    if (i === a.length - 1) {
      polylines.at(-1)?.push(c);
      return;
    }
    const next = a[i+1];
    const distance = Math.abs(next[0] - c[0])
    if (distance > 180) {
      const meridDist = distToMeridian(c[0]);
      const meetingDec = lerp(c[1], next[1], meridDist / (meridDist + distToMeridian(next[0])))
      const leftMiddle: Coord = [360, meetingDec];
      const rightMiddle: Coord = [0, meetingDec];
      if (c[0] > 180) {
        polylines.at(-1)?.push(c, leftMiddle);
        polylines.push([rightMiddle]);
      } else {
        polylines.at(-1)?.push(c, rightMiddle);
        polylines.push([leftMiddle]);
      }
      return;
    }
    polylines.at(-1)?.push(c);
  });
  return polylines;
}


const distanceBetweenLetters = 0.5;
const okayRadius = 0.01;
const ORIGIN: Coord = [0, 0];

const letters = [L, I, N, U, S];

export const getLines = (getNearest: nearestFunction, vpObj: partialHipparcos, zoom: number): { path: Coord[]; }[] => {
  const pixelScale = Math.pow(2, (zoom + 8));
  const unit = 5000 / pixelScale;

  let startPoint = add(toScreen(toCoords(vpObj)), multiply([-3, -1], unit));
  let direction: Coord = [1, 0];

  let blacklist: number[] = [];

  const paths = letters.flatMap(letter => {
    direction = divide(direction, magnitude(direction));
    startPoint = add(startPoint, multiply(direction, distanceBetweenLetters * unit));

    let trueNodes: Coord[] = [];

    const starNodes = letter.map(p => {
      const skyCoords = add(startPoint, multiply(rotateAround(ORIGIN, p, angleFromXAxis(ORIGIN, direction)), unit));
      const screenCoords = toNormalized(toHipparcos(toScreen(skyCoords)));
      let nearbyStars = getNearest(screenCoords, 10, okayRadius * unit)
        .map(c => c[0])
        .filter(s => !blacklist.includes(s.HIP));

      let limit = 1;
      while (nearbyStars.length == 0) {
        console.log(`finding nearest ${limit}`)
        nearbyStars = getNearest(screenCoords, limit)
          .map(c => c[0])
          .filter(s => !blacklist.includes(s.HIP));
        limit++;
      }

      const bestStar = nearbyStars.reduce((currMin, star) => {
        if (!currMin) {
          return star;
        }
        if (currMin.Vmag > star.Vmag) {
          return star;
        }
        return currMin;
      }, undefined as undefined | HipparcosEntry);

      if (bestStar) {
        blacklist.push(bestStar.HIP);
      } else {
        console.log(nearbyStars)
        console.log("could not find star");
      }
      trueNodes.push(skyCoords);

      return bestStar ? toScreen(toCoords(bestStar)) : skyCoords;
    });

    startPoint = add(startPoint, multiply([Math.max(...letter.map(c => c[0])), Math.min(...letter.map(c => c[1]))], unit))
    return normalizePath(starNodes).map(p => ({ path: p }));
  });

  console.log(paths);
  return paths;
}
