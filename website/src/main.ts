import { Deck } from '@deck.gl/core/typed';
import { ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers/typed';
import { AnimatedArcLayer } from './animatedArcLayer.ts';
import {_GlobeView as GlobeView} from '@deck.gl/core/typed';
import './style.css';
import { kdTree } from 'kd-tree-javascript';
import throttle from 'lodash.throttle'

const L = [[0, 1], [0, 0], [1, 0]];
const I = [[0, 1], [0, 0]];
const N = [[0, 0], [0, 1], [1, 0], [1, 1]];
const U = [ [0, 1], [0,0], [1,0], [1,1] ];
const S = [ [1,1], [0,0.7], [1, 0.3], [0.5, 0], [0, 0.1] ];

type Coord = [number, number];
interface Line { from: Coord, to: Coord };

function haversineDistance(coords1: { RAICRS: number, DEICRS: number }, coords2: { RAICRS: number, DEICRS: number }) {
  function toRad(x: number) {
    return x * Math.PI / 180;
  }

  var lon1 = coords1.RAICRS;
  var lat1 = coords1.DEICRS;

  var lon2 = coords2.RAICRS;
  var lat2 = coords2.DEICRS;

  var x1 = lat2 - lat1;
  var dLat = toRad(x1);
  var x2 = lon2 - lon1;
  var dLon = toRad(x2)
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c;
}

interface HipparcosEntry {
  HIP: number
  DEICRS: number
  RAICRS: number
  Vmag: number
  coords: Coord
}


const INITIAL_VIEW_STATE = {
  latitude: 0,
  longitude: 0,
  zoom: 1
};

const view = new GlobeView({id: 'globe', resolution: 1 });
let data: HipparcosEntry[] = [];
let backgroundLayer = new SolidPolygonLayer({
  id: 'background',
  data: [
    [[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]]
  ],
  getPolygon: d => d,
  stroked: false,
  filled: true,
  material: false,
  opacity: 1,
  visible: true,
  getFillColor: [20, 20, 20, 255],
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: { inertia: 1000 },
  parameters: {
    cull: true,
    clearColor: [0, 0, 0, 255],
  },
  layers: [backgroundLayer],
  views: view
});

fetch('/hipparcos.json')
  .then(r => r.json())
  .then(d => {
    data = d.data
    // @ts-ignore
      .map(e => Object.fromEntries(e.map((c, i) => [d.metadata[i].name, c])))
    // @ts-ignore
      .filter(e => e.RAICRS && e.DEICRS)
      .map(e => ({...e, coords: [e.RAICRS, e.DEICRS]}));

    const index = new kdTree(data, haversineDistance, ['RAICRS', 'DEICRS']);

    const getNearest = (toPoint: Pick<HipparcosEntry, 'RAICRS' | 'DEICRS'>, count: number): [HipparcosEntry, number][] => {
      // @ts-ignore
      return index.nearest(toPoint, count);
    }

    let starLayer = new ScatterplotLayer<HipparcosEntry>({
      id: 'stars',
      data,
      stroked: false,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: 'pixels',
      getRadius: d => 8 - d.Vmag,
      getPosition: d => [d.coords[0], -d.coords[1]],
    })

    let intervalId: number | null = null;
    let previousNearest: number | null = null;

    const drawName = throttle((vs: { zoom: number, latitude: number, longitude: number }) => {
      const vpObj = { RAICRS: vs.longitude < 0 ? 360 + vs.longitude : vs.longitude, DEICRS: -vs.latitude } ;
      const nearestStar = getNearest(vpObj, 1)?.[0]?.[0];
      if (!nearestStar || nearestStar.HIP === previousNearest) {
        return;
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      previousNearest = nearestStar.HIP;

      // const pixelScale = Math.pow(2, (vs.zoom + 8));
      // const unit = 3000 / pixelScale;

      const selectedStarLayer = new ScatterplotLayer<HipparcosEntry>({ 
        id: 'selected-star',
        data: nearestStar ? [nearestStar] : [], 
        getFillColor: [255, 0, 0, 255],
        getRadius: 20,
        radiusUnits: 'pixels',
        getPosition: d => [d.RAICRS, -d.DEICRS]
      });

      let lines: Line[] = [];
      let usedHips = [nearestStar.HIP];
      let currentStar = nearestStar;
      for (let i = 0; i < 50; i++) {
        let queryQuantity = 2;
        let query = getNearest(currentStar, queryQuantity);
        while (query.every(([star, _]) => usedHips.includes(star.HIP)) && queryQuantity < 10) {
          queryQuantity++;
          query = getNearest(currentStar, queryQuantity);
        }
        const res = query.find(([star, _]) => !usedHips.includes(star.HIP));
        if (!res) {
          break;
        }
        const [newStar, dist] = res;
        usedHips.push(newStar.HIP);
        lines.push({ from: currentStar.coords, to: newStar.coords });

        currentStar = newStar;
      }

      let progress = 0;
      intervalId = setInterval(() => {
        progress += 0.5;
        if (intervalId && (progress >= lines.length)) {
          console.log('cancelling', progress)
          clearInterval(intervalId);
          return;
        }
        deck.setProps({
          layers: [backgroundLayer, selectedStarLayer, 
            new AnimatedArcLayer({ 
              id: 'selected-star-line',
              data: lines, 
              greatCircle: true,
              getWidth: 3,
              widthUnits: 'pixels',
              getSourceColor: [0, 255, 0, 255],
              getTargetColor: [0, 255, 0, 255],
              getSourcePosition: d => [d.from[0], -d.from[1]],
              getTargetPosition: d => [d.to[0], -d.to[1]],
              coef: progress
            }),
            starLayer
          ]
        });
       }, 10)
    }, 50);

    deck.setProps({
      onViewStateChange: (vs) => {
        if ('zoom' in vs.viewState) {
          // @ts-ignore
          drawName(vs.viewState);
        }
      },
      layers: [backgroundLayer, starLayer],
    })
  });
