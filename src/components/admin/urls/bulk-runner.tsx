'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { applyRouteEdits, previewRouteEdits, startBatch } from '@/lib/actions/url-manager';
import type { Preview, RouteEdit } from '@/lib/urls/manager';
import { Drawer } from './drawer';
import { PreviewPanel, type ApplyOptions } from './preview-panel';

const CHUNK = 200;

/**
 * Applies a set of edits.
 *
 * Up to CHUNK edits are one atomic change against the preview shown. Larger
 * jobs run in atomic batches of CHUNK, each re-previewed immediately before it
 * is applied, with visible progress; a failed batch stops the run, everything
 * before it stays applied, and Resume continues from the failed batch.
 */
export function BulkRunner({
  title,
  edits,
  preview,
  origin,
  onClose,
  onDone,
}: {
  title: string;
  edits: RouteEdit[];
  preview: Preview;
  origin: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [options, setOptions] = React.useState<ApplyOptions>({ updateLinks: false, updateCanonicals: false });
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const batchRef = React.useRef<string | null>(null);
  const chunks = React.useMemo(() => {
    const out: RouteEdit[][] = [];
    for (let i = 0; i < edits.length; i += CHUNK) out.push(edits.slice(i, i + CHUNK));
    return out;
  }, [edits]);

  const conflicts = preview.items.filter((i) => i.status === 'conflict').length;
  const blocked = preview.errors.length > 0 || edits.length === 0;

  const run = async () => {
    setRunning(true);
    setError(null);
    if (!batchRef.current) {
      const batch = await startBatch();
      batchRef.current = batch.ok ? (batch.data ?? null) : null;
    }
    let moved = 0;
    for (let index = done; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      let token = preview.token;
      if (chunks.length > 1) {
        const fresh = await previewRouteEdits(chunk);
        if (!fresh.ok) {
          setError(`Batch ${index + 1} of ${chunks.length}: ${fresh.error}`);
          setRunning(false);
          return;
        }
        token = fresh.data!.token;
      }
      const result = await applyRouteEdits(chunk, { token, ...options, batchId: batchRef.current ?? undefined });
      if (!result.ok) {
        setError(`Batch ${index + 1} of ${chunks.length} was not applied: ${result.error}`);
        setRunning(false);
        return;
      }
      moved += result.data?.moved ?? 0;
      setDone(index + 1);
    }
    setRunning(false);
    toast(`${moved} URL(s) updated.`);
    onDone();
  };

  const percent = chunks.length ? Math.round((done / chunks.length) * 100) : 0;

  return (
    <Drawer
      open
      onClose={running ? () => undefined : onClose}
      title={title}
      description={`${edits.length} URL(s)${chunks.length > 1 ? ` · ${chunks.length} batches of up to ${CHUNK}` : ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={running}>
            {done > 0 && done < chunks.length ? 'Close (stop here)' : 'Cancel'}
          </Button>
          <Button onClick={run} disabled={blocked || running || (conflicts > 0 && chunks.length === 1)}>
            {running ? 'Applying…' : done > 0 ? 'Resume' : `Apply ${edits.length} change(s)`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {chunks.length > 1 ? (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/15" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
              <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {done} of {chunks.length} batches applied. Each batch is atomic; the preview below covers the first batch.
            </p>
          </div>
        ) : null}
        {conflicts > 0 && chunks.length === 1 ? (
          <Alert tone="warning">Resolve or deselect the conflicting URLs, then preview again. Nothing is applied while a selected URL conflicts.</Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <PreviewPanel preview={preview} origin={origin} options={options} onOptions={setOptions} />
      </div>
    </Drawer>
  );
}
