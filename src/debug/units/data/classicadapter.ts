import type { EditableSpell, Frame } from "./types";

const FRAME_RE = /^(.+?)_([lr])_(\d+|d)$/;

/**
 * Raw shape of an entry in `classicspells.json`. We accept the keys we
 * care about and ignore the rest - non-summon fields like `target` /
 * `castOnEnemyUnit` are not carried into the enhanced format.
 */
interface RawClassicSpell {
    name: string;
    chance: number;
    balance: number;
    unitId?: string;
    description?: string;
    types?: string[];
    spellFrame?: number;
}

/**
 * Raw shape of an entry in `classicunits.json`.
 */
interface RawClassicUnit {
    name: string;
    indefiniteArticle?: "a" | "an";
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    properties: {
        mov: number;
        com: number;
        rcm: number;
        rng: number;
        def: number;
        mnv: number;
        res: number;
    };
    status: string[];
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
}

/**
 * Adapt the classic spell / unit / atlas JSON triple into the editor's
 * uniform `EditableSpell` shape.
 *
 * Spells without a `unitId`, and spells whose `unitId` is not in the
 * units map, are filtered out (matches the read-only panel's behaviour).
 *
 * The returned spells are fully deep-cloned; mutating them does not
 * affect the inputs. This is essential because the inputs come from
 * Vite's static JSON imports which are shared with the rest of the app.
 */
export function adaptClassic(
    spells: Record<string, RawClassicSpell>,
    units: Record<string, RawClassicUnit>,
    atlasFrames: Frame[],
    atlasSize: { w: number; h: number },
    atlasUrl: string,
): EditableSpell[] {
    const out: EditableSpell[] = [];
    for (const [originalId, spell] of Object.entries(spells)) {
        const unitId = spell.unitId;
        if (!unitId) continue;
        const unit = units[unitId];
        if (!unit) continue;

        const unitFrames = atlasFrames
            .filter((f) => {
                const m = FRAME_RE.exec(f.filename);
                return m !== null && m[1] === unitId;
            })
            .map((f) => clone(f));
        if (unitFrames.length === 0) continue;

        const editable: EditableSpell = {
            id: slugLikeId(spell.name),
            name: spell.name,
            chance: spell.chance,
            balance: spell.balance,
            description: spell.description,
            group: "enhanced",
            types: spell.types ? [...spell.types] : undefined,
            spellFrame: spell.spellFrame,
            unit: {
                id: slugLikeId(spell.name),
                name: unit.name,
                indefiniteArticle: unit.indefiniteArticle,
                attackType: unit.attackType,
                rangedType: unit.rangedType,
                projectileType: unit.projectileType,
                properties: { ...unit.properties },
                status: [...unit.status],
                animFrames: unit.animFrames ? [...unit.animFrames] : undefined,
                animSpeed: unit.animSpeed,
                shadowScale: unit.shadowScale,
                textures: [
                    {
                        image: "classicunits.png",
                        imageUrl: atlasUrl,
                        size: { ...atlasSize },
                        frames: unitFrames,
                    },
                ],
            },
            _origin: "classic",
            _originalId: originalId,
            _dirty: false,
        };
        out.push(editable);
    }
    return out;
}

/**
 * Cheap deep clone for a plain JSON-shaped Frame. Inlined here so the
 * adapter has no external dependency.
 */
function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Local slug helper used during adaptation so the id is always derived
 * from the display name. Kept independent of `slugify.ts` purely to
 * avoid a cross-module import in this layer; behaviour matches.
 */
function slugLikeId(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
