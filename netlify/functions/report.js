import * as handlers from '../../api/report.js';
import { adapt } from '../adapter.js';

export default adapt(handlers);
export const config = { path: '/api/report' };
