import { describe, expect, test } from "vitest";
import type {
    AttackPieceCommand,
    BaseCommand,
    CancelCastCommand,
    CancelPieceActionCommand,
    CastSpellCommand,
    ChatCommand,
    CommandMessage,
    DismountPieceCommand,
    EndMovementPhaseCommand,
    EndPieceTurnCommand,
    EndSpellPickCommand,
    MountPieceCommand,
    MovePieceCommand,
    PickSpellCommand,
    PingPositionCommand,
    RangedAttackPieceCommand,
    ReconnectCommand,
    RequestHistoryCommand,
    RequestPrivateResendCommand,
    RequestSnapshotCommand,
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
            path: [{ x: 3, y: 4 }],
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
            path: [],
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
            path: [],
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
            to: { x: 4, y: 4 },
        };
        expect(cmd.wizardId).toBe(1);
    });

    test("MovePieceCommand carries path: Point[]", () => {
        const cmd: MovePieceCommand = {
            type: "command",
            commandId: "c1",
            token: "",
            kind: "move-piece",
            pieceId: 10,
            to: { x: 5, y: 5 },
            path: [
                { x: 3, y: 3 },
                { x: 4, y: 4 },
                { x: 5, y: 5 },
            ],
        };
        expect(cmd.path).toHaveLength(3);
        expect(cmd.path[2]).toEqual({ x: 5, y: 5 });
    });

    test("MountPieceCommand carries path: Point[]", () => {
        const cmd: MountPieceCommand = {
            type: "command",
            commandId: "c2",
            token: "",
            kind: "mount-piece",
            wizardId: 1,
            mountId: 2,
            path: [{ x: 3, y: 3 }],
        };
        expect(cmd.path).toEqual([{ x: 3, y: 3 }]);
    });

    test("AttackPieceCommand carries path: Point[]", () => {
        const cmd: AttackPieceCommand = {
            type: "command",
            commandId: "c3",
            token: "",
            kind: "attack-piece",
            attackerId: 1,
            targetId: 2,
            path: [],
        };
        expect(cmd.path).toEqual([]);
    });

    test("DismountPieceCommand carries to: Point", () => {
        const cmd: DismountPieceCommand = {
            type: "command",
            commandId: "c4",
            token: "",
            kind: "dismount-piece",
            wizardId: 1,
            to: { x: 4, y: 4 },
        };
        expect(cmd.to).toEqual({ x: 4, y: 4 });
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

describe("commands — communication", () => {
    test("chat carries message", () => {
        const cmd: ChatCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "chat",
            message: "hi",
        };
        expect(cmd.message).toBe("hi");
    });

    test("ping-position carries point", () => {
        const cmd: PingPositionCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "ping-position",
            point: { x: 5, y: 5 },
        };
        expect(cmd.point).toEqual({ x: 5, y: 5 });
    });
});

describe("commands — history and recovery", () => {
    test("request-snapshot carries only envelope fields", () => {
        const cmd: RequestSnapshotCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "request-snapshot",
        };
        expect(cmd.kind).toBe("request-snapshot");
    });

    test("request-history carries fromSequence and optional toSequence", () => {
        const open: RequestHistoryCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "request-history",
            fromSequence: 10,
        };
        const closed: RequestHistoryCommand = {
            ...open,
            toSequence: 42,
        };
        expect(open.toSequence).toBeUndefined();
        expect(closed.toSequence).toBe(42);
    });

    test("request-private-resend accepts commandId or sequenceRef", () => {
        const byCmd: RequestPrivateResendCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "request-private-resend",
            commandIdRef: "c_x",
        };
        const bySeq: RequestPrivateResendCommand = {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "request-private-resend",
            sequenceRef: 10,
        };
        expect(byCmd.commandIdRef).toBe("c_x");
        expect(bySeq.sequenceRef).toBe(10);
    });

    test("reconnect relies on the envelope token and optional lastAppliedSequence", () => {
        const open: ReconnectCommand = {
            type: "command",
            commandId: "c_1",
            token: "abc",
            kind: "reconnect",
        };
        const resumed: ReconnectCommand = {
            ...open,
            lastAppliedSequence: 30,
        };
        expect(open.token).toBe("abc");
        expect(open.lastAppliedSequence).toBeUndefined();
        expect(resumed.lastAppliedSequence).toBe(30);
    });
});

describe("CommandMessage union discriminator", () => {
    test("covers all 19 command kinds", () => {
        const commands: CommandMessage[] = [
            // 6.1 Spellbook
            { type: "command", commandId: "c_1", token: "t", kind: "pick-spell", spellId: 10 },
            { type: "command", commandId: "c_2", token: "t", kind: "end-spell-pick" },
            // 6.2 Casting
            { type: "command", commandId: "c_3", token: "t", kind: "cast-spell", target: { self: true } },
            { type: "command", commandId: "c_4", token: "t", kind: "cancel-cast" },
            // 6.3 Movement
            { type: "command", commandId: "c_5", token: "t", kind: "select-piece", pieceId: 101 },
            {
                type: "command",
                commandId: "c_6",
                token: "t",
                kind: "move-piece",
                pieceId: 101,
                to: { x: 0, y: 0 },
                path: [{ x: 0, y: 0 }],
            },
            {
                type: "command",
                commandId: "c_7",
                token: "t",
                kind: "attack-piece",
                attackerId: 101,
                targetId: 102,
                path: [],
            },
            {
                type: "command",
                commandId: "c_8",
                token: "t",
                kind: "ranged-attack-piece",
                attackerId: 101,
                targetId: 102,
            },
            {
                type: "command",
                commandId: "c_9",
                token: "t",
                kind: "mount-piece",
                wizardId: 1,
                mountId: 50,
                path: [],
            },
            { type: "command", commandId: "c_10", token: "t", kind: "dismount-piece", wizardId: 1, to: { x: 0, y: 0 } },
            { type: "command", commandId: "c_11", token: "t", kind: "cancel-piece-action", pieceId: 101 },
            { type: "command", commandId: "c_12", token: "t", kind: "end-piece-turn", pieceId: 101 },
            { type: "command", commandId: "c_13", token: "t", kind: "end-movement-phase" },
            // 6.4 Communication
            { type: "command", commandId: "c_14", token: "t", kind: "chat", message: "gg" },
            { type: "command", commandId: "c_15", token: "t", kind: "ping-position", point: { x: 3, y: 3 } },
            // 6.5 History and recovery
            { type: "command", commandId: "c_16", token: "t", kind: "request-snapshot" },
            { type: "command", commandId: "c_17", token: "t", kind: "request-history", fromSequence: 10 },
            { type: "command", commandId: "c_18", token: "t", kind: "request-private-resend", commandIdRef: "c_x" },
            { type: "command", commandId: "c_19", token: "abc", kind: "reconnect" },
        ];
        expect(commands.map((c) => c.kind)).toEqual([
            "pick-spell",
            "end-spell-pick",
            "cast-spell",
            "cancel-cast",
            "select-piece",
            "move-piece",
            "attack-piece",
            "ranged-attack-piece",
            "mount-piece",
            "dismount-piece",
            "cancel-piece-action",
            "end-piece-turn",
            "end-movement-phase",
            "chat",
            "ping-position",
            "request-snapshot",
            "request-history",
            "request-private-resend",
            "reconnect",
        ]);
        expect(commands).toHaveLength(19);
    });
});
