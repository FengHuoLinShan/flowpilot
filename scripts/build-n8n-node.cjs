#!/usr/bin/env node
/** Build the bundled custom trigger with the project's existing TypeScript dependency. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend')] }));
const source = path.join(root, 'n8n/custom-nodes/FlowPilotWebhook.node.ts');
const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true, sourceMap: false },
  fileName: source,
  reportDiagnostics: true,
});
const errors = (output.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  for (const error of errors) process.stderr.write(ts.flattenDiagnosticMessageText(error.messageText, '\n') + '\n');
  process.exit(1);
}
fs.writeFileSync(source.replace(/\.ts$/, '.js'), output.outputText);
process.stdout.write('Built the FlowPilot custom trigger.\n');
