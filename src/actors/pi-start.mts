import { setup } from 'rivetkit';
import { durableDesignAgent } from '../lib/pi-durable.mjs';
const registry=setup({use:{durableDesignAgent}});
registry.start();
console.log('Prospect Studio Pi Durable worker registered');
export { registry };
