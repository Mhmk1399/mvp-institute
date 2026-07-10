"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createLevelAction, updateLevelAction } from "@/actions/level";
import type { LevelActionResult } from "@/actions/level";
import type { CEFRCode } from "@/lib/models/level";
import type { LevelDTO } from "@/lib/services/level";

type LevelFormProps =
  | { mode: "create"; availableCodes: CEFRCode[] }
  | { mode: "edit"; level: LevelDTO };

const inputClass =
  "w-full rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60";

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function LevelForm(props: LevelFormProps) {
  const router = useRouter();
  const isCreate = props.mode === "create";
  const level = isCreate ? undefined : props.level;

  const [code, setCode] = useState<string>(
    isCreate ? (props.availableCodes[0] ?? "") : props.level.code,
  );
  const [name, setName] = useState(level?.name ?? "");
  const [description, setDescription] = useState(level?.description ?? "");
  const [grammar, setGrammar] = useState((level?.goals.grammar ?? []).join("\n"));
  const [vocabulary, setVocabulary] = useState(
    (level?.goals.vocabulary ?? []).join("\n"),
  );
  const [functions, setFunctions] = useState(
    (level?.goals.functions ?? []).join("\n"),
  );
  const [canDoStatements, setCanDoStatements] = useState(
    (level?.canDoStatements ?? []).join("\n"),
  );
  const [passThreshold, setPassThreshold] = useState(
    level ? String(level.passThreshold) : "0.6",
  );
  const [isActive, setIsActive] = useState(level?.isActive ?? true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(undefined);
    setPending(true);

    const content = {
      name,
      description,
      goals: {
        grammar: toLines(grammar),
        vocabulary: toLines(vocabulary),
        functions: toLines(functions),
      },
      canDoStatements: toLines(canDoStatements),
      passThreshold: Number(passThreshold),
      isActive,
    };

    let result: LevelActionResult;
    if (isCreate) {
      result = await createLevelAction({ ...content, code });
    } else {
      result = await updateLevelAction(props.level.code, content);
    }

    if (result.status === "error") {
      setErrors(
        Object.fromEntries(
          Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v[0] ?? ""]),
        ),
      );
      setFormError(result.formError);
      setPending(false);
      return;
    }

    router.push("/admin/levels");
    router.refresh();
  }

  const noCodesAvailable = isCreate && props.availableCodes.length === 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="code" className="block text-sm font-medium">
          CEFR code
        </label>
        {isCreate ? (
          <select
            id="code"
            value={code}
            disabled={pending || noCodesAvailable}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          >
            {props.availableCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <p className="rounded-lg border border-black/10 px-3 py-2 text-sm font-mono dark:border-white/15">
            {props.level.code}
          </p>
        )}
        {errors.code ? (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.code}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          value={name}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        {errors.name ? (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          disabled={pending}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
        {errors.description ? (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.description}</p>
        ) : null}
      </div>

      <LinesField
        id="grammar"
        label="Grammar goals"
        value={grammar}
        onChange={setGrammar}
        disabled={pending}
        error={errors.goals}
      />
      <LinesField
        id="vocabulary"
        label="Vocabulary goals"
        value={vocabulary}
        onChange={setVocabulary}
        disabled={pending}
      />
      <LinesField
        id="functions"
        label="Communication functions"
        value={functions}
        onChange={setFunctions}
        disabled={pending}
      />
      <LinesField
        id="canDoStatements"
        label="Can-do statements"
        value={canDoStatements}
        onChange={setCanDoStatements}
        disabled={pending}
        error={errors.canDoStatements}
      />

      <div className="flex gap-6">
        <div className="space-y-1.5">
          <label htmlFor="passThreshold" className="block text-sm font-medium">
            Pass threshold (0–1)
          </label>
          <input
            id="passThreshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={passThreshold}
            disabled={pending}
            onChange={(e) => setPassThreshold(e.target.value)}
            className={`${inputClass} w-32`}
          />
          {errors.passThreshold ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.passThreshold}
            </p>
          ) : null}
        </div>

        <label className="mt-7 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            disabled={pending}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || noCodesAvailable}
        className="w-full rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Please wait…" : isCreate ? "Create level" : "Save changes"}
      </button>
    </form>
  );
}

function LinesField({
  id,
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        <span className="ml-2 font-normal text-foreground/50">one per line</span>
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
