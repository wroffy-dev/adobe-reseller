'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Spinner } from '@/components/ui/icons';
import type { PublicForm, PublicFormField } from '@/lib/services/forms';
import { submitForm } from '@/lib/actions/submit-form';
import { requestCaptchaChallenge } from '@/lib/actions/captcha';
import type { CaptchaChallenge } from '@/lib/forms/captcha';
import { collectAttribution, trackConversion } from '@/lib/analytics/attribution';
import { buildFormStyles, type FormStyles } from '@/lib/forms/form-design';
import { conditionsSatisfied } from '@/lib/forms/field-settings';
import { ConsentBlock } from './consent-block';
import { FormButtonIcon } from './form-button-icon';
import { cn } from '@/lib/utils/cn';

/**
 * The one form renderer on the site.
 *
 * Lead, contact, popup, hero, CTA, product enquiry, CMS block and landing-page
 * forms all come through here. Nothing styles a form anywhere else: the markup
 * below is identical in every location, and the whole of a form's appearance
 * comes from the CSS custom properties compiled out of its own design record.
 * That is what lets a popup form and a hero form look nothing alike while
 * sharing one code path — and why a fix here fixes every form at once.
 *
 * `compact` remains as a layout hint for narrow containers (a popup, a sidebar):
 * it collapses the grid to one column unless the design explicitly asks for
 * more, so a form dropped into a 320px popup is readable without the admin
 * having to configure anything.
 */

/** Native input type per field type — everything else falls back to text. */
const INPUT_TYPES: Record<string, string> = {
  EMAIL: 'email',
  PHONE: 'tel',
  NUMBER: 'number',
  URL: 'url',
  DATE: 'date',
  TIME: 'time',
};

/** Field types where a placeholder is meaningless, so the control omits it. */
const NO_PLACEHOLDER = new Set([
  'CHECKBOX',
  'CONSENT',
  'RADIO',
  'DATE',
  'TIME',
  'HIDDEN',
  'MULTISELECT',
]);

export function PublicFormRenderer({
  form,
  productId,
  leadMagnetId,
  ctaLabel,
  ctaLocation,
  className,
  compact,
  context,
  instanceKey,
}: {
  form: PublicForm;
  productId?: string | null;
  leadMagnetId?: string | null;
  ctaLabel?: string;
  ctaLocation?: string;
  className?: string;
  /** Narrow container: collapse to one column unless the design says otherwise. */
  compact?: boolean;
  /**
   * Display values for system fields — the product being enquired about, say.
   * Shown so the visitor can see what they are asking about; the value the
   * server records is resolved from the trusted product id, not from here, so
   * nothing about a submission depends on what this prop contains.
   */
  context?: Record<string, string>;
  /**
   * The placement this is — a section id, a widget id. The same form twice on
   * one page gets its own scoped styles and its own field ids from it, so its
   * hover rules stay its own and its labels point at its own inputs. The
   * form's slug is still what is submitted.
   */
  instanceKey?: string;
}) {
  const router = useRouter();
  const scope = instanceKey ? `${form.slug}-${instanceKey}` : form.slug;
  const [pending, setPending] = React.useState(false);
  /*
   * The one consent box. Unticked on mount and never seeded from anything: a
   * box that arrives pre-ticked has not recorded a decision, whatever the
   * evidence row later says about it.
   */
  const [consentAccepted, setConsentAccepted] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const mountedAt = React.useRef<number>(Date.now());
  const headingId = React.useId();
  const captchaId = React.useId();

  const design = form.design;
  const styles = React.useMemo<FormStyles>(
    () => buildFormStyles(design, scope),
    [design, scope],
  );

  /**
   * Live values, tracked only so conditional fields can react as the visitor
   * types. Every field is otherwise uncontrolled — the value that counts is
   * read from the FormData on submit, and the server re-derives visibility for
   * itself rather than trusting anything decided here.
   */
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of form.fields) {
      initial[field.name] =
        (field.settings.system ? context?.[field.name] : undefined) ?? field.defaultValue ?? '';
    }
    return initial;
  });

  const knownNames = React.useMemo(
    () => new Set(form.fields.map((field) => field.name)),
    [form.fields],
  );

  const visibleFields = form.fields.filter(
    (field) => !field.isHidden && conditionsSatisfied(field.settings, values, knownNames),
  );

  /**
   * Math CAPTCHA. The challenge is fetched on mount rather than rendered into
   * the page, so a cached or statically rendered page can never hand a visitor
   * an already-expired token. A fresh one is pulled whenever the previous
   * answer was rejected, which is what makes the "expired" message true.
   */
  const [captcha, setCaptcha] = React.useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = React.useState('');

  const loadCaptcha = React.useCallback(() => {
    if (!form.requireCaptcha) return;
    requestCaptchaChallenge(form.slug)
      .then((challenge) => setCaptcha(challenge))
      .catch(() => setCaptcha(null));
  }, [form.requireCaptcha, form.slug]);

  React.useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const submitted: Record<string, string | string[]> = {};
    for (const field of form.fields) {
      const all = data.getAll(field.name).map((v) => String(v));
      const multi = field.type === 'CHECKBOX' || field.type === 'MULTISELECT';
      submitted[field.name] = multi && all.length > 1 ? all : (all[0] ?? '');
    }

    /*
     * Everything from here is wrapped, and `pending` is cleared in `finally`.
     *
     * A server action can fail in ways that are not a rejected submission — a
     * dropped connection, a deploy mid-request, an error thrown before the
     * action returns. Without this the promise rejects, `setPending(false)`
     * is never reached, and the button reads "Sending…" for as long as the
     * visitor is willing to look at it, with no error and no way back. The
     * form's own inputs are uncontrolled and nothing resets them, so whatever
     * was typed is still there to resubmit.
     */
    try {
      const result = await submitForm({
        formSlug: form.slug,
        productId: productId ?? null,
        leadMagnetId: leadMagnetId ?? null,
        website: String(data.get('website') ?? ''),
        elapsedMs: Date.now() - mountedAt.current,
        values: submitted,
        attribution: collectAttribution({ ctaLabel, ctaLocation }),
        captchaToken: captcha?.token ?? null,
        captchaAnswer: form.requireCaptcha ? captchaAnswer : null,
        /*
         * What was shown and what was ticked. The version travels so the
         * server can refuse a page that has been open since before the notice
         * changed; the server still re-reads the requirement itself, so this
         * is evidence of what the visitor saw, never a statement of what is
         * required — and which purposes the tick covers is decided there,
         * from what this page was told to display.
         */
        consent: {
          noticeKey: form.consent.noticeKey,
          noticeVersion: form.consent.noticeVersion,
          accepted: consentAccepted,
        },
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        // A rejected answer burns the challenge: issue a new question so the
        // visitor is never asked to re-answer one the server will not accept.
        if (form.requireCaptcha) {
          setCaptchaAnswer('');
          loadCaptcha();
        }
        return;
      }

      trackConversion('generate_lead', { form: form.slug, product_id: productId ?? undefined });

      const redirectUrl = result.data?.redirectUrl;
      if (redirectUrl) {
        router.push(redirectUrl);
        return;
      }
      setDone(result.data?.message ?? form.successMessage);
    } catch {
      // Deliberately no detail: whatever went wrong server-side is not the
      // visitor's to read, and the only useful instruction is to try again.
      setFormError('Something went wrong sending this. Please try again.');
    } finally {
      setPending(false);
    }
  }

  /** Scoped stylesheet: responsive overrides and the state rules. */
  const scopedCss = styles.css ? (
    <style
      // The compiler emits only normalised lengths, validated colours and enum
      // values into declarations — nothing admin-entered reaches a selector.
      dangerouslySetInnerHTML={{ __html: styles.css }}
    />
  ) : null;

  if (done) {
    return (
      <>
        {scopedCss}
        <div
          className={cn('fd-form', styles.className, className)}
          style={styles.style as React.CSSProperties}
        >
          <div
            className={cn(
              'fd-success flex flex-col items-center gap-3 text-center',
              design.success.behaviour === 'replace' ? 'min-h-40 justify-center' : null,
            )}
            role="status"
          >
            {design.success.showIcon ? (
              <CheckCircle className="h-8 w-8" aria-hidden="true" />
            ) : null}
            {design.success.heading ? (
              <p className="fd-success-heading text-base font-semibold">
                {design.success.heading}
              </p>
            ) : null}
            <p className="max-w-sm text-sm">{done}</p>
          </div>
        </div>
      </>
    );
  }

  const columns = compact
    ? { ...styles.style, '--fd-cols': design.desktop.columns ? styles.style['--fd-cols'] : '1' }
    : styles.style;

  return (
    <>
      {scopedCss}
      <form
        onSubmit={handleSubmit}
        className={cn(
          'fd-form',
          styles.className,
          design.layout.align === 'center' ? 'mx-auto' : null,
          design.layout.align === 'right' ? 'ml-auto' : null,
          design.layout.fullWidth ? 'w-full' : null,
          className,
        )}
        style={columns as React.CSSProperties}
        noValidate
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="sr-only">
          {form.name}
        </h2>

        {formError ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {formError}
          </div>
        ) : null}

        <div className="fd-grid">
          {/*
           * Hidden fields and fields whose conditions are unmet still render an
           * input, so their configured default reaches the payload and the
           * submission records what the form intended. The server re-derives
           * which of them it will trust.
           */}
          {form.fields
            .filter((field) => !visibleFields.includes(field))
            .map((field) => (
              <input
                key={field.id}
                type="hidden"
                name={field.name}
                value={(field.settings.system ? context?.[field.name] : undefined) ?? field.defaultValue ?? ''}
                readOnly
              />
            ))}

          {visibleFields.map((field) =>
            field.type === 'HIDDEN' ? (
              <input
                key={field.id}
                type="hidden"
                name={field.name}
                defaultValue={field.defaultValue ?? ''}
              />
            ) : (
              <FormFieldRow
                key={field.id}
                field={field}
                formSlug={scope}
                styles={styles}
                errors={fieldErrors[field.name]}
                showRequiredMark={design.label.showRequiredMark}
                contextValue={field.settings.system ? context?.[field.name] : undefined}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [field.name]: value }))
                }
              />
            ),
          )}
        </div>

        {/*
          * The spam check, on one line.
          *
          * It used to be a bordered panel with its own heading and a sentence
          * of explanation — three rows of a short form given over to the one
          * field nobody wanted to fill in. The question is the label, the box
          * sits beside it, and the explanation is the input's title rather
          * than a line of its own. It wraps on a narrow column rather than
          * squeezing the answer box.
          */}
        {form.requireCaptcha ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label htmlFor={captchaId} className="fd-label mb-0">
                {captcha ? captcha.question : 'Loading verification question…'}
                <span className="fd-required" aria-hidden="true">
                  {' '}
                  *
                </span>
              </label>
              <input
                id={captchaId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                disabled={!captcha}
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
                placeholder="Your answer"
                title="A quick check to help us keep out automated spam."
                aria-describedby={fieldErrors._captcha ? `${captchaId}-error` : undefined}
                aria-invalid={fieldErrors._captcha ? true : undefined}
                className="fd-control w-28 shrink-0"
              />
            </div>
            {fieldErrors._captcha ? (
              <p id={`${captchaId}-error`} className="fd-error mt-1" role="alert">
                {fieldErrors._captcha[0]}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Honeypot — hidden from users and screen readers, filled by bots. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={`hp-${scope}`}>Leave this field empty</label>
          <input
            id={`hp-${scope}`}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <ConsentBlock
          requirement={form.consent}
          checked={consentAccepted}
          onChange={setConsentAccepted}
          errors={fieldErrors}
          idPrefix={scope}
        />

        {/* The legacy free-text line, for forms written before the notice. */}
        {form.consentText ? (
          <p className="fd-help mt-3 leading-relaxed">{form.consentText}</p>
        ) : null}

        <div
          className={cn(
            'fd-actions',
            design.button.align === 'center' ? 'fd-actions-center' : null,
            design.button.align === 'right' ? 'fd-actions-right' : null,
          )}
        >
          <button
            type="submit"
            disabled={pending}
            className={cn(
              'fd-submit',
              design.button.width === 'full' ? 'fd-submit-full' : null,
            )}
          >
            {pending ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                {design.button.loadingText || 'Sending…'}
              </>
            ) : (
              <>
                {design.button.icon && design.button.iconPosition === 'left' ? (
                  <FormButtonIcon name={design.button.icon} className="h-4 w-4" />
                ) : null}
                {form.submitLabel}
                {design.button.icon && design.button.iconPosition === 'right' ? (
                  <FormButtonIcon name={design.button.icon} className="h-4 w-4" />
                ) : null}
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * One field.
 *
 * The label is rendered when the admin asks for it, and when they do not the
 * accessible name moves to `aria-label` — turning a label off must change how a
 * form looks, never whether a screen reader can use it.
 */
function FormFieldRow({
  field,
  formSlug,
  styles,
  errors,
  showRequiredMark,
  contextValue,
  onChange,
}: {
  field: PublicFormField;
  formSlug: string;
  styles: FormStyles;
  errors: string[] | undefined;
  showRequiredMark: boolean;
  /** Injected display value for a system field. */
  contextValue?: string;
  onChange: (value: string) => void;
}) {
  const fieldId = `f-${formSlug}-${field.name}`;
  const invalid = Boolean(errors?.length);

  const describedBy = [
    field.helpText ? `${fieldId}-help` : null,
    invalid ? `${fieldId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const labelPosition =
    field.settings.labelPosition === 'inherit' ? styles.labelPosition : field.settings.labelPosition;

  const isChoiceGroup = field.type === 'RADIO' || field.type === 'CHECKBOX';
  const isConsent = field.type === 'CONSENT';
  // A group or a single tick already has its own visible text, so the wrapper
  // label layout would double it up.
  const effectivePosition = isChoiceGroup || isConsent ? 'top' : labelPosition;

  const span = field.colSpan ?? (field.width === 'half' ? 1 : 2);
  const shownValue = contextValue ?? field.defaultValue ?? undefined;

  const wrapperStyle = { '--fd-span': String(span) } as React.CSSProperties;

  const shared = {
    id: fieldId,
    name: field.name,
    required: field.isRequired,
    readOnly: field.isReadOnly || undefined,
    className: 'fd-control',
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy || undefined,
    // When the label is hidden the name has to come from somewhere.
    'aria-label': field.showLabel ? undefined : field.label,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => onChange(event.target.value),
  } as const;

  const placeholder = NO_PLACEHOLDER.has(field.type)
    ? undefined
    : // Floating labels need a non-empty placeholder for :placeholder-shown to
      // work, and a single space is invisible.
      effectivePosition === 'floating'
      ? (field.placeholder ?? ' ') || ' '
      : (field.placeholder ?? undefined);

  const choiceLayout =
    field.settings.choiceLayout === 'inherit' ? styles.choiceLayout : field.settings.choiceLayout;

  const choiceClass = cn(
    'fd-choices',
    choiceLayout === 'horizontal' ? 'fd-choices-horizontal' : null,
    choiceLayout === 'grid' ? 'fd-choices-grid' : null,
  );

  const label =
    field.showLabel && !isConsent ? (
      <label htmlFor={fieldId} className="fd-label">
        {field.label}
        {field.isRequired && showRequiredMark ? (
          <span className="fd-required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
    ) : null;

  const control = (() => {
    switch (field.type) {
      case 'CONSENT':
      case 'CHECKBOX':
        // A lone checkbox carries its label beside the box; a checkbox with
        // options is a group of them.
        if (field.type === 'CONSENT' || field.options.length === 0) {
          return (
            <div className="fd-choice">
              <input
                id={fieldId}
                name={field.name}
                type="checkbox"
                value="true"
                required={field.isRequired}
                disabled={field.isReadOnly || undefined}
                defaultChecked={/^(true|checked|on|yes)$/i.test(field.defaultValue ?? '')}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy || undefined}
                onChange={(event) => onChange(event.target.checked ? 'true' : '')}
              />
              <label htmlFor={fieldId} className="fd-choice-label">
                {field.label}
                {field.isRequired && showRequiredMark ? (
                  <span className="fd-required" aria-hidden="true">
                    {' '}
                    *
                  </span>
                ) : null}
              </label>
            </div>
          );
        }
        return (
          <div className={choiceClass} role="group" aria-label={field.label}>
            {field.options.map((option) => (
              <div key={option.value} className="fd-choice">
                <input
                  id={`${fieldId}-${option.value}`}
                  type="checkbox"
                  name={field.name}
                  value={option.value}
                  disabled={field.isReadOnly || undefined}
                />
                <label htmlFor={`${fieldId}-${option.value}`} className="fd-choice-label">
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        );

      case 'RADIO':
        return (
          <div className={choiceClass} role="radiogroup" aria-label={field.label}>
            {field.options.map((option) => (
              <div key={option.value} className="fd-choice">
                <input
                  id={`${fieldId}-${option.value}`}
                  type="radio"
                  name={field.name}
                  value={option.value}
                  required={field.isRequired}
                  disabled={field.isReadOnly || undefined}
                  defaultChecked={field.defaultValue === option.value}
                  onChange={() => onChange(option.value)}
                />
                <label htmlFor={`${fieldId}-${option.value}`} className="fd-choice-label">
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        );

      case 'TEXTAREA':
        return (
          <textarea
            {...shared}
            rows={field.settings.rows ?? 4}
            maxLength={field.maxLength ?? undefined}
            defaultValue={shownValue}
            placeholder={placeholder}
          />
        );

      case 'SELECT':
        return (
          <select {...shared} defaultValue={shownValue ?? ''}>
            <option value="">
              {field.settings.emptyOptionLabel || field.placeholder || 'Please choose…'}
            </option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'MULTISELECT':
        return (
          <select
            {...shared}
            multiple
            size={Math.min(Math.max(field.options.length, 3), 8)}
            defaultValue={
              field.defaultValue ? field.defaultValue.split(',').map((v) => v.trim()) : []
            }
            onChange={(event) =>
              onChange(
                Array.from(event.target.selectedOptions)
                  .map((option) => option.value)
                  .join(', '),
              )
            }
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <input
            {...shared}
            type={INPUT_TYPES[field.type] ?? 'text'}
            autoComplete={autoCompleteFor(field.type, field.name)}
            maxLength={field.maxLength ?? undefined}
            min={field.settings.min ?? undefined}
            max={field.settings.max ?? undefined}
            defaultValue={shownValue}
            placeholder={placeholder}
          />
        );
    }
  })();

  return (
    <div
      className={cn(
        'fd-field',
        effectivePosition === 'left' ? 'fd-field-left' : null,
        effectivePosition === 'floating' ? 'fd-field-floating' : null,
        field.cssClass || null,
      )}
      style={wrapperStyle}
    >
      {/* A floating label sits after its input so CSS can react to :placeholder-shown. */}
      {effectivePosition === 'floating' ? (
        <>
          {control}
          {label}
        </>
      ) : (
        <>
          {label}
          {control}
        </>
      )}

      {field.helpText && !invalid ? (
        <p id={`${fieldId}-help`} className="fd-help">
          {field.helpText}
        </p>
      ) : null}

      {invalid ? (
        <p id={`${fieldId}-error`} className="fd-error" role="alert">
          {errors!.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

function autoCompleteFor(type: string, name: string): string | undefined {
  if (type === 'EMAIL') return 'email';
  if (type === 'PHONE') return 'tel';
  if (type === 'NAME') return 'name';
  if (type === 'COMPANY') return 'organization';
  if (type === 'URL') return 'url';
  if (type === 'DATE') return 'bday';
  if (/first_?name/i.test(name)) return 'given-name';
  if (/last_?name/i.test(name)) return 'family-name';
  return undefined;
}
