export class RecoverableSaveQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  enqueue(operation) {
    const queued = this.tail
      .catch(() => undefined)
      .then(() => operation());
    this.tail = queued;
    return queued;
  }
}
