# @geektech/backone-cli

CLI scaffolding tool for [BackOne](https://github.com/geektech-team/backone/tree/main/packages/backone) server applications. Zero dependencies, Bun-native.

## Installation

```bash
bun add -d @geektech/backone-cli
```

Or run directly without installing:

```bash
bunx @geektech/backone-cli init my-app
```

## Usage

```bash
# Create a new project (interactive template selection)
backone init my-app

# Create with a specific template
backone init my-app --template rest-api

# Create without installing dependencies
backone init my-app --no-install

# Show version / help
backone --version
backone --help
```

Initialization also works in an existing directory. Each existing template
file prompts `Overwrite? (y/N)`: enter `y` or `yes` to overwrite it, or press
Enter to keep it. Skipped files and files outside the template are preserved;
missing template files are created. Without an interactive terminal, existing
files are kept automatically.

## Templates

| Template    | Description                                   |
| ----------- | --------------------------------------------- |
| `minimal`   | Single route, zero extras                     |
| `rest-api`  | CRUD example with route groups and middleware |
| `websocket` | Real-time chat with browser client            |

## Programmatic API

```ts
import { initProject } from '@geektech/backone-cli';

await initProject({
  name: 'my-app',
  template: 'rest-api',
  skipInstall: false,
  cwd: process.cwd(),
  // Optional: decide for each existing file (path relative to the project root)
  confirmOverwrite: async (filePath) => filePath === 'README.md',
});
```

`confirmOverwrite` may return a boolean or a promise. If omitted, the API uses
the same terminal prompt and non-interactive behavior as the CLI.

## Development

```bash
bun test          # Run tests
bun run build     # Build dist
bun run lint      # ESLint
```

## License

MIT
