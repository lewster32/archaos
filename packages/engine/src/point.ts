/**
 * A simple 2D point. Replaces Phaser.Geom.Point in the
 * engine so that game logic has no Phaser dependency.
 */
export class Point {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    setTo(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Duck-type check for point-like objects. Returns true
     * for engine Points, Phaser Geom.Points, or any object
     * with numeric x and y properties.
     */
    static isPoint(value: unknown): value is Point {
        return (
            value != null &&
            typeof value === "object" &&
            typeof (value as Point).x === "number" &&
            typeof (value as Point).y === "number"
        );
    }

    static equals(a: Point, b: Point): boolean {
        return a.x === b.x && a.y === b.y;
    }

    static clone(p: Point): Point {
        return new Point(p.x, p.y);
    }
}
