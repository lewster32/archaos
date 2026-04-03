/**
 * Base class for all uniquely identifiable game objects.
 */
export abstract class Model {
    /**
     * The unique identifier for this model.
     */
    private readonly _id: number;

    /**
     * Creates a new Model instance.
     * @param id The unique identifier for this model.
     */
    constructor(id: number) {
        // Sense check the ID. We don't want any funny business here, just
        // positive integers that may or may not end up in a database someday.
        if (id < 0 || !Number.isInteger(id) || Number.isNaN(id)) {
            throw new RangeError("Model ID must be a non-negative integer.");
        }
        this._id = id;
    }

    /**
     * Get the unique identifier for this model.
     */
    get id(): number {
        return this._id;
    }
}
