import { Tutorial } from "./tutorial";

/**
 * Registry of all available tutorials, keyed by their machine-readable ID.
 * Tutorial files matching `./tutorial-*.ts` are auto-discovered via glob —
 * no manual registration needed.
 */
const tutorialRegistry: Map<string, new () => Tutorial> = new Map();

const modules = import.meta.glob("./tutorial-*.ts", { eager: true });
for (const mod of Object.values(modules)) {
    for (const exp of Object.values(mod as Record<string, unknown>)) {
        if (typeof exp === "function" && exp.prototype instanceof Tutorial) {
            const Ctor = exp as new () => Tutorial;
            const instance = new Ctor();
            tutorialRegistry.set(instance.config.id, Ctor);
        }
    }
}

/**
 * Look up and instantiate a tutorial by its ID.
 *
 * @param id The machine-readable tutorial ID (e.g. "getting-started").
 * @returns A new Tutorial instance, or null if no tutorial matches the ID.
 */
export function getTutorial(id: string): Tutorial | null {
    const TutorialClass = tutorialRegistry.get(id);
    return TutorialClass ? new TutorialClass() : null;
}

/**
 * Get the tutorials as an array ordered by the `order` field in their config.
 *
 * @returns An array of Tutorial instances for all registered tutorials, sorted by order.
 */
export function getTutorials(): Tutorial[] {
    return Array.from(tutorialRegistry.values())
        .map((Ctor) => new Ctor())
        .toSorted((a, b) => a.config.order - b.config.order);
}
