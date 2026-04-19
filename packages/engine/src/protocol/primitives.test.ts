import { describe, expect, test } from "vitest";
import type {
    CommandId,
    JsonArray,
    JsonObject,
    JsonPrimitive,
    JsonValue,
    PieceId,
    PlayerId,
    Point,
    Sequence,
    SequenceRef,
    SpellId,
    SpellTypeId,
    Token,
} from "./primitives";

describe("primitives", () => {
    test("numeric ID aliases are numbers", () => {
        const player: PlayerId = 1;
        const piece: PieceId = 101;
        const spell: SpellId = 10;
        const seq: Sequence = 42;
        const ref: SequenceRef = 43;
        expect(typeof player).toBe("number");
        expect(typeof piece).toBe("number");
        expect(typeof spell).toBe("number");
        expect(typeof seq).toBe("number");
        expect(typeof ref).toBe("number");
    });

    test("string ID aliases are strings", () => {
        const type: SpellTypeId = "magic-fire";
        const cmd: CommandId = "c_27";
        const token: Token = "abc123";
        expect(typeof type).toBe("string");
        expect(typeof cmd).toBe("string");
        expect(typeof token).toBe("string");
    });

    test("Point has x and y", () => {
        const p: Point = { x: 3, y: 4 };
        expect(p.x).toBe(3);
        expect(p.y).toBe(4);
    });

    test("Point round-trips through JSON", () => {
        const p: Point = { x: 6, y: 6 };
        const round = JSON.parse(JSON.stringify(p));
        expect(round).toEqual(p);
    });

    test("JsonPrimitive covers string, number, boolean, null", () => {
        const values: JsonPrimitive[] = ["s", 1, true, null];
        expect(values).toHaveLength(4);
    });

    test("JsonObject and JsonArray nest via JsonValue", () => {
        const obj: JsonObject = { a: 1, b: "s", c: [true, null] };
        const arr: JsonArray = [1, "s", { nested: true }];
        const val: JsonValue = { mixed: arr };
        expect(JSON.parse(JSON.stringify(obj))).toEqual(obj);
        expect(JSON.parse(JSON.stringify(arr))).toEqual(arr);
        expect(JSON.parse(JSON.stringify(val))).toEqual(val);
    });
});
