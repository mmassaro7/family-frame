// Netlify Function: the same logic as api/todo.js, served at /api/todo
import handler from '../../api/todo.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/todo' };
