import { login } from "@/lib/actions/auth";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm border border-border">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">👟 SneakerVault</h1>
          <p className="mt-2 text-sm text-muted">Masuk ke sistem gudang</p>
        </div>
        <LoginForm action={login} />
      </div>
    </div>
  );
}
