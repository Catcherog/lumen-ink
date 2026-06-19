export function serializeError(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error) {
    return err.message;
  }

  if (Array.isArray(err)) {
    return err.map(item => serializeError(item)).join('; ');
  }

  if (err === null || err === undefined) {
    return '发生错误，请稍后重试';
  }

  if (typeof err === 'object') {
    const record = err as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
    if (typeof record.error === 'object' && record.error !== null) {
      const nestedMessage = (record.error as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string' && nestedMessage) {
        return nestedMessage;
      }
    }
    if (typeof record.error === 'string' && record.error) {
      return record.error;
    }
    if (typeof record.msg === 'string' && record.msg) {
      return record.msg;
    }
    return JSON.stringify(err);
  }

  return String(err);
}
