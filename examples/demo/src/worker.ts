/**
 * This is mostly used for debugging locally. 
 * For production, directly use: https://app.unpkg.com/oc3@latest/files/dist/worker-backend.js
 */
import { WorkerBackend } from '../../../src/worker-backend'

export class Dummy extends WorkerBackend { };
