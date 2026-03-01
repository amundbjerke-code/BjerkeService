import { signInAction } from "@/app/actions/auth-actions";
import { Logo } from "@/components/logo";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="brand-container py-3">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="brand-card p-6 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <h1 className="mt-4 text-xl font-bold">Logg inn</h1>
          <p className="mt-1 text-sm text-brand-ink/70">Mobilvennlig drift ute på byggeplass.</p>

          {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <form action={signInAction} className="mt-4 space-y-3 text-left">
            <label className="block text-sm font-medium">
              E-post
              <input name="email" type="email" required className="brand-input mt-1" />
            </label>
            <label className="block text-sm font-medium">
              Passord
              <input name="password" type="password" required minLength={8} className="brand-input mt-1" />
            </label>
            <button className="brand-button w-full" type="submit">
              Logg inn
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}


