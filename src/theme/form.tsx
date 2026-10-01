import { type ReactElement, createContext, useContext } from "react";
import type { FormBlock } from "../blocks";
import type { FieldErrors, Submission } from "../contact";
import { TextField } from "./fields";

// The contact form is a plain HTML form that posts back to its own page, so it works
// without any JavaScript. The server provides FormContext while rendering live pages;
// without it (static export, feeds) the form is left out, because nothing could receive it.

export type FormSetup = {
  // Address the form posts to: the page itself.
  action: string;
  // Signed time stamp against bots, see ContactStore.token.
  token: string;
  privacyHref?: string;
  english: boolean;
  // The form a visitor just sent successfully.
  sent?: string;
  // A failed attempt: what was typed and what is wrong, shown again instead of losing it.
  attempt?: { block: string; values: Submission; errors: FieldErrors; notice?: string };
};

export const FormContext = createContext<FormSetup | null>(null);

const words = {
  de: {
    name: "Name",
    email: "E-Mail",
    phone: "Telefon (optional)",
    message: "Nachricht",
    privacy: ["Mit dem Absenden werden deine Angaben gespeichert, um deine Anfrage zu beantworten. Mehr dazu in der ", "Datenschutzerklärung", "."],
    privacyPlain: "Mit dem Absenden werden deine Angaben gespeichert, um deine Anfrage zu beantworten.",
    trap: "Dieses Feld bitte leer lassen",
  },
  en: {
    name: "Name",
    email: "Email",
    phone: "Phone (optional)",
    message: "Message",
    privacy: ["By sending, you agree that we store your details to answer your request. See our ", "privacy policy", "."],
    privacyPlain: "By sending, you agree that we store your details to answer your request.",
    trap: "Please leave this field empty",
  },
};

export const formAnchor = (blockId: string) => `form-${blockId}`;

type Props = { block: FormBlock; edit?: (patch: Partial<Omit<FormBlock, "id" | "type">>) => void };

export function ContactForm({ block, edit }: Props) {
  const setup = useContext(FormContext);
  if (edit) return <FormPreview block={block} edit={edit} />;
  if (!setup) return null;
  const id = formAnchor(block.id);
  if (setup.sent === block.id) {
    return (
      <div className="t-form-sent" id={id} role="status">
        <TextField value={block.success} multiline />
      </div>
    );
  }
  const text = words[setup.english ? "en" : "de"];
  const attempt = setup.attempt?.block === block.id ? setup.attempt : undefined;
  const values = attempt?.values;
  const errors = attempt?.errors ?? {};
  const field = (name: keyof Submission, label: string, input: (describedBy?: string) => ReactElement) => {
    const error = errors[name];
    const errorId = error ? `${id}-${name}-error` : undefined;
    return (
      <div className={error ? "t-field t-field-invalid" : "t-field"}>
        <label htmlFor={`${id}-${name}`}>{label}</label>
        {input(errorId)}
        {error && (
          <p className="t-field-error" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  };
  return (
    <form className="t-form" id={id} method="post" action={`${setup.action}#${id}`}>
      {attempt?.notice && (
        <p className="t-form-notice" role="alert">
          {attempt.notice}
        </p>
      )}
      <input type="hidden" name="_form" value={block.id} />
      <input type="hidden" name="_token" value={setup.token} />
      {/* Bots fill in every field; people never see this one. */}
      <div className="t-form-trap" aria-hidden="true">
        <label>
          {text.trap}
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="t-form-row">
        {field("name", text.name, (describedBy) => (
          <input id={`${id}-name`} name="name" required maxLength={200} autoComplete="name" defaultValue={values?.name} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} />
        ))}
        {field("email", text.email, (describedBy) => (
          <input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={values?.email} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} />
        ))}
      </div>
      {block.phone &&
        field("phone", text.phone, (describedBy) => (
          <input id={`${id}-phone`} name="phone" type="tel" maxLength={50} autoComplete="tel" defaultValue={values?.phone} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} />
        ))}
      {field("message", text.message, (describedBy) => (
        <textarea id={`${id}-message`} name="message" required maxLength={5000} rows={6} defaultValue={values?.message} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} />
      ))}
      <p className="t-form-privacy">
        {setup.privacyHref ? (
          <>
            {text.privacy[0]}
            <a href={setup.privacyHref}>{text.privacy[1]}</a>
            {text.privacy[2]}
          </>
        ) : (
          text.privacyPlain
        )}
      </p>
      <button className="t-button t-button-primary" type="submit">
        {block.button.trim() || (setup.english ? "Send message" : "Nachricht senden")}
      </button>
    </form>
  );
}

// In the editor the form shows how it will look; only the button label is edited in place.
function FormPreview({ block, edit }: Required<Props>) {
  const text = words.de;
  return (
    <div className="t-form" aria-label="Vorschau des Kontaktformulars">
      <div className="t-form-row">
        <div className="t-field">
          <label>{text.name}</label>
          <input disabled />
        </div>
        <div className="t-field">
          <label>{text.email}</label>
          <input disabled />
        </div>
      </div>
      {block.phone && (
        <div className="t-field">
          <label>{text.phone}</label>
          <input disabled />
        </div>
      )}
      <div className="t-field">
        <label>{text.message}</label>
        <textarea disabled rows={4} />
      </div>
      <p className="t-form-privacy">{text.privacyPlain} Der Hinweis verlinkt die Datenschutzerklärung, wenn sie in den Einstellungen gewählt ist.</p>
      <span className="t-button t-button-primary">
        <TextField value={block.button} onChange={(button) => edit({ button })} placeholder="Beschriftung" />
      </span>
    </div>
  );
}
