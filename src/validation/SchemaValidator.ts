import * as fs from "fs";
import Ajv, { ErrorObject, ValidateFunction } from "ajv";

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

/**
 * Compiles JSON schemas once and reuses them.
 *
 * AJV registers a schema by its `$id` when compiled and throws
 * "schema with key or id ... already exists" if the same `$id` is compiled a
 * second time. Compiling per validation call therefore makes any holder of an
 * AJV instance single-use — fine for a one-shot demo, fatal for a server that
 * validates on every request. This caches by schema path and reads each file
 * from disk exactly once.
 */
export class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.validators = new Map();
  }

  validatorFor(schemaPath: string): ValidateFunction {
    const cached = this.validators.get(schemaPath);
    if (cached) {
      return cached;
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const validate = this.ajv.compile(schema);
    this.validators.set(schemaPath, validate);
    return validate;
  }

  validate(schemaPath: string, data: unknown): ValidationResult {
    const validate = this.validatorFor(schemaPath);
    const valid = validate(data);
    return { valid, errors: validate.errors || [] };
  }
}

export default SchemaValidator;
