import * as handlers from '../../api/cron.js';
import { adapt } from '../adapter.js';

export default adapt(handlers);
export const config = { path: '/api/cron' };
