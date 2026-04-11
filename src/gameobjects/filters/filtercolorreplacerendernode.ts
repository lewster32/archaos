/* v8 ignore start */
import Phaser from "phaser";

const { RenderNodes } = Phaser.Renderer.WebGL;

/**
 * Fragment shader source for the color-replace filter.
 * Replaces pixels whose RGB is within `epsilon` of `targetColor`
 * with `newColor`, preserving the original alpha.
 */
const FRAG = [
    "precision mediump float;",
    "uniform sampler2D uMainSampler;",
    "uniform vec3 uTargetColor;",
    "uniform vec3 uNewColor;",
    "uniform float uEpsilon;",
    "varying vec2 outTexCoord;",
    "void main () {",
    "    vec4 pixel = texture2D(uMainSampler, outTexCoord);",
    "    if (pixel.a == 0.0) { gl_FragColor = pixel; return; }",
    "    vec3 unpremul = pixel.rgb / pixel.a;",
    "    vec3 diff = abs(unpremul - uTargetColor);",
    "    if (diff.r <= uEpsilon &&",
    "        diff.g <= uEpsilon &&",
    "        diff.b <= uEpsilon) {",
    "        gl_FragColor = vec4(uNewColor * pixel.a, pixel.a);",
    "    } else {",
    "        gl_FragColor = pixel;",
    "    }",
    "}",
].join("\n");

/**
 * Render node for the ColorReplace filter.
 * Registered with the game renderer under the key
 * `FilterColorReplace`.
 *
 * This class uses Phaser's prototype-based class system so that
 * it can extend `BaseFilterShader` at runtime.
 */
export class FilterColorReplaceRenderNode
    extends RenderNodes.BaseFilterShader {

    /**
     * The render node key used when registering with the game.
     */
    static readonly KEY = "FilterColorReplace";

    constructor(
        manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager,
    ) {
        super(FilterColorReplaceRenderNode.KEY, manager, undefined, FRAG);
    }

    setupUniforms(
        controller: Phaser.Filters.Controller,
        _drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    ): void {
        const pm = this.programManager;
        const c = controller as import("./colorreplace").ColorReplaceFilter;
        pm.setUniform("uTargetColor", c.targetColor);
        pm.setUniform("uNewColor", c.newColor);
        pm.setUniform("uEpsilon", c.epsilon);
    }
}
/* v8 ignore end */