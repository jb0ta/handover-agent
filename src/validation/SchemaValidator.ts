import Ajv, { ErrorObject, ValidateFunction } from "ajv";

export type JsonSchema = Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

/**
 * Compiles JSON schemas once and reuses them.
 *
 * Takes schema *objects*, not paths — nothing here touches a filesystem, so
 * the same validation runs in Node, in a test with no fixtures on disk, and in
 * a browser. Loading schemas is a separate concern (`src/schemas`).
 *
 * The cache is not an optimisation, it is a correctness requirement: AJV
 * registers a schema by its `$id` when compiled and throws
 * "schema with key or id ... already exists" on a second compile of the same
 * `$id`. Compiling per call therefore makes any holder of an AJV instance
 * single-use — fine for a one-shot script, fatal for a server that validates
 * on every request.
 */
export class SchemaValidator {
  private ajv: Ajv;
  /** Schemas that declare an `$id` — the identity AJV itself cares about. */
  private byId: Map<string, ValidateFunction>;
  /** Anonymous schemas, keyed by the object handed in. */
  private byObject: WeakMap<JsonSchema, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.byId = new Map();
    this.byObject = new WeakMap();
  }

  validatorFor(schema: JsonSchema): ValidateFunction {
    const id = typeof schema.$id === "string" ? schema.$id : undefined;

    const cached = id ? this.byId.get(id) : this.byObject.get(schema);
    if (cached) {
      return cached;
    }

    const validate = this.ajv.compile(schema);
    if (id) {
      this.byId.set(id, validate);
    } else {
      this.byObject.set(schema, validate);
    }
    return validate;
  }

  validate(schema: JsonSchema, data: unknown): ValidationResult {
    const validate = this.validatorFor(schema);
    const valid = validate(data);
    return { valid, errors: validate.errors || [] };
  }
}

export default SchemaValidator;
