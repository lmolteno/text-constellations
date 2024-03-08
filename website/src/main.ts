import { Deck, Layer } from '@deck.gl/core/typed';
import { ScatterplotLayer, SolidPolygonLayer, PolygonLayer, PathLayer } from '@deck.gl/layers/typed';
import { AnimatedPathLayer } from './layers/animatedPathLayer.ts';
import {_GlobeView as GlobeView} from '@deck.gl/core/typed';
import './style.css';
import GL from '@luma.gl/constants';
import { kdTree } from 'kd-tree-javascript';
import throttle from 'lodash.throttle';
import turfCircle from '@turf/circle';
import { getLines } from './getLines.ts'; 
import { point } from '@turf/helpers';

// @ts-ignore
import * as arrayAt from 'array.prototype.at';
// @ts-ignore
import * as stringAt from 'string.prototype.at';

if (!Array.prototype.at) arrayAt.shim();
if (!String.prototype.at) stringAt.shim();

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

const INITIAL_VIEW_STATE = {
  latitude: 0,
  longitude: 0,
  zoom: 1
};

const view = new GlobeView({id: 'globe', resolution: 1 });
let data: HipparcosEntry[] = [];
const backgroundLayer = new SolidPolygonLayer({
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
  getCursor: () => 'none',
  parameters: {
    cull: true,
    clearColor: [0, 0, 0, 255],
  },
  layers: [backgroundLayer],
  views: view
});

fetch('hipparcos.json')
  .then(r => r.json())
  .then(d => {
    data = d.data
    // @ts-ignore
      .map(e => Object.fromEntries(e.map((c, i) => [d.metadata[i].name, c])))
    // @ts-ignore
      .filter(e => e.RAICRS && e.DEICRS)
    // @ts-ignore
      .map(e => ({...e, coords: [e.RAICRS, e.DEICRS]}));

    const index = new kdTree(data, haversineDistance, ['RAICRS', 'DEICRS']);

    const getNearest = (toPoint: Pick<HipparcosEntry, 'RAICRS' | 'DEICRS'>, count: number, maxDistance?: number): [HipparcosEntry, number][] => {
      // @ts-ignore
      return index.nearest(toPoint, count, maxDistance);
    }

    let starLayer = new ScatterplotLayer<HipparcosEntry>({
      id: 'stars',
      data,
      stroked: false,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: 'pixels',
      antialiasing: true,
      opacity: 0.7,
      getRadius: d => 8 - d.Vmag,
      getPosition: d => [d.coords[0], -d.coords[1]],
    });

     let selectedStarLayer = new ScatterplotLayer<HipparcosEntry>({ 
       id: 'selected-star',
       data: [], 
       getFillColor: [212, 121, 203, 255],
       getRadius: 10,
       radiusUnits: 'pixels',
       stroked: false,
       visible: false,
       getPosition: d => [d.RAICRS, -d.DEICRS]
     });

    let intervalId: number | null = null;
    let previousNearest: number | null = null;

    let lineLayer = new AnimatedPathLayer<{ path: Coord[] }>({});
    let cursorLayers: Layer[] = [];

    const redraw = () => {
        deck.setProps({
          layers: [
            backgroundLayer, 
            lineLayer,
            selectedStarLayer, 
            starLayer,
            ...cursorLayers
          ]
        });
    };

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

      selectedStarLayer = new ScatterplotLayer<HipparcosEntry>({ 
        id: 'selected-star',
        data: nearestStar ? [nearestStar] : [], 
        getFillColor: [212, 121, 203, 255],
        getRadius: 10,
        radiusUnits: 'pixels',
        stroked: false,
        visible: false,
        getPosition: d => [d.RAICRS, -d.DEICRS]
      });

      let lines = getLines(getNearest, vpObj, vs.zoom)
      let totalPoints = lines.reduce((prev, curr) => prev + curr.path.length, 0);

      let progress = 0;
      intervalId = +setInterval(() => {
        progress += 2;
        if (intervalId && (progress >= totalPoints * 3 * 4)) {
          clearInterval(intervalId);
          return;
        }
        lineLayer = new AnimatedPathLayer({ 
              id: 'selected-star-line',
              data: lines, 
              getWidth: 6,
              jointRounded: true,
              capRounded: true,
              widthUnits: 'pixels',
              getColor: [255, 255, 255, 200],
              coef: progress,
            });
        redraw();
       }, 10)
    }, 50);

    let latestViewState = INITIAL_VIEW_STATE;
    let lastCursorPosition: Coord = [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude];
    let clicked = false;

    const updateCursor = () => {
        const pixelScale = Math.pow(2, (latestViewState.zoom + 8));
        const unit = 150000 / pixelScale;
        const elevationMetres = clicked ? 0 : unit * 500;
        const cursor = turfCircle(point(lastCursorPosition), unit, 64, 'degrees').geometry;
        const elevatedCursor = {...cursor, coordinates: cursor.coordinates.map(p => p.map(c => [c[0], c[1], elevationMetres]))}
        cursorLayers = [
          new PolygonLayer({
            id: 'cursor',
            data: [cursor],
            getFillColor: [255, 255, 255, 255],
            extruded: true,
            material: false,
            getLineWidth: 10,
            opacity: 1,
            lineWidthUnits: 'pixels',
            lineWidthMinPixels: 10,
            getElevation: elevationMetres,
            getPolygon: d => d.coordinates,
            parameters: {
              blendFunc: [GL.SRC_COLOR, GL.DST_COLOR], 
              blendEquation: GL.FUNC_SUBTRACT,
            }
          }),
          new PathLayer({ 
            id: 'cursor-lines',
            data: [cursor, elevatedCursor],
            getPath: d => d.coordinates[0],
            getColor: [0, 100, 140, 255],
            widthUnits: 'pixels',
          visible: false,
            getWidth: 4
          })
        ];
        redraw();
    }
    let wasInTransition = false;

    drawName(INITIAL_VIEW_STATE);
    updateCursor();
    deck.getCanvas()?.addEventListener('mousedown', () => {
      clicked = true;
      updateCursor();
    });
    deck.getCanvas()?.addEventListener('mouseup', () => {
      clicked = false;
      updateCursor();
    });
    deck.setProps({
      onDragEnd: () => {
        drawName(latestViewState);
      },
      onHover: (info) => {
        if (info.coordinate) {
          lastCursorPosition = info.coordinate as Coord;
          updateCursor();
        }
      },
      onInteractionStateChange: (is) => {
        if (is.inTransition) {
          wasInTransition = true;
        } else if (wasInTransition) {
          drawName(latestViewState);
          wasInTransition = false;
        }
      },
      onViewStateChange: (vs) => {
        // @ts-ignore
        latestViewState = vs.viewState;
        updateCursor();
      },
      layers: [backgroundLayer, starLayer],
    })
  });

