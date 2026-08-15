/**
 * Argument parsing for the demo runner and the approval gate server.
 *
 * Deliberately minimal — enough to point either entry point at a real skill
 * and a real client response without editing source. Anything more elaborate
 * belongs in a proper CLI, which is worth building once the file-driven flow
 * has been used in anger.
 */

export const DEFAULT_SKILL_PATH = "./skills/example-skill.yaml";

export interface EngagementOptions {
  /** Skill definition to run intake against (.json, .yaml or .yml). */
  skillPath: string;
  /** Client response. When absent, the built-in worked example is used. */
  responsePath?: string;
  /** Where decided engagements are written. Server only. */
  outputDir?: string;
  /** Port for the gate server. */
  port?: number;
  /** Print usage and exit. */
  help: boolean;
}

export class UsageError extends Error {}

const USAGE = `
Usage:
  npm run dev  -- [--skill <path>] [--response <path>]
  npm run gate -- [--skill <path>] [--response <path>] [--port <n>] [--out <dir>]

Options:
  --skill     <path>  Skill definition (.json, .yaml or .yml).
                      Default: ${DEFAULT_SKILL_PATH}
  --response  <path>  Client response (.json, .yaml or .yml).
                      Default: the built-in worked example.
  --port      <n>     Gate server port. Default: 4173 (or $PORT).
  --out       <dir>   Where decided engagements are written. Default: ./engagements
  -h, --help          Show this message.

Start from examples/example-client-response.yaml — copy it, fill it in with the
client's own words and materials, then:

  npm run gate -- --skill ./skills/my-skill.yaml --response ./my-client.yaml
`.trim();

export function usage(): string {
  return USAGE;
}

/**
 * Parses `--flag value` and `--flag=value`. Unknown flags are an error rather
 * than being ignored — a typo'd `--responses` silently falling back to the demo
 * would be the worst possible failure for this tool.
 */
export function parseArgs(argv: string[]): EngagementOptions {
  const options: EngagementOptions = {
    skillPath: DEFAULT_SKILL_PATH,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    const equalsAt = arg.indexOf("=");
    const flag = equalsAt === -1 ? arg : arg.slice(0, equalsAt);
    const inlineValue = equalsAt === -1 ? undefined : arg.slice(equalsAt + 1);

    const takeValue = (): string => {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${flag} needs a value.`);
      }
      return value;
    };

    switch (flag) {
      case "--skill":
        options.skillPath = takeValue();
        break;
      case "--response":
        options.responsePath = takeValue();
        break;
      case "--out":
        options.outputDir = takeValue();
        break;
      case "--port": {
        const raw = takeValue();
        const port = Number(raw);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new UsageError(`--port must be a number between 0 and 65535, got "${raw}".`);
        }
        options.port = port;
        break;
      }
      default:
        throw new UsageError(`Unknown option: ${flag}`);
    }
  }

  return options;
}
