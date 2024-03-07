import type { DefaultProps } from "@deck.gl/core/typed";
import { ArcLayer, type ArcLayerProps } from "@deck.gl/layers/typed";
import GL from '@luma.gl/constants';

type ExtendedArcLayerProps<DataT> = ArcLayerProps<DataT> & {
    /**
     * Serves as a multiplier for the arc length.
     * @default 1
     */
    coef?: number;
};

const defaultProps: DefaultProps<ExtendedArcLayerProps<unknown>> = {
    ...ArcLayer.defaultProps,
    coef: { type: "number", value: 1 },
};
    
/*
 * taken from https://github.com/visgl/deck.gl/discussions/2531
 * and https://github.com/visgl/deck.gl/blob/8.9-release/examples/website/mask-extension/animated-arc-layer.js
 */
export class AnimatedArcLayer<DataT> extends ArcLayer<DataT, ExtendedArcLayerProps<DataT>> {
  initializeState() {
    super.initializeState();
    this.getAttributeManager()?.addInstanced({
      instanceLineIndex: {
        size: 1,
        update: (attribute) => {
          const { data } = this.props;
          const { value } = attribute;
          if (value !== null && Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
              value[i] = i;
            }
          }
        }
      }
    })
  }

    getShaders() {
        const shaders = super.getShaders(); // get the original shaders
        shaders.inject = {
            "vs:#decl": `
            attribute float instanceLineIndex;
            uniform float coef;
            varying float adjustedCoef;
            `,
            "fs:#decl": `
            varying float adjustedCoef;
            `,
            "vs:#main-end": `
            adjustedCoef = clamp(coef - instanceLineIndex, 0.0, 1.0);
            if (adjustedCoef == 0.0 || geometry.uv.x > adjustedCoef) {
                isValid = 0.0;
            }
            `,
            "fs:DECKGL_FILTER_COLOR": `
            float lowerBound = 0.0;
            if (adjustedCoef > 0.05) {
                lowerBound = adjustedCoef - 0.05;
            }
            if (adjustedCoef != 1.0 ) {
                color.a = 1.0 - smoothstep(lowerBound, adjustedCoef, geometry.uv.x);
            }
            `,
        };
        return shaders;
    }
    
    draw({ uniforms }: Record<string, any>) {
        super.draw({
            uniforms: {
                ...uniforms,
                coef: this.props.coef,
            },
        });
    }
}

AnimatedArcLayer.layerName = "AnimatedArcLayer";
// @ts-ignore
AnimatedArcLayer.defaultProps = defaultProps;
