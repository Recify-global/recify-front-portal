import { describe, expect, it, vi } from 'vitest';
import { createIndividualUploadFlow } from '@/utils/individual-upload-flow';

describe('individual upload flow identity', () => {
  it('captures the origin company when a file flow begins', () => {
    const flow = createIndividualUploadFlow();

    expect(flow.begin('company-a')).toEqual({ companyId: 'company-a', generation: 1 });
    expect(flow.getActive()?.companyId).toBe('company-a');
  });

  it('does not replace the origin when only the active auth company changes', () => {
    const flow = createIndividualUploadFlow();
    const context = flow.begin('company-a');

    expect(flow.getActive()).toBe(context);
    expect(flow.isCurrent(context, 'company-b')).toBe(false);
    expect(flow.getActive()?.companyId).toBe('company-a');
  });

  it('creates a new generation for each new file', () => {
    const flow = createIndividualUploadFlow();
    const first = flow.begin('company-a');
    const second = flow.begin('company-a');

    expect(second.generation).toBeGreaterThan(first.generation);
    expect(flow.isCurrent(first, 'company-a')).toBe(false);
    expect(flow.isCurrent(second, 'company-a')).toBe(true);
  });

  it('aborts every request attached to a cancelled generation', () => {
    const flow = createIndividualUploadFlow();
    const context = flow.begin('company-a');
    const preprocess = flow.createController(context);
    const upload = flow.createController(context);
    const preprocessAbort = vi.fn();
    preprocess?.signal.addEventListener('abort', preprocessAbort);

    flow.cancel();

    expect(preprocess?.signal.aborted).toBe(true);
    expect(upload?.signal.aborted).toBe(true);
    expect(preprocessAbort).toHaveBeenCalledOnce();
    expect(flow.getActive()).toBeNull();
  });

  it('rejects controllers for stale responses', () => {
    const flow = createIndividualUploadFlow();
    const stale = flow.begin('company-a');
    flow.cancel();

    expect(flow.createController(stale)).toBeNull();
    expect(flow.isCurrent(stale, 'company-a')).toBe(false);
  });

  it('completes only the matching generation', () => {
    const flow = createIndividualUploadFlow();
    const first = flow.begin('company-a');
    const second = flow.begin('company-a');

    flow.complete(first);
    expect(flow.getActive()).toBe(second);

    flow.complete(second);
    expect(flow.getActive()).toBeNull();
  });

  it('never treats another company as current', () => {
    const flow = createIndividualUploadFlow();
    const context = flow.begin('company-a');

    expect(flow.isCurrent(context, 'company-b')).toBe(false);
    expect(flow.isCurrent(context, null)).toBe(false);
  });

  it('does not abort a controller after it was released', () => {
    const flow = createIndividualUploadFlow();
    const context = flow.begin('company-a');
    const controller = flow.createController(context);
    expect(controller).not.toBeNull();

    flow.releaseController(controller as AbortController);
    flow.cancel();

    expect(controller?.signal.aborted).toBe(false);
  });
});
