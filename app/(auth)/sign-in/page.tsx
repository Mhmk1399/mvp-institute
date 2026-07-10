import { AuthForm } from "@/components/auth-form";

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-foreground/60">Welcome back.</p>
      <AuthForm mode="sign-in" />
    </>
  );
}
