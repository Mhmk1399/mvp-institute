"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { signInAction, signUpAction } from "@/actions/auth";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

type Mode = "sign-in" | "sign-up";

const inputClass =
  "w-full rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10 disabled:opacity-60";

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(undefined);

    const schema = isSignUp ? signUpSchema : signInSchema;
    const parsed = schema.safeParse(
      isSignUp ? { name, email, password, confirmPassword } : { email, password },
    );
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(
          Object.entries(flat).map(([k, v]) => [k, (v as string[])[0] ?? ""]),
        ),
      );
      return;
    }

    setPending(true);
    const result = isSignUp
      ? await signUpAction(parsed.data)
      : await signInAction(parsed.data);

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

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      ) : null}

      {isSignUp ? (
        <Field id="name" label="Name" value={name} onChange={setName} error={errors.name} autoComplete="name" disabled={pending} />
      ) : null}
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" disabled={pending} />
      <Field id="password" label="Password" type="password" value={password} onChange={setPassword} error={errors.password} autoComplete={isSignUp ? "new-password" : "current-password"} disabled={pending} />
      {isSignUp ? (
        <Field id="confirmPassword" label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} autoComplete="new-password" disabled={pending} />
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-foreground/60">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/sign-up" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
