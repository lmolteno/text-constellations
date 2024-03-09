import type { DefaultProps } from "@deck.gl/core/typed";
import { PathLayer, type PathLayerProps } from "@deck.gl/layers/typed";

type ExtendedPathLayerProps<DataT> = PathLayerProps<DataT> & {
    coef?: number;
};

const defaultProps: DefaultProps<ExtendedPathLayerProps<unknown>> = {
    ...PathLayer.defaultProps,
    coef: { type: "number", value: 1 },
};

export let numberOfInstances = 10;
    
export class AnimatedPathLayer<DataT> extends PathLayer<DataT, ExtendedPathLayerProps<DataT>> {
  initializeState() {
    super.initializeState();
    this.getAttributeManager()?.addInstanced({
      instancePathIndex: {
        size: 1,
        update: (attribute) => {
          const { pathTesselator } = this.state;
          const { data, getPath } = this.props;
          const { value } = attribute;

          // @ts-ignore
          const paths = getPath(data);
          if (value !== null) {
            numberOfInstances = attribute.numInstances;
            let vertex = 0;
            let startInstance = pathTesselator.vertexStarts[0];
            let endInstance = pathTesselator.vertexStarts[1];
            for (let i = 0; i < attribute.numInstances; i++) {
              const index = pathTesselator.vertexStarts.indexOf(i);

              if (index > 0) {
                vertex++;
                startInstance = i;
                endInstance = pathTesselator.vertexStarts[index + 1];
              }
              value[i] = vertex + ((i - startInstance) / (endInstance - startInstance));
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
            varying float widthInPixels;
            `,
            "fs:#decl": `
            varying float adjustedCoef;
            varying float widthInPixels;
            `,
            "vs:#main-end": `
            adjustedCoef = clamp(coef - instancePathIndex, 0.0, 1.0);
            widthInPixels = instanceStrokeWidths;
            `,
            "fs:#main-end": `
            if (adjustedCoef == 0.0) {
              discard;
            }
            float lowerBound = 0.0;
            if (adjustedCoef > 0.05) {
                lowerBound = adjustedCoef - 0.05;
            }
            if (adjustedCoef != 1.0) {
                gl_FragColor.a = 1.0 - smoothstep(lowerBound, adjustedCoef, geometry.uv.y);
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
