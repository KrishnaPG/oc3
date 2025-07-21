import { WorkerBackend } from '../../../src/worker-backend'

new WorkerBackend(self as unknown as DedicatedWorkerGlobalScope);
