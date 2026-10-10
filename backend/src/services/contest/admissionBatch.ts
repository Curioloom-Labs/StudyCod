import type { EntityManager } from "typeorm";

type Transaction = (work: (manager: EntityManager) => Promise<void>) => Promise<void>;
type Pending = {
  work: (manager: EntityManager) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/** Share durable commits during a burst. Receipts are released only after COMMIT. */
export function createAdmissionBatch(transaction: Transaction) {
  const pending: Pending[] = [];
  let scheduled = false;
  let running = false;
  function schedule(): void {
    if (scheduled || running || !pending.length) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; void drain(); }, 5);
  }
  async function drain(): Promise<void> {
    if (running || !pending.length) return;
    running = true;
    const batch = pending.splice(0, 32);
    const outcomes: Array<{ value?: unknown; error?: unknown; failed: boolean }> = [];
    try {
      await transaction(async manager => {
        // The caller locks the global admission row before counting capacity.
        // Each request has a savepoint so one conflict cannot discard its neighbours.
        for (let i = 0; i < batch.length; i++) {
          const savepoint = `contest_admission_${i}`;
          await manager.query(`SAVEPOINT ${savepoint}`);
          try {
            const value = await batch[i].work(manager);
            await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
            outcomes.push({ value, failed: false });
          } catch (error) {
            await manager.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
            outcomes.push({ error, failed: true });
          }
        }
      });
      batch.forEach((item, i) => outcomes[i].failed ? item.reject(outcomes[i].error) : item.resolve(outcomes[i].value));
    } catch (error) {
      batch.forEach(item => item.reject(error));
    } finally {
      running = false;
      schedule();
    }
  }
  return function admit<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.push({ work, resolve: value => resolve(value as T), reject });
      schedule();
    });
  };
}
