import { Board } from "./board";
import { Cursor } from "./cursor";
import { BoardLayer } from "./enums/boardlayer";
import { CursorType } from "./enums/cursortype";
import { UnitStatus } from "./enums/unitstatus";
import { Piece } from "./piece";

export class RangeGizmo {
    private static GIZMO_REVEAL_DURATION: number = 50;
    private static GIZMO_REVEAL_STAGGER_DELAY: number = 5;

    private _board: Board;
    private _rangeLayer: Phaser.GameObjects.Layer;
    private _pathLayer: Phaser.GameObjects.Layer;
    private _piece: Piece = null;
    private _validNodes: Node[] = [];
    private _paths: Map<String, Path>;
    private _rect: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle();

    constructor(board: Board) {
        this._board = board;
        this._rangeLayer = board.getLayer(BoardLayer.FloorCursors);
        this._pathLayer = board.getLayer(BoardLayer.PathCursors);
    }

    public async generate(unit: Piece): Promise<void> {
        await this.reset();
        this._validNodes = [];
        this._paths = new Map();
        this._piece = unit;

        let node: Node;

        this._rect.left = Math.max(
            0,
            unit.position.x - unit.stats.movement
        );
        this._rect.right = Math.min(
            this._board.width - 1,
            unit.position.x + unit.stats.movement
        );
        this._rect.top = Math.max(
            0,
            unit.position.y - unit.stats.movement
        );
        this._rect.bottom = Math.min(
            this._board.height - 1,
            unit.position.y + unit.stats.movement
        );

        for (let xx: number = this._rect.left; xx <= this._rect.right; xx++) {
            for (
                let yy: number = this._rect.top;
                yy <= this._rect.bottom;
                yy++
            ) {
                node = new Node(xx, yy);
                if (this._piece.hasStatus(UnitStatus.Flying)) {
                    node.flying = true;
                    if (
                        Board.distance(node.pos, this._piece.position) >
                        this._piece.stats.movement + 0.5
                    ) {
                        node.traversable = false;
                    }
                }
                if (
                    this._board.getPiecesAtPosition(
                        new Phaser.Geom.Point(xx, yy),
                        (piece: Piece) => !piece.dead
                    ).length > 0
                ) {
                    node.traversable = false;
                }
                this._validNodes.push(node);
            }
        }

        let enemy: Piece,
            ePt: Phaser.Geom.Point = new Phaser.Geom.Point(0, 0),
            wPt: Phaser.Geom.Point = new Phaser.Geom.Point(0, 0);

        for (let e: number = 0; e < this._validNodes.length; e++) {
            const potentialEnemies: Piece[] = this._board.getPiecesAtPosition(
                this._validNodes[e].pos
            );
            if (!potentialEnemies.length) {
                continue;
            }
            enemy = potentialEnemies[0];
            if (this._piece.canEngagePiece(enemy)) {
                ePt = Phaser.Geom.Point.Clone(enemy.position);
                for (let ex: number = ePt.x - 1; ex < ePt.x + 2; ex++) {
                    for (let ey: number = ePt.y - 1; ey < ePt.y + 2; ey++) {
                        wPt.setTo(ex, ey);
                        node = this.getNode(wPt);
                        if (node) {
                            node.warning = true;
                        }
                    }
                }
            }
        }

        if (this._piece.stats.movement > 1) {
            this._validNodes = this._validNodes.sort((n1: Node, n2: Node) =>
                Board.distance(this._piece.position, n1.pos) <
                Board.distance(this._piece.position, n2.pos)
                    ? -1
                    : 1
            );
        }

        if (!this._piece.hasStatus(UnitStatus.Flying)) {
            await this.generatePaths();
        } else {
            await this.generateRange();
        }
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

    private async generatePaths(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise((resolve: Function) => {
            this._validNodes
                .filter((node: Node) => node && node.traversable)
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

    private async generateRange(): Promise<void> {
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
                    Phaser.Geom.Point.Equals(node.pos, pt) && node.traversable
            ) || null
        );
    }

    public getPathTo(pt: Phaser.Geom.Point): Path {
        let path: Path, node: Node;
        node = this.getNode(pt);
        if (!this._piece || !node?.traversable) {
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

        if (!path || !path.nodes || path.nodes.length <= 1) {
            return;
        }

        for (let n: number = 1; n < path.nodes.length - 1; n++) {
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
        for (var n: number = 0; n < this._validNodes.length; n++) {
            if (Phaser.Geom.Point.Equals(this._validNodes[n].pos, fromPt)) {
                firstNode = this._validNodes[n];
            }
            if (Phaser.Geom.Point.Equals(this._validNodes[n].pos, toPt)) {
                destinationNode = this._validNodes[n];
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
        let travelCost: number = 1.0;

        let g: number;
        let h: number;
        let f: number;

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

                if (testNode == currentNode || testNode.traversable == false)
                    continue;
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
                    if (currentNode.warning != true) {
                        openNodes.push(testNode);
                    }
                    
                }
            }
            closedNodes.push(currentNode);

            if (openNodes.length == 0) {
                return null;
            }
            openNodes.sort(function (n1: Node, n2: Node): number {
                return n1.f < n2.f ? -1 : 1;
            });
            currentNode = openNodes.shift() as Node;
        }
        return RangeGizmo.buildPath(destinationNode, firstNode);
    }

    public findConnectedNodes(node: Node): Node[] {
        var output: Node[] = [];

        for (var n: number = 0; n < this._validNodes.length; n++) {
            if (
                node.x < this._validNodes[n].x - 1 ||
                node.x > this._validNodes[n].x + 1
            ) {
                continue;
            }
            if (
                node.y < this._validNodes[n].y - 1 ||
                node.y > this._validNodes[n].y + 1
            ) {
                continue;
            }
            if (node === this._validNodes[n]) {
                continue;
            }
            output.push(this._validNodes[n]);
        }

        return output;
    }

    public static diagonalHeuristic(
        node: Node,
        destinationNode: Node,
        cost: number = 1.0,
        diagonalCost: number = 1.5,
        warningCost: number = 999
    ): number {
        var dx: number = Math.abs(node.x - destinationNode.x);
        var dy: number = Math.abs(node.y - destinationNode.y);

        var diag: number = Math.min(dx, dy);
        var straight: number = dx + dy;

        if (node.warning === true) {
            return (
                diagonalCost * diag + cost * (straight - 2 * diag) + warningCost
            );
        }

        return diagonalCost * diag + cost * (straight - 2 * diag);
    }

    public static buildPath(destinationNode: Node, startNode: Node): Path {
        let angles: number[] = [];
        let path: Node[] = [];
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

        /*
        for (let n: number = 0; n < path.length; n++) {
            if (path[n].warning === true) {
                path.slice(n + 1, path.length).forEach(node => { node.traversable = false });
                path = path.slice(0, n);
                angles = angles.slice(0, n);
                break;
            }
        }
        */

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
    private _pos: Phaser.Geom.Point = new Phaser.Geom.Point(-1, -1);
    public g: number;
    public f: number;
    public h: number;
    public parentNode: Node;
    public traversable: boolean = true;
    public warning: boolean = false;
    public path: Path;
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
    private _nodes: Node[];
    private _angles: number[];
    private _cost: number;

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
        return this._nodes[this._nodes.length - 1].warning;
    }
}
