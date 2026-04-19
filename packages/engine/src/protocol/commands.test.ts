import { describe, expect, test } from "vitest";
import type {
    AttackPieceCommand,
    BaseCommand,
    CancelCastCommand,
    CancelPieceActionCommand,
    CastSpellCommand,
    DismountPieceCommand,
    EndMovementPhaseCommand,
    EndPieceTurnCommand,
    EndSpellPickCommand,
    MountPieceCommand,
    MovePieceCommand,
    PickSpellCommand,
    RangedAttackPieceCommand,
    SelectPieceCommand,
} from "./commands";

describe("commands — base envelope", () => {
    test("BaseCommand requires type, commandId, token", () => {
        const cmd: BaseCommand = {
            type: "command",
            commandId: "c_1",
            token: "tkn",
        };
        expect(cmd.type).toBe("command");
        expect(cmd.commandId).toBe("c_1");
        expect(cmd.token).toBe("tkn");
    });
});

describe("commands — spellbook phase", () => {
    test("pick-spell carries spellId and optional illusion", () => {
        const noIllusion: PickSpellCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "pick-spell",
            spellId: 10,
        };
        const withIllusion: PickSpellCommand = {
            ...noIllusion,
            illusion: true,
        };
        expect(noIllusion.illusion).toBeUndefined();
        expect(withIllusion.illusion).toBe(true);
    });

    test("end-spell-pick carries only envelope fields", () => {
        const cmd: EndSpellPickCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "end-spell-pick",
        };
        expect(Object.keys(cmd).toSorted()).toEqual(["commandId", "kind", "token", "type"]);
    });
});

describe("commands — casting phase", () => {
    test("cast-spell carries a SpellTarget", () => {
        const piece: CastSpellCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "cast-spell",
            target: { pieceId: 5 },
        };
        const point: CastSpellCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "cast-spell",
            target: { point: { x: 3, y: 4 } },
        };
        const self: CastSpellCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "cast-spell",
            target: { self: true },
        };
        expect([piece, point, self].map((c) => c.kind)).toEqual(["cast-spell", "cast-spell", "cast-spell"]);
    });

    test("cancel-cast carries only envelope fields", () => {
        const cmd: CancelCastCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "cancel-cast",
        };
        expect(cmd.kind).toBe("cancel-cast");
    });
});

describe("commands — movement phase", () => {
    test("select-piece carries pieceId", () => {
        const cmd: SelectPieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "select-piece",
            pieceId: 101,
        };
        expect(cmd.pieceId).toBe(101);
    });

    test("move-piece carries pieceId and to", () => {
        const cmd: MovePieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "move-piece",
            pieceId: 101,
            to: { x: 3, y: 4 },
        };
        expect(cmd.to).toEqual({ x: 3, y: 4 });
    });

    test("attack-piece carries attacker and target", () => {
        const cmd: AttackPieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "attack-piece",
            attackerId: 101,
            targetId: 102,
        };
        expect([cmd.attackerId, cmd.targetId]).toEqual([101, 102]);
    });

    test("ranged-attack-piece carries attacker and target", () => {
        const cmd: RangedAttackPieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "ranged-attack-piece",
            attackerId: 101,
            targetId: 102,
        };
        expect(cmd.kind).toBe("ranged-attack-piece");
    });

    test("mount-piece carries wizardId and mountId", () => {
        const cmd: MountPieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "mount-piece",
            wizardId: 1,
            mountId: 50,
        };
        expect([cmd.wizardId, cmd.mountId]).toEqual([1, 50]);
    });

    test("dismount-piece carries wizardId", () => {
        const cmd: DismountPieceCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "dismount-piece",
            wizardId: 1,
        };
        expect(cmd.wizardId).toBe(1);
    });

    test("cancel-piece-action carries pieceId", () => {
        const cmd: CancelPieceActionCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "cancel-piece-action",
            pieceId: 101,
        };
        expect(cmd.pieceId).toBe(101);
    });

    test("end-piece-turn carries pieceId", () => {
        const cmd: EndPieceTurnCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "end-piece-turn",
            pieceId: 101,
        };
        expect(cmd.pieceId).toBe(101);
    });

    test("end-movement-phase carries only envelope fields", () => {
        const cmd: EndMovementPhaseCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "end-movement-phase",
        };
        expect(cmd.kind).toBe("end-movement-phase");
    });
});
