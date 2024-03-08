import { Deck, Layer, _GlobeViewport as GlobeViewport } from '@deck.gl/core/typed';
import { ScatterplotLayer, SolidPolygonLayer, PolygonLayer, PathLayer } from '@deck.gl/layers/typed';
import { PathStyleExtension } from '@deck.gl/extensions/typed';
import { AnimatedPathLayer } from './layers/animatedPathLayer.ts';
import {_GlobeView as GlobeView} from '@deck.gl/core/typed';
import './style.css';
import GL from '@luma.gl/constants';
import { kdTree } from 'kd-tree-javascript';
import throttle from 'lodash.throttle';
import turfCircle from '@turf/circle';
import { normalizePath, getLines, toCoords, toScreen } from './getLines.ts'; 
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
  getFillColor: [5, 15, 40, 255]
});


const view = new GlobeView({id: 'globe', resolution: 1 });


const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: { inertia: 1000 },
  getCursor: () => 'none',
  parameters: {
    clearColor: [0, 0, 0, 255],
    cull: true
  },
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
      parameters: { depthTest: false },
      stroked: false,
      getFillColor: [255, 255, 255, 255],
      radiusUnits: 'meters',
      antialiasing: true,
      opacity: 1,
      radiusMinPixels: 0.5,
      getRadius: d => (8 - d.Vmag) * 8e3,
      getPosition: d => toScreen(d.coords),
    });

    let actualConstellationLayers: Layer[] = [];
    let constellationLayers: Layer[] = [];
    let cursorLayers: Layer[] = [];

    const redraw = () => {
        deck.setProps({
          layers: [
            backgroundLayer,
            ...actualConstellationLayers,
            ...constellationLayers,
            starLayer,
            ...cursorLayers
          ]
        });
    };

    let intervalId: number | null = null;
    const drawName = throttle((vs: { zoom: number, latitude: number, longitude: number }) => {
      const vpObj = { RAICRS: vs.longitude < 0 ? 360 + vs.longitude : vs.longitude, DEICRS: -vs.latitude } ;
      if (intervalId) {
        clearInterval(intervalId);
      }

      let { paths: lines, stars } = getLines(getNearest, vpObj, vs.zoom)
      let totalPoints = lines.reduce((prev, curr) => prev + curr.path.length, 0);
      const usedStars = stars.map(s => data.find(hip => hip.HIP === s)).filter(s => !!s);

      let progress = 0;
      intervalId = +setInterval(() => {
        progress += 4;
        if (intervalId && (progress >= totalPoints * 3 * 4)) {
          clearInterval(intervalId);
          return;
        }
        constellationLayers = [
          // @ts-ignore
          new AnimatedPathLayer({
              id: 'selected-star-line',
              data: lines, 
              getWidth: 3,
              jointRounded: true,
              capRounded: true,
              widthUnits: 'pixels',
              getColor: [255, 255, 255, 255],
              coef: progress
            }) as Layer,
          new ScatterplotLayer({
            id: 'selected-star-dots',
            data: usedStars, 
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            getFillColor: [0, 0, 0, 255],
            radiusUnits: 'meters',
            radiusMinPixels: 0.5,
            getRadius: d => (12 - d.Vmag) * 8e3,
            getPosition: d => toScreen(d.coords),
          })
        ];
        redraw();
       }, 10)
    }, 50);

    let latestViewState = INITIAL_VIEW_STATE;
    let lastCursorPosition: Coord = [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude];
    let lastCursorScreenPosition: Coord = [0, 0];
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

    const updateCursorFromScreenPosition = () => {
      const viewport = new GlobeViewport(latestViewState);
      lastCursorPosition = viewport.unproject(lastCursorScreenPosition) as Coord;
    };

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
    deck.getCanvas()?.addEventListener('mousemove', (ev) => {
      if (clicked) {
        lastCursorScreenPosition = [ev.pageX, ev.pageY];
      }
    });
    deck.setProps({
      onDragEnd: (info) => {
        lastCursorPosition = info.coordinate as Coord ?? lastCursorPosition;
        updateCursor();
        setTimeout( () => drawName(latestViewState), 768);
      },
      onHover: (info) => {
        if (info.coordinate) {
          lastCursorPosition = info.coordinate as Coord;
          lastCursorScreenPosition = info.pixel ?? lastCursorScreenPosition;
          updateCursor();
        }
      },
      onInteractionStateChange: (is) => {
        if (is.inTransition || is.isZooming) {
          wasInTransition = true;
        } else if (wasInTransition) {
          wasInTransition = false;
        }
      },
      onViewStateChange: (vs) => {
        if (vs.viewState?.zoom > 2 || vs.viewState?.zoom < 0.5) {
          return vs.oldViewState;
        }
        // @ts-ignore
        latestViewState = vs.viewState;
        if (!vs.interactionState.isDragging) {
          updateCursorFromScreenPosition();
          updateCursor();
        }
      },
      layers: [
        backgroundLayer,
        starLayer
      ],
    });

    fetch('constellations.json')
      .then(r => r.json())
      .then((constellations: Record<string, number[][]>) => {
        const constellationsWithStars = Object.fromEntries(
          Object.entries(constellations)
            .map(([k, starPaths]) => 
              [k, starPaths.map(stars => stars.flatMap(s => {
                const matchingStar = data.find(d => d.HIP === s);
                if (!matchingStar) {
                  return [];
                }
                return [toScreen(toCoords(matchingStar))];
              }))]
            )
        );
        const paths = Object.values(constellationsWithStars).flat().flatMap(normalizePath);

        actualConstellationLayers = [
          new PathLayer({
            id: 'constellations-actual',
            data: paths,
            getPath: d => d,
            getWidth: 1,
            widthMinPixels: 1,
            getColor: [255, 255, 255, 200],
            getDashArray: [5, 5],
            extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })]
          })
        ]
        
      })
  });

