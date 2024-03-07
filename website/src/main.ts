import { Deck } from '@deck.gl/core/typed';
import { ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers/typed';
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

let index: kdTree<HipparcosEntry> | undefined = undefined;

let deck: Deck;


deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: { inertia: 1000 },
  parameters: {
    // cull: true,
    clearColor: [0, 0, 0, 255],
    depthTest: false
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
      .filter(e => e.RAICRS && e.DEICRS);

    index = new kdTree(data, haversineDistance, ['RAICRS', 'DEICRS']);
    let starLayer = new ScatterplotLayer<HipparcosEntry>({
      id: 'stars',
      data,
      stroked: false,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: 'pixels',
      getRadius: d => 8 - d.Vmag,
      getPosition: d => {
      return [d.RAICRS, -d.DEICRS]
      },
    })

    const drawName = throttle((vs: { zoom: number, latitude: number, longitude: number }) => {
      // @ts-ignore
      const nearestStar = index?.nearest({ RAICRS: vs.longitude, DEICRS: -vs.latitude, coords: [vs.longitude, -vs.latitude] }, 1)?.[0]?.[0];
      deck.setProps({
        layers: [backgroundLayer, new ScatterplotLayer<HipparcosEntry>({
          id: 'stars',
          data,
          stroked: false,
          getFillColor: [255, 255, 255, 255],
          radiusUnits: 'pixels',
          getRadius: d => d.HIP === nearestStar?.HIP ? 20 : 8 - d.Vmag,
          getPosition: d => {
          return [d.RAICRS, -d.DEICRS]
          },
        })]
      });
    }, 100);

    deck.setProps({
      onViewStateChange: (vs) => {
        if ('zoom' in vs.viewState) {
          // @ts-ignore
          drawName(vs.viewState);
        }
      },
      layers: [backgroundLayer, starLayer]
    })
  });
