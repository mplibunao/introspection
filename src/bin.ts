import { version } from './index.js';

const helpText = `introspection ${version}

WI-01 scaffold is installed. Domain commands land in later work items.`;

process.stdout.write(`${helpText}
`);
