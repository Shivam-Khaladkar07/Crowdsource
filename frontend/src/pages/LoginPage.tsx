import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Badge } from "@/components/ui/form";

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("citizen@demo.in");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<{ email: string; full_name: string; role_id: string }[]>([]);

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  useEffect(() => {
    api<{ accounts: typeof accounts }>("/api/auth/demo-accounts")
      .then((r) => setAccounts(r.accounts))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>CivicForge prototype. Demo password for all @demo.in accounts: Demo@12345</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </div>
              <div>
                <Label>Password</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              New citizen? <Link to="/register" className="text-secondary">Create an account</Link>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Demo accounts</CardTitle>
            <CardDescription>Synthetic roles for jury walkthroughs. Not real officials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {accounts.length === 0 && <p className="text-sm text-muted-foreground">Loading demo directory…</p>}
            {accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("Demo@12345");
                }}
                className="w-full text-left rounded-md border px-3 py-2 hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{a.full_name}</span>
                  <Badge variant="warning">Demo account</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.email} · {a.role_id.replaceAll("_", " ")}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await register({
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        full_name: String(fd.get("full_name")),
        district: String(fd.get("district")),
      });
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Citizen registration</CardTitle>
          <CardDescription>New accounts start as Citizen. Other roles are provisioned by System Admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <Label>Full name</Label>
              <Input name="full_name" required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div>
              <Label>Password (min 8)</Label>
              <Input name="password" type="password" minLength={8} required />
            </div>
            <div>
              <Label>District</Label>
              <Input name="district" placeholder="e.g. Ranchi" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
