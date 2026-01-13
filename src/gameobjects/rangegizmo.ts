import { Board, RangeType } from "./board";
import { Cursor } from "./cursor";
import { BoardLayer } from "./enums/boardlayer";
import { CursorType } from "./enums/cursortype";
import { UnitStatus } from "./enums/unitstatus";
import { Piece } from "./piece";

export class RangeGizmo {
    private static readonly GIZMO_REVEAL_DURATION: number = 50;
    private static readonly GIZMO_REVEAL_STAGGER_DELAY: number = 5;

    private readonly _board: Board;
    private readonly _rangeLayer: Phaser.GameObjects.Layer;
    private readonly _pathLayer: Phaser.GameObjects.Layer;
    private _piece: Piece = null;
    private _validNodes: Node[] = [];
    private _paths: Map<string, Path>;

    constructor(board: Board) {
        this._board = board;
        this._rangeLayer = board.getLayer(BoardLayer.FloorCursors);
        this._pathLayer = board.getLayer(BoardLayer.PathCursors);
    }

    /**
     * First pass - determine if node is traversable or terminal
     * 
     * @param node The node to check
     * @returns The updated node
     */
    protected checkNodeTraversal(node: Node): Node {
        // If the node is empty, it's traversable
        const livePiecesAtPosition: Piece[] = this._board.getPiecesAtPosition(
            new Phaser.Geom.Point(node.x, node.y),
            (piece: Piece) => !piece.dead
        );
        if (livePiecesAtPosition.length) {
            // If one of the pieces here is the piece itself, it's traversable
            if (livePiecesAtPosition.includes(this._piece)) {
                node.traversable = true;
                node.terminal = false;
                return node;
            }

            // There's at least one piece here, check if we can mount or attack
            // any of them - if so, mark as terminal, otherwise not traversable
            for (const livePiece of livePiecesAtPosition) {
                if (this._piece.canMountPiece(livePiece) || this._piece.canAttackPiece(livePiece)) {
                    // If any of the live pieces can be mounted or attacked, mark as
                    // terminal
                    node.terminal = true;
                }
                else {
                    // Otherwise, not traversable
                    node.traversable = false;
                }
            }
        }
        else {
            // No pieces here, so it's traversable
            node.traversable = true;
            node.terminal = false;
        }

        return node;
    }

    /**
     * Generate the range gizmo for the given unit - calculates valid nodes
     * and paths to them
     * 
     * @param unit The unit to generate the range gizmo for
     * @returns A promise that resolves when generation is complete
     */
    public async generate(unit: Piece): Promise<void> {
        await this.reset();

        // Reset state
        this._validNodes = [];
        this._paths = new Map<string, Path>();
        this._piece = unit;

        // Our set of potentially valid nodes - this is all of the nodes that
        // could be reached within movement range, before considering obstacles
        const potentiallyValidNodes: Map<string, Node> = new Map();

        // Get all points in range
        this._board.getPointsInRange(
            unit.position,
            unit.stats.movement,
            true,
            unit.hasStatus(UnitStatus.Flying) ? RangeType.Fly : RangeType.Foot
        )
        // Create nodes from those points
        .map((pt: Phaser.Geom.Point) => new Node(pt.x, pt.y))
        // Filter out non-traversable nodes
        .filter((node: Node) => {
            node = this.checkNodeTraversal(node);
            if (!node.traversable) {
                return false;
            }
            return true;
        })
        // Add to potentially valid nodes
        .forEach((node: Node) => {
            potentiallyValidNodes.set(node.x + "," + node.y, node);
        });

        // Now for each potentially valid node, check the warning status of the
        // node - that is, whether there are any engageable enemy pieces
        // adjacent to it
        potentiallyValidNodes.forEach((node: Node) => {
            const potentialEnemies: Set<Piece> = new Set(
                this._board.getPiecesAtPosition(
                    node.pos,
                    (piece: Piece) => {
                        return piece.canEngagePiece(this._piece);
                    }
                )
            );
            if (!potentialEnemies.size) {
                return;
            }
            // Mark adjacent nodes as warning
            this._board.getAdjacentPoints(
                node.pos,
                false
            ).forEach((adjPt: Phaser.Geom.Point) => {
                const adjNodeKey = adjPt.x + "," + adjPt.y;
                if (potentiallyValidNodes.has(adjNodeKey)) {
                    potentiallyValidNodes.get(adjNodeKey).warning = true
                }
            });
        });

        // Set valid nodes to potentially valid nodes for now
        this._validNodes = Array.from(
            potentiallyValidNodes.values()
        );

        // If we're flying we can just take all potentially valid nodes
        if (this._piece.hasStatus(UnitStatus.Flying)) {
            await this.generateVisualRange();
            return;
        } else {
            // Otherwise, we need to do pathfinding to determine actual valid nodes
            for (const node of this._validNodes) {
                const path: Path = this.getPathTo(node.pos);
                node.path = path;
                if (!path || path.cost > this._piece.stats.movement + 1) {
                    node.traversable = false;
                }
            }
        }
        await this.generateVisualPaths();
    }

    /**
     * Render a debug grid to the console showing traversable, terminal, and
     * warning nodes
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

    public async reset(force?: boolean): Promise<RangeGizmo> {
        if (this._rangeLayer.length === 0 && this._pathLayer.length === 0) {
            return this;
        }
        return new Promise((resolve: Function) => {
            this._piece = null;
            if (force) {
                this._rangeLayer.removeAll()
                this._pathLayer.removeAll();
                resolve(this);
                return;
            }

            this._board.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                duration: force ? 0 : RangeGizmo.GIZMO_REVEAL_DURATION,
                alpha: 0,
                delay: this._board.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "last",
                    }
                ),
                onComplete: () => {
                    this._rangeLayer.removeAll();
                    this._pathLayer.removeAll();
                    setTimeout(() => {
                        resolve(this);
                    }, 50);
                },
            });
            
        });
    }

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
                        const isoPosition: Phaser.Geom.Point =
                            this._board.getIsoPosition(node.pos);
                        let cursorImage: Phaser.GameObjects.Image;

                        if (node.warning) {
                            cursorImage = this._board.scene.add.image(
                                isoPosition.x,
                                isoPosition.y,
                                "cursors",
                                CursorType.RangeMoveWarning
                            );
                        } else {
                            cursorImage = this._board.scene.add.image(
                                isoPosition.x,
                                isoPosition.y,
                                "cursors",
                                CursorType.RangeMove
                            );
                        }
                        cursorImage.setOrigin(0.5, 0.5);
                        cursorImage.setAlpha(0);
                        this._rangeLayer.add(cursorImage);
                    }
                });

            this._board.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._board.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    }
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    private lastSimplePosition: Phaser.Geom.Point = new Phaser.Geom.Point(
        -1,
        -1
    );
    private lastDistance: number = -1;
    private lastCursor: CursorType;
    private lastLoS: boolean;

    public async generateSimpleRange(
        position: Phaser.Geom.Point,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
        force?: boolean
    ): Promise<void> {
        if (
            !force &&
            Phaser.Geom.Point.Equals(position, this.lastSimplePosition) &&
            distance === this.lastDistance &&
            cursor === this.lastCursor &&
            lineOfSight === this.lastLoS
        ) {
            return;
        }
        await this.reset(force);

        this.lastSimplePosition = Phaser.Geom.Point.Clone(position);
        this.lastDistance = distance;
        this.lastCursor = cursor;
        this.lastLoS = lineOfSight;

        const startPosition = Phaser.Geom.Point.Clone(position);
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            for (let yy: number = 0; yy < this._board.height; yy++) {
                for (let xx: number = 0; xx < this._board.width; xx++) {
                    const currentDistance: number = Board.distance(
                        startPosition,
                        new Phaser.Geom.Point(xx, yy)
                    );
                    if (currentDistance > distance) {
                        continue;
                    }
                    if (
                        lineOfSight &&
                        !this._board.hasLineOfSight(
                            startPosition,
                            new Phaser.Geom.Point(xx, yy)
                        )
                    ) {
                        continue;
                    }
                    const isoPosition: Phaser.Geom.Point =
                        this._board.getIsoPosition(
                            new Phaser.Geom.Point(xx, yy)
                        );
                    const cursorImage: Phaser.GameObjects.Image =
                        this._board.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            cursor
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
            this._board.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._board.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    }
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    public async showSimpleRange(
        position: Phaser.Geom.Point,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
    ): Promise<void> {
        await this.generateSimpleRange(
            position,
            distance,
            cursor,
            lineOfSight,
            true
        );
        
        this._rangeLayer.getChildren().forEach((child: Phaser.GameObjects.Image) => {
            child.setAlpha(0);
        });

        this._board.scene.tweens.add({
            targets: this._rangeLayer.getChildren(),
            alpha: 1,
            duration: RangeGizmo.GIZMO_REVEAL_DURATION,
            delay: this._board.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                {
                    from: "first",
                }
            )
        });
    }

    public async hideSimpleRange(): Promise<void> {
        // If no range to hide, return
        if (this._rangeLayer.length === 0) {
            return;
        }
        
        this._board.scene.tweens.add({
            targets: this._rangeLayer.getChildren(),
            duration: RangeGizmo.GIZMO_REVEAL_DURATION,
            alpha: 0,
            delay: this._board.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                {
                    from: "last",
                }
            ),
        });
    }

    private async generateVisualRange(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            this._validNodes
                .filter((node: Node) => node?.isValid())
                .forEach((node: Node) => {
                    const isoPosition: Phaser.Geom.Point =
                        this._board.getIsoPosition(node.pos);
                    let cursorImage: Phaser.GameObjects.Image;

                    if (node.warning) {
                        cursorImage = this._board.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            CursorType.RangeMoveWarning
                        );
                    } else {
                        cursorImage = this._board.scene.add.image(
                            isoPosition.x,
                            isoPosition.y,
                            "cursors",
                            CursorType.RangeMove
                        );
                    }
                    cursorImage.setOrigin(0.5, 0.5);
                    cursorImage.setAlpha(0);
                    this._rangeLayer.add(cursorImage);
                });

            this._board.scene.tweens.add({
                targets: this._rangeLayer.getChildren(),
                alpha: 1,
                duration: RangeGizmo.GIZMO_REVEAL_DURATION,
                delay: this._board.scene.tweens.stagger(
                    RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                    {
                        from: "first",
                    }
                ),
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    private static getAngle(
        fromPt: Phaser.Geom.Point,
        toPt: Phaser.Geom.Point
    ): number {
        let a: number = Math.floor(
            Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x) * (180 / Math.PI)
        );
        a += 22.5;
        a = a < 0 ? a + 360 : a;
        return Math.floor(a / 45);
    }

    public getNode(pt: Phaser.Geom.Point): Node | null {
        return (
            this._validNodes.find(
                (node: Node) =>
                    Phaser.Geom.Point.Equals(node.pos, pt) && (node.traversable || node.terminal)
            ) || null
        );
    }

    public getPathTo(pt: Phaser.Geom.Point): Path {
        let path: Path, node: Node;
        node = this.getNode(pt);
        if (!this._piece) {
            return null;
        }
        if (!node || (!node.traversable && !node.terminal)) {
            return null;
        }
        if (this._paths.has(pt.x + "," + pt.y)) {
            path = this._paths.get(pt.x + "," + pt.y);
        } else {
            path = this.findPath(this._piece.position, pt);
            this._paths.set(pt.x + "," + pt.y, path);
        }
        return path || null;
    }

    public getAllValidPaths(): Map<string, Path> {
        const output: Map<string, Path> = new Map();
        for (const node of this._validNodes) {
            if (node.isValid()) {
                const path: Path = this.getPathTo(node.pos);
                if (path) {
                    output.set(node.x + "," + node.y, path);
                }
            }
        }
        return output;
    }

    public showPath(toPt: Phaser.Geom.Point): void {
        this._pathLayer.removeAll();
        if (
            !this._piece ||
            this._piece.hasStatus(UnitStatus.Flying) ||
            Phaser.Geom.Point.Equals(toPt, this._piece.position)
        ) {
            return;
        }
        const path: Path = this.getPathTo(toPt);

        if (!path?.nodes?.length) {
            return;
        }

        // If the original destination was terminal, the path ends one node
        // before it, so we need to show the path including the last node
        const destinationNode = this.getNode(toPt);
        const endIndex = destinationNode?.terminal ? path.nodes.length : path.nodes.length - 1;

        for (let n: number = 1; n < endIndex; n++) {
            const isoPosition: Phaser.Geom.Point = this._board.getIsoPosition(
                path.nodes[n].pos
            );

            const cursorImage: Phaser.GameObjects.Image =
                this._board.scene.add.image(
                    isoPosition.x,
                    isoPosition.y,
                    "cursors",
                    Cursor.getCursorAngle(path.angles[n])
                );
            cursorImage.setOrigin(0.5, 0.5);
            this._pathLayer.add(cursorImage);
        }
    }

    public findPath(fromPt: Phaser.Geom.Point, toPt: Phaser.Geom.Point): Path {
        let firstNode: Node, destinationNode: Node;
        for (const node of this._validNodes) {
            if (Phaser.Geom.Point.Equals(node.pos, fromPt)) {
                firstNode = node;
            }
            if (Phaser.Geom.Point.Equals(node.pos, toPt)) {
                destinationNode = node;
            }
        }

        if (firstNode === null || destinationNode === null) {
            return null;
        }

        const openNodes: Node[] = [];
        const closedNodes: Node[] = [];

        let currentNode: Node = firstNode;
        let testNode: Node;

        let l: number;
        let i: number;

        let connectedNodes: Node[];
        let travelCost: number = 1;

        let g: number;
        let h: number;
        let f: number;

        if (!currentNode) {
            return null;
        }

        currentNode.g = 0;
        currentNode.h = RangeGizmo.diagonalHeuristic(
            currentNode,
            destinationNode,
            travelCost
        );
        currentNode.f = currentNode.g + currentNode.h;

        while (currentNode != destinationNode) {
            connectedNodes = this.findConnectedNodes(currentNode);

            l = connectedNodes.length;

            for (i = 0; i < l; ++i) {
                testNode = connectedNodes[i];    
                // Can't traverse to self or non-traversable nodes except
                // terminal
                if (testNode === currentNode || (!testNode.traversable && !testNode.terminal)) {
                    continue;
                }
                g =
                    currentNode.g +
                    RangeGizmo.diagonalHeuristic(
                        currentNode,
                        testNode,
                        travelCost
                    );
                h = RangeGizmo.diagonalHeuristic(
                    testNode,
                    destinationNode,
                    travelCost
                );
                f = g + h;

                if (
                    RangeGizmo.isOpen(testNode, openNodes) ||
                    RangeGizmo.isClosed(testNode, closedNodes)
                ) {
                    if (testNode.f > f) {
                        testNode.f = f;
                        testNode.g = g;
                        testNode.h = h;
                        testNode.parentNode = currentNode;
                    }
                } else {
                    testNode.f = f;
                    testNode.g = g;
                    testNode.h = h;
                    testNode.parentNode = currentNode;
                    openNodes.push(testNode);
                }
            }
            closedNodes.push(currentNode);

            if (openNodes.length == 0) {
                return null;
            }
            openNodes.sort(function (n1: Node, n2: Node): number {
                return n1.f < n2.f ? -1 : 1;
            });
            currentNode = openNodes.shift();
        }

        return RangeGizmo.buildPath(destinationNode, firstNode);
    }

    public findConnectedNodes(node: Node): Node[] {
        const output: Node[] = [];

        for (const validNode of this._validNodes) {
            if (
                node.x < validNode.x - 1 ||
                node.x > validNode.x + 1
            ) {
                continue;
            }
            if (
                node.y < validNode.y - 1 ||
                node.y > validNode.y + 1
            ) {
                continue;
            }
            if (node === validNode) {
                continue;
            }
            output.push(validNode);
        }

        return output;
    }

    public static diagonalHeuristic(
        node: Node,
        destinationNode: Node,
        cost: number = 1,
        diagonalCost: number = 1.5,
        terminalCost: number = 100,
    ): number {
        const dx: number = Math.abs(node.x - destinationNode.x);
        const dy: number = Math.abs(node.y - destinationNode.y);

        const diag: number = Math.min(dx, dy);
        const straight: number = dx + dy;

        // If this node is a terminal or warning node, landing on it will end
        // movement, so try to avoid it if possible
        if (node.warning || node.terminal) {
            return (
                diagonalCost * diag + cost * (straight - 2 * diag) + terminalCost
            );
        }

        return diagonalCost * diag + cost * (straight - 2 * diag);
    }

    public static buildPath(destinationNode: Node, startNode: Node): Path {
        const angles: number[] = [];
        const path: Node[] = [];
        let node: Node = destinationNode;
        let cost: number = 0;
        path.push(node);
        while (node != startNode) {
            cost += Board.distance(node.pos, node.parentNode.pos);
            angles.unshift(this.getAngle(node.parentNode.pos, node.pos));
            node = node.parentNode;
            path.unshift(node);
        }
        angles.unshift(this.getAngle(startNode.pos, destinationNode.pos));

        // If we find a non-traversable or terminal node in the path, we need
        // to mark nodes in the path after that as non-traversable
        let foundBlockingNode: boolean = false;
        for (const pathNode of path) {
            if (foundBlockingNode) {
                pathNode.traversable = false;
            } else if (!pathNode.traversable || pathNode.terminal) {
                foundBlockingNode = true;
            }
        }

        return new Path(path, angles, cost);
    }

    public static isOpen(node: Node, openNodes: Node[]): boolean {
        const l: number = openNodes.length;
        for (let i: number = 0; i < l; ++i) {
            if (openNodes[i] == node) return true;
        }

        return false;
    }

    public static isClosed(node: Node, closedNodes: Node[]): boolean {
        const l: number = closedNodes.length;
        for (let i: number = 0; i < l; ++i) {
            if (closedNodes[i] == node) return true;
        }

        return false;
    }
}

export class Node {
    private readonly _pos: Phaser.Geom.Point = new Phaser.Geom.Point(-1, -1);
    public g: number;
    public f: number;
    public h: number;
    public parentNode: Node;

    /**
     * Whether this node can be traversed (i.e. passed through)
     */
    public traversable: boolean = true;

    /**
     * Whether this node is a warning node (e.g., adjacent to an enemy)
     */
    public warning: boolean = false;

    /**
     * Whether this node is a terminal node (e.g., occupied by an attackable
     * enemy or mountable ally)
     */
    public terminal: boolean = false;

    /**
     * The path to this node
     */
    public path: Path;

    /**
     * Whether this node is being traversed by flying movement
     */
    public flying: boolean = false;

    constructor(x: number, y: number) {
        this._pos.setTo(x, y);
    }

    get x(): number {
        return this._pos.x;
    }

    get y(): number {
        return this._pos.y;
    }

    get pos(): Phaser.Geom.Point {
        return this._pos;
    }

    isValid(): boolean {
        if ((this.path !== null || this.flying) && this.traversable) {
            return true;
        }
        return false;
    }
}

export class Path {
    private readonly _nodes: Node[];
    private readonly _angles: number[];
    private readonly _cost: number;

    constructor(nodes: Node[], angles: number[], cost: number) {
        if (nodes?.length && cost > 0) {
            this._nodes = nodes;
            this._angles = angles;
            this._cost = cost;
        }
    }

    public toPoints(): Phaser.Geom.Point[] {
        return this._nodes.map((node: Node) =>
            Phaser.Geom.Point.Clone(node.pos)
        );
    }

    get cost(): number {
        return this._cost;
    }

    get nodes(): Node[] {
        return this._nodes;
    }

    get angles(): number[] {
        return this._angles;
    }

    get warning(): boolean {
        return this._nodes.at(-1).warning;
    }

    get terminal(): boolean {
        return this._nodes.some((n: Node) => n.terminal);
    }
}
