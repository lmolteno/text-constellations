import type { DefaultProps } from "@deck.gl/core/typed";
import { PathLayer, type PathLayerProps } from "@deck.gl/layers/typed";

type ExtendedPathLayerProps<DataT> = PathLayerProps<DataT> & {
    coef?: number;
};

const defaultProps: DefaultProps<ExtendedPathLayerProps<unknown>> = {
    ...PathLayer.defaultProps,
    coef: { type: "number", value: 1 },
};
    
export class AnimatedPathLayer<DataT> extends PathLayer<DataT, ExtendedPathLayerProps<DataT>> {
  initializeState() {
    super.initializeState();
    this.getAttributeManager()?.addInstanced({
      instancePathIndex: {
        size: 1,
        update: (attribute) => {
          const { value } = attribute;
          if (value !== null) {
            for (let i = 0; i < attribute.numInstances; i++) {
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
            attribute float instancePathIndex;
            uniform float coef;
            varying float adjustedCoef;
            `,
            "fs:#decl": `
            varying float adjustedCoef;
            `,
            "vs:#main-end": `
            adjustedCoef = clamp(coef - instancePathIndex, 0.0, 1.0);
            `,
            "fs:DECKGL_FILTER_COLOR": `
            if (adjustedCoef == 0.0) {
              discard;
            }
            float lowerBound = 0.0;
            if (adjustedCoef > 0.05) {
                lowerBound = adjustedCoef - 0.05;
            }
            if (adjustedCoef != 1.0 ) {
                color.a = 1.0 - smoothstep(lowerBound, adjustedCoef, geometry.uv.y);
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

AnimatedPathLayer.layerName = "AnimatedPathLayer";
// @ts-ignore
AnimatedPathLayer.defaultProps = defaultProps;
