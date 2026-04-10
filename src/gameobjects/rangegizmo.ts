import {
    BoardLayer,
    CursorType,
    UnitStatus,
    Node,
    Path,
    distance as gridDistance,
    RangeGizmo as EngineRangeGizmo,
} from "@archaos/engine";
import { Board } from "./board";
import { Cursor } from "./cursor";
import { Piece } from "./piece";

import { Math as PMath, GameObjects } from "phaser";

export class RangeGizmo extends EngineRangeGizmo {
    /**
     * Duration of gizmo reveal animation in milliseconds
     */
    private static readonly GIZMO_REVEAL_DURATION: number = 50;

    /**
     * Stagger delay between gizmo reveal animations in
     * milliseconds
     */
    private static readonly GIZMO_REVEAL_STAGGER_DELAY: number = 5;

    /**
     * Typed reference to the client board for Phaser access
     */
    private readonly _clientBoard: Board;

    /**
     * Layer for range gizmo graphics
     */
    private readonly _rangeLayer: GameObjects.Layer;

    /**
     * Layer for path gizmo graphics
     */
    private readonly _pathLayer: GameObjects.Layer;

    private lastSimplePosition: PMath.Vector2 = new PMath.Vector2(-1, -1);
    private lastDistance: number = -1;
    private lastCursor: CursorType;
    private lastLoS: boolean;

    /**
     * Create a new RangeGizmo for the given board. RangeGizmo
     * is responsible for calculating and displaying movement
     * ranges and paths for pieces. It's a single instance per
     * board, and is reused for each piece as needed.
     *
     * @param board The board to create the RangeGizmo for
     */
    constructor(board: Board) {
        super(board);
        this._clientBoard = board;
        this._rangeLayer = board.getLayer(BoardLayer.FloorCursors);
        this._pathLayer = board.getLayer(BoardLayer.PathCursors);
    }

    /**
     * Generate the range gizmo for the given unit - calculates
     * valid nodes and paths to them, then renders visuals.
     *
     * @param unit The unit to generate the range gizmo for
     * @returns A promise that resolves when generation is
     * complete
     */
    public override async generate(unit: Piece): Promise<void> {
        await super.generate(unit);
        if (this._piece?.hasStatus(UnitStatus.Flying)) {
            await this.generateVisualRange();
        } else {
            await this.generateVisualPaths();
        }
    }

    /**
     * Render a debug grid to the console showing traversable,
     * terminal, and warning nodes
     *
     * @param board the board
     * @param nodes the nodes to show
     */
    private static showDebugGrid(board: Board, nodes: Node[]): void {
        let debugGrid: string = "";
        for (let yy: number = 0; yy < board.height; yy++) {
            let row: string = "";
            for (let xx: number = 0; xx < board.width; xx++) {
                const node = nodes.find((n: Node) => n.x === xx && n.y === yy);
                if (node) {
                    if (node.terminal) {
                        row += "X ";
                    } else if (node.warning) {
                        row += "! ";
                    } else {
                        row += ". ";
                    }
                } else {
                    row += "# ";
                }
            }
            debugGrid += row + "\n";
        }
        console.log(`Debug grid:\n${debugGrid}`);
    }

    /**
     * Reset the range gizmo, clearing all visual elements.
     * Optionally forces an immediate reset without animation.
     *
     * @param force If true, removes layers immediately without
     * tween animation
     * @returns A promise resolving to this RangeGizmo once
     * cleared
     */
    public override async reset(force?: boolean): Promise<RangeGizmo> {
        if (this._rangeLayer.length === 0 && this._pathLayer.length === 0) {
            await super.reset();
            return this;
        }
        if (force) {
            this._rangeLayer.removeAll();
            this._pathLayer.removeAll();
            await super.reset();
            return this;
        }
        return new Promise((resolve: Function) => {
            this._clientBoard.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                alpha: 0,
                delay: this._clientBoard.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "last",
                    },
                ),
                onComplete: async () => {
                    this._rangeLayer.removeAll();
                    this._pathLayer.removeAll();
                    await super.reset();
                    setTimeout(() => {
                        resolve(this);
                    }, 50);
                },
            });
        });
    }

    /**
     * Generate visual path indicators for all valid and
     * terminal nodes. Creates cursor images at each node's
     * isometric position and animates them in with a staggered
     * reveal.
     */
    private async generateVisualPaths(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            this._validNodes
                .filter(Boolean)
                .filter((node: Node) => node.traversable || node.terminal)
                .forEach((node: Node) => {
                    const path: Path = this.getPathTo(node.pos);
                    if (!path?.nodes?.length) {
                        return;
                    }
                    if (path?.cost > this._piece.stats.movement + 1) {
                        node.traversable = false;
                    } else {
                        node.path = path;
                        const isoPosition: PMath.Vector2 =
                            this._clientBoard.getIsoPosition(node.pos);
                        let cursorImage: GameObjects.Image;

                        if (node.warning) {
                            cursorImage = this._clientBoard.scene.add.image(
                                isoPosition.x,
                                isoPosition.y,
                                "cursors",
                                CursorType.RangeMoveWarning,
                            );
                        } else {
                            cursorImage = this._clientBoard.scene.add.image(
                                isoPosition.x,
                                isoPosition.y,
                                "cursors",
                                CursorType.RangeMove,
                            );
                        }
                        cursorImage.setOrigin(0.5, 0.5);
                        cursorImage.setAlpha(0);
                        this._rangeLayer.add(cursorImage);
                    }
                });

            this._clientBoard.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._clientBoard.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    },
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    /**
     * Generate a simple circular range overlay centred on a
     * position. Skips regeneration if the parameters match
     * the last call (unless forced).
     *
     * @param position Centre point of the range
     * @param distance Maximum distance from the centre
     * @param cursor Cursor sprite frame to use for each tile
     * @param lineOfSight If true, only shows tiles with line
     * of sight from position
     * @param force If true, bypasses the duplicate-call check
     * and skips reveal animation
     */
    public async generateSimpleRange(
        position: PMath.Vector2,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
        force?: boolean,
    ): Promise<void> {
        if (
            !force &&
            position.equals(this.lastSimplePosition) &&
            distance === this.lastDistance &&
            cursor === this.lastCursor &&
            lineOfSight === this.lastLoS
        ) {
            return;
        }
        await this.reset(force);

        this.lastSimplePosition = position.clone();
        this.lastDistance = distance;
        this.lastCursor = cursor;
        this.lastLoS = lineOfSight;

        const startPosition = position.clone();
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            for (let yy: number = 0; yy < this._clientBoard.height; yy++) {
                for (let xx: number = 0; xx < this._clientBoard.width; xx++) {
                    const currentDistance: number = gridDistance(
                        startPosition,
                        new PMath.Vector2(xx, yy),
                    );
                    if (currentDistance > distance) {
                        continue;
                    }
                    if (
                        lineOfSight &&
                        !this._clientBoard.hasLineOfSight(
                            startPosition,
                            new PMath.Vector2(xx, yy),
                        )
                    ) {
                        continue;
                    }
                    const isoPosition: PMath.Vector2 =
                        this._clientBoard.getIsoPosition(
                            new PMath.Vector2(xx, yy),
                        );
                    const cursorImage: GameObjects.Image =
                        this._clientBoard.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            cursor,
                        );
                    cursorImage.setOrigin(0.5, 0.5);
                    if (!force) {
                        cursorImage.setAlpha(0);
                    }
                    cursorImage.setDepth(currentDistance);
                    this._rangeLayer.add(cursorImage);
                }
            }

            this._rangeLayer.sort("depth");

            if (force) {
                resolve();
                return;
            }
            this._clientBoard.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._clientBoard.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    },
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    /**
     * Show a simple range overlay with a reveal animation.
     * Delegates to {@link generateSimpleRange} with
     * `force: true`, then animates children from alpha 0 to 1.
     *
     * @param position Centre point of the range
     * @param distance Maximum distance from the centre
     * @param cursor Cursor sprite frame to use for each tile
     * @param lineOfSight If true, only shows tiles with line
     * of sight from position
     */
    public async showSimpleRange(
        position: PMath.Vector2,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
    ): Promise<void> {
        await this.generateSimpleRange(
            position,
            distance,
            cursor,
            lineOfSight,
            true,
        );

        this._rangeLayer.getChildren().forEach((child: GameObjects.Image) => {
            child.setAlpha(0);
        });

        this._clientBoard.scene.tweens.add({
            targets: this._rangeLayer.getChildren(),
            alpha: 1,
            duration: RangeGizmo.GIZMO_REVEAL_DURATION,
            delay: this._clientBoard.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                {
                    from: "first",
                },
            ),
        });
    }

    /**
     * Hide the currently displayed simple range overlay with
     * a fade-out animation (last-to-first stagger). No-ops if
     * no range is visible.
     */
    public async hideSimpleRange(): Promise<void> {
        if (this._rangeLayer.length === 0) {
            return;
        }

        this._clientBoard.scene.tweens.add({
            targets: this._rangeLayer.getChildren(),
            duration: RangeGizmo.GIZMO_REVEAL_DURATION,
            alpha: 0,
            delay: this._clientBoard.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                {
                    from: "last",
                },
            ),
        });
    }

    /**
     * Generate visual range indicators for flying units.
     * Unlike {@link generateVisualPaths}, flying units can
     * reach any valid node directly so no pathfinding is
     * needed — only validity is checked.
     */
    private async generateVisualRange(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            this._validNodes
                .filter((node: Node) => node?.isValid())
                .forEach((node: Node) => {
                    const isoPosition: PMath.Vector2 =
                        this._clientBoard.getIsoPosition(node.pos);
                    let cursorImage: GameObjects.Image;

                    if (node.warning) {
                        cursorImage = this._clientBoard.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            CursorType.RangeMoveWarning,
                        );
                    } else {
                        cursorImage = this._clientBoard.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            CursorType.RangeMove,
                        );
                    }
                    cursorImage.setOrigin(0.5, 0.5);
                    cursorImage.setAlpha(0);
                    this._rangeLayer.add(cursorImage);
                });

            this._clientBoard.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._clientBoard.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    },
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    /**
     * Display directional arrow cursors along the path from
     * the current piece to the given destination. Clears any
     * previously shown path first.
     *
     * @param toPt The destination board position
     */
    public showPath(toPt: PMath.Vector2): void {
        this._pathLayer.removeAll();
        if (
            !this._piece ||
            this._piece.hasStatus(UnitStatus.Flying) ||
            toPt.equals(this._piece.position as unknown as PMath.Vector2)
        ) {
            return;
        }
        const path: Path = this.getPathTo(toPt);

        if (!path?.nodes?.length) {
            return;
        }

        // If the original destination was terminal, the path
        // ends one node before it, so we need to show the path
        // including the last node
        const destinationNode = this.getNode(toPt);
        const endIndex = destinationNode?.terminal
            ? path.nodes.length
            : path.nodes.length - 1;

        for (let n: number = 1; n < endIndex; n++) {
            const isoPosition: PMath.Vector2 = this._clientBoard.getIsoPosition(
                path.nodes[n].pos,
            );

            const cursorImage: GameObjects.Image =
                this._clientBoard.scene.add.image(
                    isoPosition.x,
                    isoPosition.y,
                    "cursors",
                    Cursor.getCursorAngle(path.angles[n]),
                );
            cursorImage.setOrigin(0.5, 0.5);
            this._pathLayer.add(cursorImage);
        }
    }
}
