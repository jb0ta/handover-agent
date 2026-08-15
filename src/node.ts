import Intake from "./intake/Intake";
import ApprovalGate from "./approval/ApprovalGate";
import SchemaValidator from "./validation/SchemaValidator";
import loadDocument from "./io/loadDocument";
import { defaultSchemas, loadSchemas, Schemas } from "./schemas";

/**
 * The Node wiring.
 *
 * `Intake` and `ApprovalGate` deliberately know nothing about a filesystem —
 * they take schema objects and, for intake, an injected document reader. This
 * module is where the real ones are supplied. It is the only thing a Node
 * caller needs; a browser builds the same classes with schemas it has inlined
 * and no reader at all.
 *
 * Sharing one SchemaValidator across both is intentional: AJV refuses to
 * compile the same `$id` twice, and the brief schema is used by each.
 */

export interface NodeToolkit {
  intake: Intake;
  gate: ApprovalGate;
  schemas: Schemas;
}

export function createToolkit(schemas: Schemas = defaultSchemas()): NodeToolkit {
  const validator = new SchemaValidator();

  return {
    intake: new Intake(
      { skill: schemas.skill, brief: schemas.brief },
      validator,
      loadDocument
    ),
    gate: new ApprovalGate(
      { brief: schemas.brief, vault: schemas.vault },
      validator
    ),
    schemas,
  };
}

export function createIntake(schemas: Schemas = defaultSchemas()): Intake {
  return createToolkit(schemas).intake;
}

export function createApprovalGate(schemas: Schemas = defaultSchemas()): ApprovalGate {
  return createToolkit(schemas).gate;
}

export { defaultSchemas, loadSchemas };
export type { Schemas };
