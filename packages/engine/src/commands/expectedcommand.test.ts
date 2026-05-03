import { describe, it, expect } from "vitest";
import type { CastSpellCommand, EndSpellPickCommand, PickSpellCommand } from "../protocol/commands";
import { ExpectedCommand } from "./expectedcommand";

const pickCmd = (commandId: string, spellId = 1): PickSpellCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "pick-spell",
    spellId,
});

const endPickCmd = (commandId: string): EndSpellPickCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "end-spell-pick",
});

const castCmd = (commandId: string): CastSpellCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "cast-spell",
    target: { self: true },
});

describe("ExpectedCommand", () => {
    it("accepts a matching command from the expected player", async () => {
        const slot = new ExpectedCommand<PickSpellCommand | EndSpellPickCommand>(
            1,
            ["pick-spell", "end-spell-pick"],
        );
        const promise = slot.untilAccepted();

        const result = slot.submit(1, pickCmd("c1", 5));
        expect(result).toBe("accepted");

        const accepted = await promise;
        expect(accepted.kind).toBe("pick-spell");
    });

    it("rejects a command from a different player as not-your-turn", () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        const result = slot.submit(2, pickCmd("c2"));
        expect(result).toBe("not-your-turn");
        expect(slot.isOpen).toBe(true);
    });

    it("rejects a non-matching kind as wrong-kind", () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        const result = slot.submit(1, castCmd("c3"));
        expect(result).toBe("wrong-kind");
        expect(slot.isOpen).toBe(true);
    });

    it("returns wrong-kind on subsequent submissions after acceptance", () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        slot.submit(1, pickCmd("c4"));
        const second = slot.submit(1, pickCmd("c5"));
        expect(second).toBe("wrong-kind");
        expect(slot.isOpen).toBe(false);
    });

    it("expectedPlayerId reflects the constructor argument", () => {
        const slot = new ExpectedCommand(7, ["pick-spell"]);
        expect(slot.expectedPlayerId).toBe(7);
    });

    it("cancel() rejects an awaiting promise with an Error", async () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        const promise = slot.untilAccepted();
        slot.cancel();
        await expect(promise).rejects.toThrow(/cancelled/);
        expect(slot.isOpen).toBe(false);
    });

    it("cancel() before untilAccepted causes that call to reject immediately", async () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        slot.cancel();
        await expect(slot.untilAccepted()).rejects.toThrow(/cancelled/);
    });

    it("cancel() is a no-op when already accepted", async () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        const promise = slot.untilAccepted();
        slot.submit(1, pickCmd("c-ok"));
        slot.cancel();
        await expect(promise).resolves.toMatchObject({ kind: "pick-spell" });
    });

    it("untilAccepted is idempotent once accepted", async () => {
        const slot = new ExpectedCommand<PickSpellCommand>(1, ["pick-spell"]);
        slot.submit(1, pickCmd("c-once"));
        const a = await slot.untilAccepted();
        const b = await slot.untilAccepted();
        expect(a).toBe(b);
    });
});
