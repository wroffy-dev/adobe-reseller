'use client';

import * as React from 'react';
import { X, Undo2, RotateCcw } from 'lucide-react';
import { getBlock, type BlockSurface } from '@/lib/cms/blocks';
import type { SectionDesign } from '@/lib/cms/design';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { SaveStateIndicator, type SaveState } from '@/components/admin/save-state';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { FieldList, type FieldValues } from './field-renderer';
import { writeFieldPath } from '@/lib/cms/fields';
import { DesignPanel } from './design-panel';
import type { BuilderSection } from './section-builder';

/** Everything in this panel a person can change. */
type Draft = {
  name: string;
  content: FieldValues;
  settings: FieldValues;
};

/**
 * How far back Undo reaches.
 *
 * Bounded because a section's content and settings are whole objects and each
 * step keeps one of each; fifty is far more than anyone steps back through and
 * still nothing next to the page being edited.
 */
const HISTORY_LIMIT = 50;

/**
 * Whether two drafts hold the same values.
 *
 * Compared as JSON because that is what these are: content and settings come
 * out of a JSON column and go back into one, so there is no class, no Date and
 * no undefined to trip it up. It decides only whether Reset has anything to
 * undo, so a false "different" would cost a redundant button, not correctness.
 */
function same(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Editor for the selected section.
 *
 * Content comes from the block's own field descriptors through the shared field
 * renderer; Design, Responsive and Advanced come from the shared design panel.
 * Nothing block-specific lives here, which is what keeps a new block free.
 */
export function SectionEditorPanel({
  section,
  canEdit,
  takenAnchors,
  onSave,
  onClose,
  surface = 'page',
}: {
  section: BuilderSection;
  canEdit: boolean;
  takenAnchors: string[];
  onSave: (next: {
    name: string | null;
    content: FieldValues;
    settings: FieldValues;
  }) => Promise<boolean>;
  onClose?: () => void;
  /** Where the section lives, which decides the few controls only one surface reads. */
  surface?: BlockSurface;
}) {
  const definition = getBlock(section.blockType);

  const [tab, setTab] = React.useState('content');
  const [draft, setDraft] = React.useState<Draft>(() => ({
    name: section.name ?? '',
    content: section.content,
    settings: section.settings,
  }));
  /** Snapshots to step back through. Oldest first, newest last. */
  const [history, setHistory] = React.useState<Draft[]>([]);
  /** What the database holds, as far as this panel knows. Reset returns here. */
  const [saved, setSaved] = React.useState<Draft>(() => ({
    name: section.name ?? '',
    content: section.content,
    settings: section.settings,
  }));
  const [state, setState] = React.useState<SaveState>('idle');
  const [confirmReset, setConfirmReset] = React.useState(false);

  /**
   * Which control the last edit came from.
   *
   * Consecutive edits to the same one collapse into a single history entry, so
   * Undo steps back a field at a time rather than a character at a time — no
   * timer involved, just the identity of the control being edited.
   */
  const lastEdited = React.useRef<string | null>(null);

  const { name, content, settings } = draft;

  /*
   * There is deliberately no effect re-syncing this form from `section`.
   *
   * There used to be one, keyed on `section.content` and `section.settings` —
   * object references. Saving replaces exactly those references (the workspace
   * merges the saved values back into its list), so the effect fired on every
   * successful save and reset the editor: the active tab jumped back to
   * Content, so a change made on Design, Responsive or Advanced left the user
   * looking at a different panel and their section apparently collapsed. It
   * also cut the "Saved" indicator short by resetting the state to idle in the
   * same pass.
   *
   * Switching to a different section is already handled without an effect: the
   * workspace renders this panel with `key={selected.id}`, so a different
   * section remounts it and the `useState` initialisers below read that
   * section's stored values. Prop changes that arrive while the same section
   * stays selected are this component's own save coming back, and must not
   * clobber what the user is still editing.
   */

  /** Applies an edit, remembering what it replaced. */
  function edit(control: string, next: Draft) {
    if (lastEdited.current !== control) {
      setHistory((past) => [...past, draft].slice(-HISTORY_LIMIT));
      lastEdited.current = control;
    }
    setDraft(next);
    setState('dirty');
  }

  /** Steps back one edit. */
  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setDraft(previous);
    // The next edit starts a new step, whichever control it comes from.
    lastEdited.current = null;
    setState(same(previous, saved) ? 'idle' : 'dirty');
  }

  /** Throws away every unsaved change and returns to the stored version. */
  function reset() {
    setDraft(saved);
    setHistory([]);
    lastEdited.current = null;
    setState('idle');
    setConfirmReset(false);
  }

  async function save() {
    setState('saving');
    const submitted = draft;
    const ok = await onSave({
      name: submitted.name || null,
      content: submitted.content,
      settings: submitted.settings,
    });
    setState(ok ? 'saved' : 'error');
    if (ok) {
      // Reset now returns here rather than to the version loaded on mount.
      // History is kept: stepping back past a save is a reasonable thing to
      // want, and doing so simply makes the panel dirty again.
      setSaved(submitted);
      // Fade the confirmation so the panel does not keep shouting "Saved".
      window.setTimeout(
        () => setState((current) => (current === 'saved' ? 'idle' : current)),
        2500,
      );
    }
  }

  if (!definition) {
    return (
      <div className="p-4">
        <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted">
          No editor is registered for the block type{' '}
          <code className="font-mono text-content">{section.blockType}</code>. Remove this section
          or restore the block in the registry.
        </p>
      </div>
    );
  }

  const dirty = state === 'dirty' || state === 'error';

  const changed = !same(draft, saved);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-hairline px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-content">
            {name || definition.label}
          </h2>
          <p className="truncate text-xs text-muted">{definition.label}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close section editor"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <AdminTabs
        tabs={[
          { id: 'content', label: 'Content' },
          // Only for a block that embeds a form.
          ...(definition.formFields ? [{ id: 'form', label: 'Form' }] : []),
          { id: 'design', label: 'Design' },
          { id: 'responsive', label: 'Responsive' },
          { id: 'advanced', label: 'Advanced' },
        ]}
        active={tab}
        onChange={setTab}
        className="shrink-0 px-2"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <fieldset disabled={!canEdit || state === 'saving'} className="space-y-4 p-3">
          <TabPanel id="content" active={tab} className="space-y-4">
            <FieldList
              fields={definition.fields}
              values={content}
              idPrefix={`c-${section.id}`}
              onChange={(field, value) =>
                edit(`content:${field}`, {
                  ...draft,
                  content: writeFieldPath(content, field, value) as FieldValues,
                })
              }
            />
          </TabPanel>

          {definition.formFields ? (
            <TabPanel id="form" active={tab} className="space-y-4">
              <p className="text-xs text-muted">
                Restyles the form in this section only. Anything left blank keeps the form’s own
                design from Forms, and other pages using the same form are not affected.
              </p>
              {definition.formFields.map((group) => (
                <fieldset key={group.title} className="rounded-lg border border-hairline p-3">
                  <legend className="px-1 text-sm font-medium text-content">{group.title}</legend>
                  <FieldList
                    fields={group.fields}
                    values={content}
                    idPrefix={`f-${section.id}`}
                    onChange={(field, value) =>
                      edit(`content:${field}`, {
                        ...draft,
                        content: writeFieldPath(content, field, value) as FieldValues,
                      })
                    }
                  />
                </fieldset>
              ))}
            </TabPanel>
          ) : null}

          <TabPanel id="design" active={tab}>
            <DesignPanel
              value={settings}
              view="design"
              idPrefix={`d-${section.id}`}
              takenAnchors={takenAnchors}
              onChange={(next: SectionDesign) =>
                edit('settings:design', { ...draft, settings: next as unknown as FieldValues })
              }
            />
          </TabPanel>

          <TabPanel id="responsive" active={tab}>
            <DesignPanel
              value={settings}
              view="responsive"
              idPrefix={`r-${section.id}`}
              takenAnchors={takenAnchors}
              // A hero on a product page always stretches, so it is not offered the switch.
              offerStretch={surface === 'productDetail' && section.blockType !== 'hero'}
              supports={definition.design}
              onChange={(next: SectionDesign) =>
                edit('settings:responsive', { ...draft, settings: next as unknown as FieldValues })
              }
            />
          </TabPanel>

          <TabPanel id="advanced" active={tab} className="space-y-4">
            <Field
              label="Section label"
              htmlFor={`name-${section.id}`}
              hint="Only shown in the builder, to help you find this section."
            >
              <Input
                id={`name-${section.id}`}
                value={name}
                placeholder={definition.label}
                onChange={(event) => edit('name', { ...draft, name: event.target.value })}
              />
            </Field>

            <DesignPanel
              value={settings}
              view="advanced"
              idPrefix={`a-${section.id}`}
              takenAnchors={takenAnchors}
              onChange={(next: SectionDesign) =>
                edit('settings:advanced', { ...draft, settings: next as unknown as FieldValues })
              }
            />
          </TabPanel>
        </fieldset>
      </div>

      {canEdit ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline bg-muted/[0.03] px-3 py-2.5">
          <SaveStateIndicator state={state} />
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={history.length === 0 || state === 'saving'}
              title="Step back one change"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={!changed || state === 'saving'}
              title="Go back to the last saved version of this section"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              {state === 'saving' ? 'Saving…' : 'Save section'}
            </Button>
          </div>
        </div>
      ) : null}
      </div>

      {/*
        * Reset throws work away, so it asks first. Undo does not: it is one
        * step, and stepping back is itself undoable by editing again.
        */}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="Reset this section to the last saved version?"
        message="Every change made since the last save is discarded. The section stays where it is, with the content it was last saved with."
        confirmLabel="Reset section"
      />
    </>
  );
}
