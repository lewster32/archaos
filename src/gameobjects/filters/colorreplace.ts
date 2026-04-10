import Phaser from "phaser";
import { FilterColorReplaceRenderNode } from "./filtercolorreplacerendernode";

/**
 * A Phaser 4 filter controller that replaces pixels matching a target
 * colour with a new colour. Equivalent to the removed Rex
 * rexcolorreplacepipelineplugin.
 *
 * The associated render node (`FilterColorReplaceRenderNode`) must be
 * registered with the game before this filter is used.
 * See `src/game/game.ts` for the registration.
 *
 * Apply via:
 * ```ts
 * sprite.enableFilters();
 * sprite.filters.internal.add(
 *     new ColorReplaceFilter(sprite.filterCamera, [0,0,0], 0)
 * );
 * ```
 */
export class ColorReplaceFilter extends Phaser.Filters.Controller {
    /**
     * The RGB colour to match, as a `[r, g, b]` triplet in [0..1] range.
     */
    targetColor: [number, number, number];

    /**
     * The RGB replacement colour, as a `[r, g, b]` triplet in [0..1] range.
     * Animate this value to transition colours.
     */
    newColor: [number, number, number];

    /**
     * Per-channel tolerance for colour matching (0 = exact match).
     */
    epsilon: number;

    constructor(
        camera: Phaser.Cameras.Scene2D.Camera,
        targetColor: [number, number, number] = [0, 0, 0],
        epsilon: number = 0.0,
    ) {
        super(camera, FilterColorReplaceRenderNode.KEY);
        this.targetColor = targetColor;
        this.newColor = [0.0, 0.0, 0.0];
        this.epsilon = epsilon;
    }

    /**
     * Set the replacement colour as an RGB triplet in [0..1] range.
     * Call this each tween update to animate the colour transition.
     */
    setNewColor(r: number, g: number, b: number): void {
        this.newColor[0] = r;
        this.newColor[1] = g;
        this.newColor[2] = b;
    }
}
