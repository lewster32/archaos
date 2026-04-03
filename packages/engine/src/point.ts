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

    static equals(a: Point, b: Point): boolean {
        return a.x === b.x && a.y === b.y;
    }
}
