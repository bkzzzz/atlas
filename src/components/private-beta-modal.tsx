"use client";

import type { FormEvent } from "react";
import { useLanguage } from "@/components/language-provider";

type Props = {
  accessCode: string;
  error: string | null;
  isUnlocking: boolean;
  onAccessCodeChange: (value: string) => void;
  onCancel: () => void;
  onUnlock: () => void;
};

export function PrivateBetaModal({
  accessCode,
  error,
  isUnlocking,
  onAccessCodeChange,
  onCancel,
  onUnlock,
}: Props) {
  const { t } = useLanguage();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUnlock();
  }

  return (
    <div className="atlas-dialog-backdrop">
      <form
        aria-labelledby="private-beta-title"
        aria-modal="true"
        className="atlas-dialog atlas-dialog--sm"
        onSubmit={submit}
        role="dialog"
      >
        <header className="atlas-dialog__header">
          <h2 className="atlas-dialog__title" id="private-beta-title">
            {t("beta.title")}
          </h2>
          <p className="atlas-dialog__description">
            {t("beta.description")}
          </p>
        </header>
        <div className="atlas-dialog__body">
          <label className="atlas-label" htmlFor="beta-access-code">
            {t("beta.accessCode")}
            <input
              autoComplete="off"
              autoFocus
              className="atlas-control"
              disabled={isUnlocking}
              id="beta-access-code"
              onChange={(event) =>
                onAccessCodeChange(event.target.value)
              }
              required
              type="password"
              value={accessCode}
            />
          </label>
          {error && (
            <p className="atlas-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="atlas-dialog__footer">
          <button
            className="atlas-button atlas-button--quiet"
            disabled={isUnlocking}
            onClick={onCancel}
            type="button"
          >
            {t("common.cancel")}
          </button>
          <button
            className="atlas-button atlas-button--primary"
            disabled={isUnlocking}
          >
            {isUnlocking ? t("beta.unlocking") : t("beta.unlock")}
          </button>
        </footer>
      </form>
    </div>
  );
}
