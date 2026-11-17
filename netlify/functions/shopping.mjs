// Netlify Function: the same logic as api/shopping.js, served at /api/shopping
import handler from '../../api/shopping.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/shopping' };
