import Phaser from "phaser";

/**
 * A Phaser 4 filter that replaces pixels matching a target
 * colour with a new colour. Equivalent to the removed Rex
 * rexcolorreplacepipelineplugin.
 *
 * Apply via: sprite.filters.internal.add(filter)
 */
export class ColorReplaceFilter extends Phaser.Filters.Filter {
    private static readonly FRAG = `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform vec3 targetColor;
        uniform vec3 newColor;
        uniform float epsilon;
        varying vec2 outTexCoord;

        void main () {
            vec4 pixel = texture2D(uMainSampler, outTexCoord);
            vec3 diff = abs(pixel.rgb - targetColor);
            if (diff.r <= epsilon &&
                diff.g <= epsilon &&
                diff.b <= epsilon) {
                gl_FragColor = vec4(newColor * pixel.a, pixel.a);
            } else {
                gl_FragColor = pixel;
            }
        }
    `;

    constructor(
        targetColor: [number, number, number] = [0, 0, 0],
        epsilon: number = 0.0,
    ) {
        super(ColorReplaceFilter.FRAG, {
            targetColor: { value: targetColor },
            newColor: { value: [0.0, 0.0, 0.0] },
            epsilon: { value: epsilon },
        });
    }

    /**
     * Set the replacement colour as an RGB triplet in [0..1] range.
     * Call this each tween update to animate the colour transition.
     */
    setNewColor(r: number, g: number, b: number): void {
        this.setUniform("newColor", [r, g, b]);
    }
}
